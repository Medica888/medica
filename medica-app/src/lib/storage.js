import {
  enrichQuestionWithUsmleTaxonomy,
  normalizeQuestionTaxonomyFields,
  normalizeSubjectLabel,
  normalizeSystemLabel,
} from './usmleTaxonomy.js'
import { validateClinicalCard } from './flashcardValidator.js'
import { getQuestionFingerprint } from './questionDedup.js'
import { getRangeStartDate, isTimestampInRange } from './dateRange.js'
import { getCurrentUserId, questionReports as questionReportsApi } from './apiClient.js'
import { getAnonymousStorageKey, getScopedStorageKey } from './storageScope.js'
import { enqueueQuestionReportSync, drainSessionSyncOutbox } from './sessionSyncOutbox.js'
import { computeSRS } from './srsScheduler.js'

const USE_BACKEND_API = import.meta.env.VITE_USE_BACKEND_API === 'true'

const KEY = 'medica_last_quiz_config'
const SESSION_KEY = 'medica_last_quiz_session'
const QUESTION_REPORTS_KEY = 'medica_question_reports'
const TRUSTED_QUESTIONS_KEY = 'medica_trusted_generated_questions'
const TRUSTED_QUESTIONS_MAX = 500
const QUESTION_REPORTS_UPDATED_EVENT = 'medica:question-reports-updated'

function scopedKey(baseKey) {
  return getScopedStorageKey(baseKey)
}

/** @param {import('./quizTypes').QuizConfig} config */
export function saveLastQuizConfig(config) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(scopedKey(KEY), JSON.stringify(config))
  } catch { /* quota or privacy mode */ }
}

/** @returns {import('./quizTypes').QuizConfig|null} */
export function getLastQuizConfig() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(scopedKey(KEY))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLastQuizConfig() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(KEY))
  } catch { /* ignore */ }
}

/** @param {import('./quizTypes').QuizSession} session */
export function saveQuizSession(session) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(scopedKey(SESSION_KEY), JSON.stringify(session))
  } catch { /* quota or privacy mode */ }
}

/** @returns {import('./quizTypes').QuizSession|null} */
export function getLastQuizSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(scopedKey(SESSION_KEY))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLastQuizSession() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(SESSION_KEY))
  } catch { /* ignore */ }
}


export function getQuestionReports() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(scopedKey(QUESTION_REPORTS_KEY))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveQuestionReport(question, reason, context = {}) {
  if (typeof window === 'undefined' || !question?.id || !reason) return null
  try {
    const reports = getQuestionReports()
    const fingerprint = getQuestionFingerprint(question)
    const now = new Date().toISOString()
    const taggedQuestion = enrichQuestionWithUsmleTaxonomy(normalizeQuestionTaxonomyFields(question), context)
    const clientReportId = crypto.randomUUID()
    const report = {
      id: `${question.id}:${reason}`,
      clientReportId,
      questionId: String(question.id),
      fingerprint,
      reason,
      subject: taggedQuestion.subject || '',
      system: taggedQuestion.system || '',
      usmleContentArea: taggedQuestion.usmleContentArea || '',
      usmleSubdomain: taggedQuestion.usmleSubdomain || '',
      physicianTask: taggedQuestion.physicianTask || '',
      questionAngle: taggedQuestion.questionAngle || '',
      testedConcept: taggedQuestion.testedConcept || '',
      mode: context.mode || '',
      reportedAt: now,
    }
    const updated = [report, ...reports.filter(r => r.id !== report.id)].slice(0, 250)
    localStorage.setItem(scopedKey(QUESTION_REPORTS_KEY), JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent(QUESTION_REPORTS_UPDATED_EVENT))
    // Best-effort backend sync — outbox for authenticated users, fire-and-forget for anonymous.
    // Only when VITE_USE_BACKEND_API is enabled; respects the same flag as AI generation.
    if (USE_BACKEND_API) {
      const userId = getCurrentUserId()
      const backendPayload = {
        clientReportId,
        fingerprint,
        reason,
        questionId:       question?.id ?? null,
        stemPreview:      String(question?.stem || '').slice(0, 100) || null,
        testedConcept:    taggedQuestion.testedConcept || null,
        source:           context?.source ?? null,
        mode:             report.mode || null,
        difficulty:       question?.difficulty ?? null,
        requestedSubject: context?.subject ?? null,
        requestedSystem:  context?.system ?? null,
        requestedTopic:   context?.topic ?? null,
        actualSubject:    report.subject || null,
        actualSystem:     report.system || null,
        usmleContentArea: report.usmleContentArea || null,
        physicianTask:    report.physicianTask || null,
      }
      if (userId) {
        enqueueQuestionReportSync(backendPayload, clientReportId, userId, null)
          .then((queued) => {
            if (queued) drainSessionSyncOutbox(userId, { force: true })
            // queued === null means outbox is at per-type capacity; report saved locally only.
          })
          .catch(() => {})
      } else {
        questionReportsApi.create(backendPayload).catch(err => console.error('[storage] report sync failed:', err))
      }
    }
    return report
  } catch {
    return null
  }
}


export function subscribeQuestionReports(listener) {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event) => {
    if (event.key === scopedKey(QUESTION_REPORTS_KEY)) listener()
  }
  window.addEventListener(QUESTION_REPORTS_UPDATED_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(QUESTION_REPORTS_UPDATED_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

function _topCounts(items, key, limit = 3) {
  const counts = new Map()
  for (const item of items) {
    const value = String(item?.[key] || '').trim() || 'Unlabeled'
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
}

/**
 * @param {'week'|'month'|'all'} [range]
 * @param {Date} [now]
 * Reports without a valid reportedAt are excluded from week/month ranges.
 */
export function getQuestionReportAnalytics(range = 'all', now = new Date()) {
  const allReports = getQuestionReports()
  let reports = allReports
  if (range !== 'all') {
    const start = getRangeStartDate(range, now)
    reports = allReports.filter(r => isTimestampInRange(r.reportedAt, start))
  }
  const reasonLabels = {
    wrong_answer: 'Wrong answer',
    bad_explanation: 'Bad explanation',
    off_topic: 'Off topic',
    ambiguous_or_insufficient_clues: 'Ambiguous clues',
  }
  const reasonCounts = reports.reduce((acc, r) => {
    const key = r.reason || 'unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return {
    total: reports.length,
    reasons: Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, label: reasonLabels[reason] || reason, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    topConcepts: _topCounts(reports, 'testedConcept'),
    topSubjects: _topCounts(reports, 'subject'),
    topUsmleContentAreas: _topCounts(reports, 'usmleContentArea'),
    topPhysicianTasks: _topCounts(reports, 'physicianTask'),
    recent: reports.slice(0, 5),
  }
}

export function filterReportedQuestions(questions) {
  if (!questions?.length) return []
  const reports = getQuestionReports()
  if (reports.length === 0) return questions

  const reportedIds = new Set(reports.map(r => String(r.questionId || '')).filter(Boolean))
  // Guard: exclude the empty-fingerprint sentinel '||' so a question with no stem/concept
  // doesn't block every other empty-fingerprint question in the pool.
  const reportedFingerprints = new Set(
    reports.map(r => String(r.fingerprint || '')).filter(fp => fp && fp !== '||'),
  )

  return questions.filter(q => {
    const id = String(q?.id || '')
    const fingerprint = getQuestionFingerprint(q)
    return !reportedIds.has(id) && (!fingerprint || fingerprint === '||' || !reportedFingerprints.has(fingerprint))
  })
}

/**
 * Removes a previously saved report so the question re-enters the pool.
 * If `reason` is provided, only that specific report is removed.
 * If omitted, all reports for the question (matched by id or fingerprint) are removed.
 *
 * @param {string} questionId
 * @param {string|null} [reason]
 * @returns {number} count of records removed
 */
export function unreportQuestion(questionId, reason = null) {
  if (typeof window === 'undefined' || !questionId) return 0
  try {
    const reports = getQuestionReports()
    const qId = String(questionId)
    const filtered = reason
      ? reports.filter(r => r.id !== `${qId}:${reason}`)
      : reports.filter(r => String(r.questionId || '') !== qId)
    const removed = reports.length - filtered.length
    if (removed > 0) {
      localStorage.setItem(scopedKey(QUESTION_REPORTS_KEY), JSON.stringify(filtered))
      window.dispatchEvent(new CustomEvent(QUESTION_REPORTS_UPDATED_EVENT))
    }
    return removed
  } catch {
    return 0
  }
}

export function getTrustedGeneratedQuestions() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(scopedKey(TRUSTED_QUESTIONS_KEY))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function _matchesRequestedValue(requested, actual, allLabel) {
  if (!requested || requested === allLabel || requested === 'Balanced') return true
  return String(actual || '').toLowerCase() === String(requested).toLowerCase()
}

function _matchesRequestedSubject(requested, actual) {
  if (!requested || requested === 'All Subjects') return true
  return normalizeSubjectLabel(actual) === normalizeSubjectLabel(requested)
}

function _matchesRequestedSystem(requested, actual) {
  if (!requested || requested === 'All Systems') return true
  return normalizeSystemLabel(actual) === normalizeSystemLabel(requested)
}

function _matchesRequestedTopic(config, question) {
  const requested = config.clinicalFocus || config.topic || ''
  if (!String(requested).trim()) return true
  const needle = String(requested).toLowerCase()
  return [
    question.topic,
    question.testedConcept,
    question.stem,
  ].some(value => String(value || '').toLowerCase().includes(needle))
}

export function getTrustedGeneratedQuestionsForConfig(config = {}) {
  const trusted = getTrustedGeneratedQuestions()
  return trusted.filter(q => {
    if (q.mode && config.mode && q.mode !== config.mode) return false
    return _matchesRequestedSubject(config.subject, q.subject)
      && _matchesRequestedSystem(config.system, q.system)
      && _matchesRequestedValue(config.difficulty, q.difficulty, 'Balanced')
      && _matchesRequestedTopic(config, q)
  })
}

/**
 * Removes questions from trusted storage whose id or fingerprint is in `staleIds`.
 * Called when re-validation under updated rules finds a previously-trusted question
 * no longer meets quality standards - the stale entry is purged so the AI fill
 * step regenerates a fresh replacement on the next session.
 *
 * @param {Set<string>} staleIds - set of id or fingerprint strings to remove
 * @returns {number} - count of entries removed
 */
export function purgeStaleQuestionsFromTrusted(staleIds) {
  if (!staleIds?.size || typeof window === 'undefined') return 0
  try {
    const all = getTrustedGeneratedQuestions()
    const filtered = all.filter(q => {
      const id = String(q.id || '')
      const fp = q.fingerprint || getQuestionFingerprint(q)
      return !staleIds.has(id) && !staleIds.has(fp)
    })
    const removed = all.length - filtered.length
    if (removed > 0) {
      localStorage.setItem(scopedKey(TRUSTED_QUESTIONS_KEY), JSON.stringify(filtered))
    }
    return removed
  } catch {
    return 0
  }
}

export function appendTrustedGeneratedQuestions(questions, config = {}) {
  if (typeof window === 'undefined' || !questions?.length) return 0
  try {
    const existing = getTrustedGeneratedQuestions()
    const seen = new Set(existing.map(q => q.fingerprint || getQuestionFingerprint(q)))
    const now = new Date().toISOString()
    const additions = []

    for (const rawQuestion of questions) {
      const q = enrichQuestionWithUsmleTaxonomy(normalizeQuestionTaxonomyFields(rawQuestion), config)
      const fingerprint = getQuestionFingerprint(q)
      if (!fingerprint || fingerprint === '||' || seen.has(fingerprint)) continue
      seen.add(fingerprint)
      additions.push({
        id: String(q.id || fingerprint),
        fingerprint,
        stem: q.stem || '',
        options: q.options || [],
        correct: q.correct || '',
        explanation: q.explanation || '',
        subject: q.subject || '',
        system: q.system || '',
        usmleContentArea: q.usmleContentArea || '',
        usmleSubdomain: q.usmleSubdomain || '',
        physicianTask: q.physicianTask || '',
        questionAngle: q.questionAngle || '',
        topic: q.topic || '',
        testedConcept: q.testedConcept || '',
        difficulty: q.difficulty || config.difficulty || '',
        mode: config.mode || '',
        source: 'ai',
        trustedAt: now,
      })
    }

    if (additions.length > 0) {
      localStorage.setItem(scopedKey(TRUSTED_QUESTIONS_KEY), JSON.stringify([...additions, ...existing].slice(0, TRUSTED_QUESTIONS_MAX)))
    }
    return additions.length
  } catch {
    return 0
  }
}

const PRACTICE_RESULTS_KEY = 'medica_last_practice_results'

/** @param {import('./practiceScoring').PracticeResults} results */
export function savePracticeResults(results) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(scopedKey(PRACTICE_RESULTS_KEY), JSON.stringify(results))
  } catch { /* quota or privacy mode */ }
}

/** @returns {import('./practiceScoring').PracticeResults|null} */
export function getLastPracticeResults() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(scopedKey(PRACTICE_RESULTS_KEY))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearPracticeResults() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(PRACTICE_RESULTS_KEY))
  } catch { /* ignore */ }
}

const COACH_RESULTS_KEY = 'medica_last_coach_results'

/** @param {object} results */
export function saveCoachResults(results) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(scopedKey(COACH_RESULTS_KEY), JSON.stringify(results))
  } catch { /* quota or privacy mode */ }
}

/** @returns {object|null} */
export function getLastCoachResults() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(scopedKey(COACH_RESULTS_KEY))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearCoachResults() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(COACH_RESULTS_KEY))
  } catch { /* ignore */ }
}

const FLASHCARDS_KEY     = 'medica:flashcards'
const FLASHCARDS_KEY_OLD = 'medica_flashcards'
const FLASHCARD_REVIEW_EVENTS_KEY = 'medica:flashcardReviewEvents'
const FLASHCARD_REVIEW_EVENTS_MAX = 500

/** @param {object[]} cards */
export function saveFlashcards(cards) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(scopedKey(FLASHCARDS_KEY), JSON.stringify(cards))
    // Remove legacy key once we've written to the new one
    localStorage.removeItem(scopedKey(FLASHCARDS_KEY_OLD))
  } catch { /* quota or privacy mode */ }
}

/** @returns {object[]} */
export function getFlashcards() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(scopedKey(FLASHCARDS_KEY))
    if (raw) return JSON.parse(raw)
    // One-time migration from legacy key
    const legacy = localStorage.getItem(scopedKey(FLASHCARDS_KEY_OLD))
    return legacy ? JSON.parse(legacy) : []
  } catch {
    return []
  }
}

export function clearFlashcards() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(FLASHCARDS_KEY))
    localStorage.removeItem(scopedKey(FLASHCARDS_KEY_OLD))
  } catch { /* ignore */ }
}

function _normFront(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Merge new cards into the existing deck, skipping duplicates.
 * Primary key: sourceQuestionId + tag (one card type per question).
 * Secondary key: normalized front text (cross-source exact-front dedup).
 * Also deduplicates within the incoming batch itself.
 * @param {object[]} newCards
 * @returns {number} count of cards actually added
 */
export function appendFlashcards(newCards) {
  if (typeof window === 'undefined' || !newCards?.length) return 0
  try {
    const existing = getFlashcards()
    const seenPrimary = new Set(existing.map(c => `${c.sourceQuestionId}::${c.tag}`))
    const seenFronts  = new Set(existing.map(c => _normFront(c.front)).filter(Boolean))

    const toAdd = []
    for (const c of newCards) {
      if (!validateClinicalCard(c).valid) continue
      const pk = `${c.sourceQuestionId}::${c.tag}`
      const fk = _normFront(c.front)
      if (seenPrimary.has(pk)) continue
      if (fk && seenFronts.has(fk)) continue
      seenPrimary.add(pk)
      if (fk) seenFronts.add(fk)
      toAdd.push(c)
    }

    if (toAdd.length > 0) saveFlashcards([...existing, ...toAdd])
    return toAdd.length
  } catch {
    return 0
  }
}

/**
 * Update a card's review status, ease, and increment its review count.
 * @param {string} id
 * @param {'new'|'learning'|'mastered'} status
 * @param {'again'|'hard'|'good'|'easy'} [ease]
 */
export function updateFlashcardStatus(id, status, ease) {
  if (typeof window === 'undefined') return
  try {
    const cards = getFlashcards()
    const updated = cards.map(c =>
      c.id === id
        ? { ...c, reviewStatus: status, ease, reviewCount: (c.reviewCount || 0) + 1, reviewedAt: new Date().toISOString() }
        : c
    )
    saveFlashcards(updated)
  } catch { /* ignore */ }
}

/**
 * Mark a card as reviewed with a given ease rating, computing the next SRS schedule.
 * @param {string} id
 * @param {'again'|'hard'|'good'|'easy'} ease
 */
export function markFlashcardReviewed(id, ease) {
  if (typeof window === 'undefined') return
  try {
    const cards = getFlashcards()
    const card = cards.find(c => c.id === id)
    if (!card) return
    const srs = computeSRS(card, ease)
    if (!srs) return
    saveFlashcards(cards.map(c => c.id === id ? { ...c, ...srs } : c))
    recordFlashcardReviewEvent(card, ease, srs.reviewStatus)
  } catch { /* ignore */ }
}

export function getFlashcardReviewEvents() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(scopedKey(FLASHCARD_REVIEW_EVENTS_KEY))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearFlashcardReviewEvents() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(FLASHCARD_REVIEW_EVENTS_KEY))
  } catch { /* ignore */ }
}

function recordFlashcardReviewEvent(card, ease, status) {
  if (!card || !ease) return
  const event = {
    id: `fcr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    cardId: card.id,
    sourceQuestionId: card.sourceQuestionId ?? null,
    ease,
    status,
    reviewedAt: new Date().toISOString(),
    subject: card.subject ?? null,
    system: card.system ?? null,
    topic: card.topicGroup ?? card.canonicalTopic ?? card.topic ?? null,
    concept: card.testedConcept ?? card.concept ?? card.topicGroup ?? card.canonicalTopic ?? card.topic ?? null,
    tag: card.tag ?? null,
    sourceMode: card.sourceMode ?? null,
  }
  const events = getFlashcardReviewEvents()
  localStorage.setItem(scopedKey(FLASHCARD_REVIEW_EVENTS_KEY), JSON.stringify([event, ...events].slice(0, FLASHCARD_REVIEW_EVENTS_MAX)))
}

/** Reads a card's clinical recall prompt, falling back to `front` for old cards. */
export function getClinicalPrompt(card) {
  return (card && (card.clinicalPrompt ?? card.front)) || ''
}

/** Reads a card's core mechanism answer, falling back to `back` for old cards. */
export function getCoreMechanism(card) {
  return (card && (card.coreMechanism ?? card.back)) || ''
}

const WEAK_SPOT_REPAIR_KEY = 'medica_weak_spot_repair'

/** @param {object} repairState */
export function saveWeakSpotRepair(repairState) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(scopedKey(WEAK_SPOT_REPAIR_KEY), JSON.stringify(repairState))
  } catch { /* quota or privacy mode */ }
}

/** @returns {object|null} */
export function getWeakSpotRepair() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(scopedKey(WEAK_SPOT_REPAIR_KEY))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearWeakSpotRepair() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(WEAK_SPOT_REPAIR_KEY))
  } catch { /* ignore */ }
}

const SESSION_HISTORY_KEY = 'medica_session_history'
const SESSION_HISTORY_MAX = 50

export function saveCompletedSession(record) {
  if (typeof window === 'undefined') return
  try {
    const history = getSessionHistory()
    const deduped = history.filter(s => s.completedAt !== record.completedAt)
    const updated = [record, ...deduped].slice(0, SESSION_HISTORY_MAX)
    localStorage.setItem(scopedKey(SESSION_HISTORY_KEY), JSON.stringify(updated))
  } catch { /* quota or privacy mode */ }
}

export function getSessionHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(scopedKey(SESSION_HISTORY_KEY))
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearSessionHistory() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(scopedKey(SESSION_HISTORY_KEY))
  } catch { /* ignore */ }
}

const FLASHCARD_GROUPS_KEY = 'medica:flashcardGroups'
const ANONYMOUS_IMPORT_DECISION_PREFIX = 'medica:anonymous-data-decision:'

const ARRAY_MIGRATION_ENTRIES = [
  { source: QUESTION_REPORTS_KEY, target: QUESTION_REPORTS_KEY },
  { source: TRUSTED_QUESTIONS_KEY, target: TRUSTED_QUESTIONS_KEY },
  { source: FLASHCARDS_KEY, target: FLASHCARDS_KEY },
  { source: FLASHCARDS_KEY_OLD, target: FLASHCARDS_KEY },
  { source: FLASHCARD_REVIEW_EVENTS_KEY, target: FLASHCARD_REVIEW_EVENTS_KEY },
  { source: SESSION_HISTORY_KEY, target: SESSION_HISTORY_KEY },
  { source: FLASHCARD_GROUPS_KEY, target: FLASHCARD_GROUPS_KEY },
]

const OBJECT_MIGRATION_ENTRIES = [
  { source: KEY, target: KEY },
  { source: SESSION_KEY, target: SESSION_KEY },
  { source: PRACTICE_RESULTS_KEY, target: PRACTICE_RESULTS_KEY },
  { source: COACH_RESULTS_KEY, target: COACH_RESULTS_KEY },
  { source: WEAK_SPOT_REPAIR_KEY, target: WEAK_SPOT_REPAIR_KEY },
]

function readStorageValue(key) {
  const raw = localStorage.getItem(key)
  if (raw == null) return null
  try { return JSON.parse(raw) } catch { return null }
}

function migrationIdentity(item) {
  if (!item || typeof item !== 'object') return JSON.stringify(item)
  return String(
    item.id
    || item.fingerprint
    || item.completedAt
    || `${item.sourceQuestionId || ''}:${item.tag || ''}:${item.front || ''}`,
  )
}

function mergeMigrationArrays(existing, incoming) {
  const merged = []
  const seen = new Set()
  for (const item of [...existing, ...incoming]) {
    const identity = migrationIdentity(item)
    if (seen.has(identity)) continue
    seen.add(identity)
    merged.push(item)
  }
  return merged
}

function migrationDecisionKey(userId) {
  return `${ANONYMOUS_IMPORT_DECISION_PREFIX}${encodeURIComponent(String(userId || ''))}`
}

export function hasAnonymousStudyData() {
  if (typeof window === 'undefined') return false
  try {
    return [...ARRAY_MIGRATION_ENTRIES, ...OBJECT_MIGRATION_ENTRIES]
      .some(({ source }) => localStorage.getItem(getAnonymousStorageKey(source)) != null)
  } catch {
    return false
  }
}

export function hasPendingAnonymousDataMigration(userId) {
  if (!userId || !hasAnonymousStudyData()) return false
  try { return localStorage.getItem(migrationDecisionKey(userId)) == null } catch { return false }
}

export function keepAnonymousStudyDataSeparate(userId) {
  if (!userId || typeof window === 'undefined') return false
  try {
    localStorage.setItem(migrationDecisionKey(userId), 'separate')
    return true
  } catch {
    return false
  }
}

export function importAnonymousStudyData(userId) {
  if (!userId || typeof window === 'undefined') return { importedKeys: 0, importedItems: 0 }
  const plannedTargets = new Map()
  const sourceKeys = new Set()
  let importedItems = 0

  try {
    for (const { source, target } of ARRAY_MIGRATION_ENTRIES) {
      const sourceKey = getAnonymousStorageKey(source)
      const incoming = readStorageValue(sourceKey)
      if (!Array.isArray(incoming) || incoming.length === 0) continue

      const targetKey = getScopedStorageKey(target, userId)
      const plannedCurrent = plannedTargets.get(targetKey)
      const current = plannedCurrent == null ? readStorageValue(targetKey) : JSON.parse(plannedCurrent)
      const merged = mergeMigrationArrays(Array.isArray(current) ? current : [], incoming)
      plannedTargets.set(targetKey, JSON.stringify(merged))
      sourceKeys.add(sourceKey)
      importedItems += Math.max(merged.length - (Array.isArray(current) ? current.length : 0), 0)
    }

    for (const { source, target } of OBJECT_MIGRATION_ENTRIES) {
      const sourceKey = getAnonymousStorageKey(source)
      const incoming = localStorage.getItem(sourceKey)
      if (incoming == null) continue

      const targetKey = getScopedStorageKey(target, userId)
      if (!plannedTargets.has(targetKey) && localStorage.getItem(targetKey) == null) {
        plannedTargets.set(targetKey, incoming)
        importedItems += 1
      }
      sourceKeys.add(sourceKey)
    }

    const originals = new Map(
      [...plannedTargets.keys()].map(key => [key, localStorage.getItem(key)]),
    )
    const writtenTargets = []
    try {
      for (const [targetKey, value] of plannedTargets) {
        localStorage.setItem(targetKey, value)
        writtenTargets.push(targetKey)
      }
      localStorage.setItem(migrationDecisionKey(userId), 'imported')
    } catch (error) {
      for (const targetKey of writtenTargets) {
        const original = originals.get(targetKey)
        if (original == null) localStorage.removeItem(targetKey)
        else localStorage.setItem(targetKey, original)
      }
      throw error
    }

    for (const sourceKey of sourceKeys) localStorage.removeItem(sourceKey)
    return { importedKeys: sourceKeys.size, importedItems }
  } catch {
    return { importedKeys: 0, importedItems: 0, error: 'Import could not be completed' }
  }
}
