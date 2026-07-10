import { exams, flashcards, questionReports } from './apiClient.js'
import { getScopedStorageKey } from './storageScope.js'

const OUTBOX_KEY = 'medica_session_sync_outbox_v1'
const OUTBOX_EVENT = 'medica:session-sync-outbox-updated'

// Per-operation-type capacity. Session saves are never silently displaced by reports
// or flashcard batches — each type has its own independent limit.
const MAX_ENTRIES_PER_TYPE = Object.freeze({
  'exam-session':    20,
  'question-report': 20,
  'flashcard-batch': 20,
})
const MAX_ATTEMPTS = 6
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const BASE_DELAY_MS = 1_500
const MAX_DELAY_MS = 5 * 60 * 1000
// Eligibility rejections (e.g. unverified email) resolve on the user's own timeline,
// not a transient-failure timeline — retry on a coarse cadence instead of the short
// exponential backoff, and never count toward MAX_ATTEMPTS/failed.
const LOCAL_ONLY_RETRY_DELAY_MS = 6 * 60 * 60 * 1000

const VALID_OP_TYPES = new Set(Object.keys(MAX_ENTRIES_PER_TYPE))

const activeDrains = new Map()

function storageKey(userId) {
  return getScopedStorageKey(OUTBOX_KEY, userId)
}

function emitUpdate(userId) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OUTBOX_EVENT, { detail: { userId } }))
}

function sanitizeError(error) {
  return String(error?.message || error || 'Synchronization failed').slice(0, 200)
}

function isValidEntry(entry, userId, now) {
  return entry
    && VALID_OP_TYPES.has(entry.operationType)
    && entry.userId === userId
    && entry.payload
    && entry.idempotencyKey
    && Number.isFinite(entry.createdAt)
    && now - entry.createdAt <= MAX_AGE_MS
}

function readEntries(userId, now = Date.now()) {
  if (typeof window === 'undefined' || !userId) return []
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]')
    if (!Array.isArray(parsed)) return []
    const valid = parsed.filter(entry => isValidEntry(entry, userId, now))
    if (valid.length !== parsed.length) writeEntries(userId, valid)
    return valid
  } catch {
    return []
  }
}

function writeEntries(userId, entries) {
  if (typeof window === 'undefined' || !userId) return false
  try {
    if (entries.length === 0) localStorage.removeItem(storageKey(userId))
    else localStorage.setItem(storageKey(userId), JSON.stringify(entries))
    emitUpdate(userId)
    return true
  } catch {
    return false
  }
}

function nextDelay(attemptCount, random = Math.random) {
  const exponential = Math.min(BASE_DELAY_MS * (2 ** Math.max(attemptCount - 1, 0)), MAX_DELAY_MS)
  return Math.round(exponential * (0.8 + random() * 0.4))
}

// Acquire an exclusive cross-tab lock for outbox mutations when the Web Locks API
// is available. Falls back to direct execution (single-tab safety via JS event loop).
function withOutboxLock(userId, fn) {
  const lockName = `medica-outbox-${userId}`
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return navigator.locks.request(lockName, { mode: 'exclusive' }, fn)
  }
  return Promise.resolve(fn())
}

async function _enqueue(operationType, payload, idempotencyKey, userId, error, now) {
  return withOutboxLock(userId, () => {
    const entries = readEntries(userId, now)
    const existingIndex = entries.findIndex(entry => entry.idempotencyKey === idempotencyKey)
    const entry = {
      operationId: idempotencyKey,
      userId,
      operationType,
      payload,
      idempotencyKey,
      createdAt:     existingIndex >= 0 ? entries[existingIndex].createdAt : now,
      attemptCount:  existingIndex >= 0 ? entries[existingIndex].attemptCount : 1,
      // Fresh entries: nextAttemptAt = now so the next drain picks them up immediately.
      // Existing entries preserve their drain-set backoff (updated on retry failures).
      nextAttemptAt: existingIndex >= 0 ? entries[existingIndex].nextAttemptAt : now,
      lastError: sanitizeError(error),
      status: 'pending',
    }

    if (existingIndex >= 0) {
      entries[existingIndex] = entry
    } else {
      const typeCount = entries.filter(e => e.operationType === operationType).length
      if (typeCount >= MAX_ENTRIES_PER_TYPE[operationType]) return null
      entries.push(entry)
    }

    return writeEntries(userId, entries) ? entry : null
  })
}

export function classifySessionSyncError(error) {
  const status = Number(error?.status || 0)
  if (status === 401) return 'paused'
  if (status === 403 && error?.code === 'REPORTER_NOT_ELIGIBLE') return 'local-only'
  if (status === 408 || status === 425 || status === 429 || status >= 500 || status === 0) return 'retryable'
  if (status >= 400 && status < 500) return 'permanent'
  return 'retryable'
}

export function getSessionSyncOutbox(userId, now = Date.now()) {
  return readEntries(String(userId || ''), now)
}

export function getSessionSyncSummary(userId, now = Date.now()) {
  const entries = readEntries(String(userId || ''), now)
  return {
    pending: entries.filter(entry => entry.status === 'pending').length,
    failed: entries.filter(entry => entry.status === 'failed').length,
    total: entries.length,
  }
}

export async function enqueueSessionSync(payload, userId, error, now = Date.now()) {
  const normalizedUserId = String(userId || '').trim()
  const idempotencyKey = String(payload?.clientSessionId || '').trim()
  if (!normalizedUserId || !idempotencyKey || !payload) return null
  return _enqueue('exam-session', payload, idempotencyKey, normalizedUserId, error, now)
}

export async function enqueueQuestionReportSync(payload, idempotencyKey, userId, error, now = Date.now()) {
  const normalizedUserId = String(userId || '').trim()
  const normalizedKey = String(idempotencyKey || '').trim()
  if (!normalizedUserId || !normalizedKey || !payload) return null
  return _enqueue('question-report', payload, normalizedKey, normalizedUserId, error, now)
}

export async function enqueueFlashcardBatchSync(cards, idempotencyKey, userId, error, now = Date.now()) {
  const normalizedUserId = String(userId || '').trim()
  const normalizedKey = String(idempotencyKey || '').trim()
  if (!normalizedUserId || !normalizedKey || !Array.isArray(cards) || cards.length === 0) return null
  return _enqueue('flashcard-batch', cards, normalizedKey, normalizedUserId, error, now)
}

export async function drainSessionSyncOutbox(userId, options = {}) {
  const normalizedUserId = String(userId || '').trim()
  if (!normalizedUserId) return { synced: 0, pending: 0, failed: 0, localOnly: 0, paused: false }
  if (activeDrains.has(normalizedUserId)) return activeDrains.get(normalizedUserId)

  const drain = (async () => {
    const now = options.now ?? Date.now()
    const random = options.random ?? Math.random
    const createSession = options.createSession ?? exams.create
    const apiCalls = options.apiCalls ?? {
      'exam-session':     (payload) => createSession(payload),
      'question-report':  (payload) => questionReports.create(payload),
      'flashcard-batch':  (cards)   => flashcards.createMany(cards),
    }
    const online = options.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false)
    const snapshot = readEntries(normalizedUserId, now)
    let synced = 0
    let localOnly = 0
    let paused = false
    // Track per-entry mutations by idempotencyKey so we can merge with any entries
    // that were enqueued concurrently during the awaits below.
    const toRemove = new Set()
    const toUpdate = new Map()
    let newlyFailed = 0

    if (!online) {
      const summary = getSessionSyncSummary(normalizedUserId, now)
      return { synced, localOnly, ...summary, paused }
    }

    for (const current of snapshot) {
      if (current.status === 'failed') continue
      if (!options.force && current.nextAttemptAt > now) continue

      const handler = apiCalls[current.operationType]
      if (!handler) continue

      try {
        await handler(current.payload)
        toRemove.add(current.idempotencyKey)
        synced += 1
      } catch (error) {
        const disposition = classifySessionSyncError(error)
        if (disposition === 'local-only') {
          // Not eligible yet (e.g. unverified email) — keep queued and retry later
          // instead of dropping it, so it still reaches shared review once the
          // user becomes eligible. attemptCount is intentionally untouched so this
          // never trips MAX_ATTEMPTS and gets marked 'failed'.
          localOnly += 1
          toUpdate.set(current.idempotencyKey, {
            ...current,
            lastError: sanitizeError(error),
            status: 'pending',
            nextAttemptAt: now + LOCAL_ONLY_RETRY_DELAY_MS,
          })
          continue
        }
        const attemptCount = current.attemptCount + 1
        const nowFailed = disposition === 'permanent' || attemptCount >= MAX_ATTEMPTS
        if (nowFailed) newlyFailed += 1

        toUpdate.set(current.idempotencyKey, {
          ...current,
          attemptCount,
          lastError: sanitizeError(error),
          status: nowFailed ? 'failed' : 'pending',
          nextAttemptAt: now + nextDelay(attemptCount, random),
        })

        if (disposition === 'paused') {
          paused = true
          break
        }
      }
    }

    // Re-read and merge under a lock so a concurrent _enqueue from another tab cannot
    // be silently overwritten between our readEntries and writeEntries calls.
    // Network requests happen OUTSIDE this lock; only the final state mutation is held.
    await withOutboxLock(normalizedUserId, () => {
      const fresh = readEntries(normalizedUserId, now)
      const merged = fresh
        .filter(e => !toRemove.has(e.idempotencyKey))
        .map(e => toUpdate.has(e.idempotencyKey) ? toUpdate.get(e.idempotencyKey) : e)
      writeEntries(normalizedUserId, merged)
    })

    const summary = getSessionSyncSummary(normalizedUserId, now)
    // `failed` reflects entries that transitioned to failed in this pass (not the total failed count),
    // so callers show the 'failed' toast only when a new failure occurred in this drain.
    return { synced, pending: summary.pending, failed: newlyFailed, localOnly, total: summary.total, paused }
  })().finally(() => activeDrains.delete(normalizedUserId))

  activeDrains.set(normalizedUserId, drain)
  return drain
}

export function subscribeSessionSyncOutbox(listener) {
  if (typeof window === 'undefined') return () => {}
  const handler = event => listener(event.detail)
  window.addEventListener(OUTBOX_EVENT, handler)
  return () => window.removeEventListener(OUTBOX_EVENT, handler)
}

export const SESSION_SYNC_OUTBOX_LIMITS = Object.freeze({
  // maxEntries is the per-type limit for the primary session type (backward compat for tests).
  maxEntries:            MAX_ENTRIES_PER_TYPE['exam-session'],
  maxEntriesPerType:     { ...MAX_ENTRIES_PER_TYPE },
  maxAttempts:           MAX_ATTEMPTS,
  maxAgeMs:              MAX_AGE_MS,
  localOnlyRetryDelayMs: LOCAL_ONLY_RETRY_DELAY_MS,
})
