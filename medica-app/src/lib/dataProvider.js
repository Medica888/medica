/**
 * dataProvider — thin adapter layer over apiClient + localStorage.
 *
 * When VITE_USE_BACKEND=true all reads/writes go to the TypeScript backend
 * (port 4000). Otherwise the existing localStorage layer is used unchanged.
 *
 * This file never touches question generation — that remains in
 * generateAIQuestions.js / VITE_USE_BACKEND_API.
 */

import * as api from './apiClient.js';
import { getQuestionCorrectLetter, normalizeAnswerLetter } from './answerNormalize.js';
import { normalizeQuestionTaxonomyFields } from './usmleTaxonomy.js';
import { fetchAllBackendSessions } from './sessionNormalizer.js';
import {
  saveCompletedSession,
  getSessionHistory,
  appendFlashcards,
  markFlashcardReviewed,
  updateFlashcardStatus,
  getFlashcards,
  saveFlashcards as _storageSaveFlashcards,
  clearFlashcards as _storageFlashcards,
} from './storage.js';

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND === 'true';

// ── Session persistence ───────────────────────────────────────────────────

/**
 * Save a completed session.
 * results — output of calculatePracticeResults / calculateCoachResults
 * sessionWithAnswers — full session object with questions array and answers dict
 * Written to localStorage first; backend post is best-effort.
 */
export async function saveSession(results, sessionWithAnswers) {
  const questionIds = (sessionWithAnswers?.questions || []).map(q => q.id);
  const mode = results.mode ?? sessionWithAnswers?.mode ?? 'practice';
  saveCompletedSession({ ...results, mode, questionIds });

  if (!USE_BACKEND) return;

  try {
    const questions = sessionWithAnswers?.questions ?? [];
    const answers   = sessionWithAnswers?.answers   ?? {};

    const mapQuestion = (q) => {
      const normalized = normalizeQuestionTaxonomyFields(q);
      return {
        id:               q.id,
        text:             q.stem ?? '',
        options:          (q.options || []).map(o => (typeof o === 'string' ? o : o.text ?? '')),
        correct_answer:   getQuestionCorrectLetter(q),
        explanation:      q.explanation      ?? '',
        subject:          normalized.subject ?? '',
        system:           normalized.system  ?? '',
        difficulty:       q.difficulty       ?? '',
        pearl:            q.pearl            ?? '',
        testedConcept:    q.testedConcept    ?? '',
        weakSpotCategory: q.weakSpotCategory ?? '',
        topic:            q.topic            ?? '',
        canonicalTopic:   q.canonicalTopic   ?? '',
        topicSlug:        q.topicSlug        ?? '',
        topicSource:      q.topicSource      ?? '',
        usmleContentArea: normalized.usmleContentArea ?? '',
        usmleSubdomain:   q.usmleSubdomain   ?? '',
        physicianTask:    normalized.physicianTask    ?? '',
        questionAngle:    q.questionAngle    ?? '',
        commonTrap:       q.commonTrap       ?? '',
        memoryAnchor:     q.memoryAnchor     ?? '',
      };
    };

    const payload = {
      mode,
      questions:         questions.map(mapQuestion),
      answers,
      score:             results.correct    ?? 0,
      percentage:        results.percentage ?? 0,
      medica_score:      results.medicaScore ?? 0,
      readiness_label:   results.readinessLabel ?? '',
      subject_breakdown: _arrayToRecord(results.subjectBreakdown),
      system_breakdown:  _arrayToRecord(results.systemBreakdown),
      missed_questions:  questions
        .filter(q => {
          const ans = answers[q.id];
          if (!ans) return true;
          return normalizeAnswerLetter(ans) !== getQuestionCorrectLetter(q);
        })
        .map(mapQuestion),
      completed_at:      results.completedAt ?? new Date().toISOString(),
      duration_seconds:  sessionWithAnswers?.totalTime ?? 0,
      difficulty:        sessionWithAnswers?.config?.difficulty ?? 'Balanced',
    };
    await api.exams.create(payload);
  } catch (err) {
    console.warn('[dataProvider] Backend session save failed:', err.message);
  }
}

/** Get session history — backend-first for authenticated users, localStorage fallback. */
export async function getSessions() {
  if (!USE_BACKEND || !api.isAuthenticated?.()) {
    return getSessionHistory();
  }
  try {
    return await fetchAllBackendSessions();
  } catch (err) {
    console.warn('[dataProvider] Session fetch failed, falling back:', err.message);
    return getSessionHistory();
  }
}

// ── Flashcards ────────────────────────────────────────────────────────────

const SYNC_FLAG_PREFIX   = 'medica_flashcards_synced_v9_';
const SYNC_DIRTY_PREFIX  = 'medica_flashcards_dirty_v9_';
const VALID_TYPES        = new Set(['Recall', 'Pearl', 'Application', 'Trap', 'Comparison']);
const VALID_STATUS       = new Set(['new', 'learning', 'review', 'mastered']);
const VALID_EASE         = new Set(['again', 'hard', 'good', 'easy']);
const VALID_PRIORITY     = new Set(['low', 'normal', 'high']);
const UUID_RE            = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function _mapCardToBackendPayload(c) {
  return {
    source_question_id:     c.sourceQuestionId ?? c.id ?? '',
    type:                   VALID_TYPES.has(c.type) ? c.type : 'Recall',
    front:                  c.front,
    back:                   c.back,
    tag:                    c.tag ?? '',
    review_status:          VALID_STATUS.has(c.reviewStatus) ? c.reviewStatus : 'new',
    subject:                c.subject ?? '',
    system:                 c.system ?? '',
    topic:                  c.topic ?? '',
    canonical_topic:        c.canonicalTopic ?? '',
    topic_slug:             c.topicSlug ?? '',
    source_mode:            c.sourceMode ?? '',
    memory_anchor:          c.memoryAnchor ?? null,
    common_trap:            c.commonTrap ?? null,
    source_pearl:           c.sourcePearl ?? null,
    weak_spot_category:     c.weakSpotCategory ?? '',
    reinforcement_priority: VALID_PRIORITY.has(c.reinforcementPriority) ? c.reinforcementPriority : 'normal',
    review_count:           Number.isInteger(c.reviewCount) ? c.reviewCount : 0,
    ease:                   VALID_EASE.has(c.ease) ? c.ease : null,
    last_missed_reason:     c.lastMissedReason ?? null,
  };
}

function _setFlag(key) {
  try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
}

function _clearFlag(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function _markDirty() {
  const userId = api.getCurrentUserId?.();
  if (userId) _setFlag(`${SYNC_DIRTY_PREFIX}${userId}`);
}

function _resolveBackendId(localId) {
  const card = getFlashcards().find(c => c.id === localId);
  if (card?.backendId) return card.backendId;
  if (UUID_RE.test(localId)) return localId;
  return null;
}

function _writeBackendIds(createdCards) {
  if (!Array.isArray(createdCards) || createdCards.length === 0) return;
  const local = getFlashcards();
  let changed = false;
  const byKey = new Map(
    local.map(c => [`${c.sourceQuestionId ?? c.id ?? ''}::${c.tag ?? ''}`, c]),
  );
  for (const bc of createdCards) {
    const key = `${bc.source_question_id ?? ''}::${bc.tag ?? ''}`;
    const card = byKey.get(key);
    if (card && !card.backendId && bc.id) {
      card.backendId = bc.id;
      changed = true;
    }
  }
  if (changed) _storageSaveFlashcards(local);
}

/**
 * Save flashcards generated after a session.
 * Written to localStorage first; backend is best-effort.
 */
export async function saveFlashcards(cards) {
  const incomingCards = Array.isArray(cards) ? cards : [];
  const beforeKeys = new Set(getFlashcards().map(_flashcardIdentity));
  const added = appendFlashcards(incomingCards);
  const savedCards = getFlashcards().filter((card) => !beforeKeys.has(_flashcardIdentity(card)));
  const result = {
    added,
    skipped: Math.max(incomingCards.length - added, 0),
    total: incomingCards.length,
    backendAttempted: false,
    backendSynced: false,
  };

  if (!USE_BACKEND || !added || !api.isAuthenticated?.() || savedCards.length === 0) {
    return result;
  }

  const _syncUserId = api.getCurrentUserId?.() ?? '';

  try {
    const mapped = savedCards.map(_mapCardToBackendPayload);
    result.backendAttempted = true;
    const created = await api.flashcards.createMany(mapped);
    _writeBackendIds(created?.flashcards ?? []);
    result.backendSynced = true;
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard save failed:', err.message);
    if (_syncUserId) _setFlag(`${SYNC_DIRTY_PREFIX}${_syncUserId}`);
  }

  return result;
}

/**
 * One-time sync of localStorage flashcards into the backend for authenticated users.
 * Idempotent: uses a per-user localStorage flag as an optimization, and always
 * fetches existing backend cards to filter duplicates before sending.
 * Does not delete localStorage cards. Does not set the flag on failure.
 */
export async function syncLocalFlashcardsToBackend() {
  if (!USE_BACKEND) return { skipped: true, reason: 'backend disabled' };
  if (!api.isAuthenticated?.()) return { skipped: true, reason: 'unauthenticated' };
  const userId = api.getCurrentUserId?.() ?? '';
  if (!userId) return { skipped: true, reason: 'unresolvable user id' };

  const flagKey  = `${SYNC_FLAG_PREFIX}${userId}`;
  const dirtyKey = `${SYNC_DIRTY_PREFIX}${userId}`;
  try {
    const alreadySynced = typeof localStorage !== 'undefined' && localStorage.getItem(flagKey) === '1';
    const isDirty       = typeof localStorage !== 'undefined' && localStorage.getItem(dirtyKey) === '1';
    if (alreadySynced && !isDirty) {
      return { skipped: true, reason: 'already synced' };
    }
  } catch { /* ignore */ }

  const localCards = getFlashcards().filter(c => c.front && c.back);
  if (localCards.length === 0) {
    _setFlag(flagKey);
    _clearFlag(dirtyKey);
    return { synced: 0, skipped: false };
  }

  const allMapped = localCards.map(_mapCardToBackendPayload);

  try {
    const existing = await api.flashcards.list();
    const backendCards = existing?.flashcards ?? [];
    const existingKeys = new Set(backendCards.map(c => `${c.source_question_id}::${c.tag ?? ''}`));
    const toSync = allMapped.filter(c => !existingKeys.has(`${c.source_question_id}::${c.tag}`));

    if (toSync.length > 0) {
      const created = await api.flashcards.createMany(toSync);
      _writeBackendIds(created?.flashcards ?? []);
    }
    _setFlag(flagKey);
    _clearFlag(dirtyKey);
    return { synced: toSync.length, skipped: false };
  } catch (err) {
    console.warn('[dataProvider] Local flashcard sync failed:', err.message);
    return { synced: 0, skipped: false, error: err.message };
  }
}

export async function setFlashcardStatus(id, status) {
  updateFlashcardStatus(id, status);

  if (!USE_BACKEND || !api.isAuthenticated?.()) return;
  const backendId = _resolveBackendId(id);
  if (!backendId) { _markDirty(); return; }
  try {
    await api.flashcards.updateStatus(backendId, status);
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard status update failed:', err.message);
    _markDirty();
  }
}

export async function reviewFlashcard(id, ease) {
  markFlashcardReviewed(id, ease);

  if (!USE_BACKEND || !api.isAuthenticated?.()) return;
  const backendId = _resolveBackendId(id);
  if (!backendId) { _markDirty(); return; }
  try {
    await api.flashcards.markReviewed(backendId, ease);
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard review failed:', err.message);
    _markDirty();
  }
}

export async function clearFlashcards() {
  _storageFlashcards();

  if (!USE_BACKEND || !api.isAuthenticated?.()) return;
  try {
    await api.flashcards.clearAll();
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard clear failed:', err.message);
  }
}

export function getAllFlashcards() {
  return getFlashcards();
}

function _mapBackendCardToFrontend(c) {
  return {
    id:                    c.id,
    front:                 c.front,
    back:                  c.back,
    tag:                   c.tag ?? '',
    type:                  c.type ?? 'Recall',
    reviewStatus:          c.review_status ?? 'new',
    subject:               c.subject ?? '',
    system:                c.system ?? '',
    topic:                 c.topic ?? '',
    sourceQuestionId:      c.source_question_id ?? '',
    canonicalTopic:        c.canonical_topic ?? '',
    topicSlug:             c.topic_slug ?? '',
    sourceMode:            c.source_mode ?? '',
    memoryAnchor:          c.memory_anchor ?? null,
    commonTrap:            c.common_trap ?? null,
    sourcePearl:           c.source_pearl ?? null,
    weakSpotCategory:      c.weak_spot_category ?? '',
    reinforcementPriority: c.reinforcement_priority ?? 'normal',
    reviewCount:           c.review_count ?? 0,
    ease:                  c.ease ?? null,
    lastMissedReason:      c.last_missed_reason ?? null,
    createdAt:             c.created_at ?? null,
    reviewedAt:            c.reviewed_at ?? null,
    interval:              c.interval_days ?? 0,
    nextReview:            c.next_review ? new Date(c.next_review).toISOString() : null,
  };
}

/**
 * Fetch flashcards from the backend for authenticated users.
 * Returns null when the backend is disabled, the user is not authenticated,
 * or the call fails — callers should treat null as "keep current state".
 */
export async function getBackendFlashcards() {
  if (!USE_BACKEND || !api.isAuthenticated?.()) return null;
  try {
    const data = await api.flashcards.list();
    const cards = data?.flashcards ?? [];
    return cards.map(_mapBackendCardToFrontend);
  } catch (err) {
    console.warn('[dataProvider] Backend flashcard read failed:', err.message);
    return null;
  }
}

// Content fields written from backend → local for both id-match and key-match cards.
const _BACKEND_CONTENT_FIELDS = [
  'front', 'back', 'subject', 'system', 'topic',
  'canonicalTopic', 'topicSlug', 'sourceMode', 'tag', 'type',
  'memoryAnchor', 'commonTrap', 'sourcePearl',
  'weakSpotCategory', 'reinforcementPriority', 'lastMissedReason',
  'createdAt',
];

// SRS fields written from backend → local only when backend.reviewedAt is newer.
// This handles cross-device sync correctly and prevents stale backend data from
// overwriting a more recent local review.
const _BACKEND_SRS_FIELDS = [
  'reviewStatus', 'reviewCount', 'reviewedAt', 'ease', 'interval', 'nextReview',
];

function _isNewerReviewedAt(backendTs, localTs) {
  const b = backendTs ? new Date(backendTs).getTime() : NaN;
  if (isNaN(b)) return false; // backend has no review history → keep local
  const l = localTs ? new Date(localTs).getTime() : NaN;
  return isNaN(l) || b > l;  // local never reviewed, or backend is genuinely newer
}

function _normFront(s) {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Upsert backend cards into localStorage.
 *
 * Both id-match and key-match paths:
 *   Content fields (front, back, metadata): overwrite with backend non-null values.
 *   SRS fields (reviewStatus, interval, nextReview, …): only overwrite when
 *   backend.reviewedAt is strictly newer than local.reviewedAt. This handles
 *   cross-device sync correctly without clobbering recent local reviews.
 *
 * No match: card inserted with backend UUID as id (cross-device population).
 * Secondary dedup: normalized front text prevents visible duplicates.
 *
 * Returns count of new cards inserted (updates are not counted).
 */
export function importBackendFlashcards(backendCards) {
  if (!Array.isArray(backendCards) || backendCards.length === 0) return 0;

  const local    = getFlashcards();
  const merged   = local.map(c => ({ ...c }));
  const byId     = new Map(merged.map(c => [c.id, c]));
  const byKey    = new Map(merged.map(c => [`${c.sourceQuestionId ?? ''}::${c.tag ?? ''}`, c]));
  const frontSet = new Set(merged.map(c => _normFront(c.front)).filter(Boolean));

  let added = 0;
  for (const bc of backendCards) {
    const key      = `${bc.sourceQuestionId ?? ''}::${bc.tag ?? ''}`;
    const idMatch  = byId.get(bc.id);
    const keyMatch = idMatch ? null : byKey.get(key);
    const local_   = idMatch ?? keyMatch;

    if (local_) {
      for (const field of _BACKEND_CONTENT_FIELDS) {
        if (bc[field] != null) local_[field] = bc[field];
      }
      if (_isNewerReviewedAt(bc.reviewedAt, local_.reviewedAt)) {
        for (const field of _BACKEND_SRS_FIELDS) {
          if (bc[field] != null) local_[field] = bc[field];
        }
      }
      local_.backendId = bc.id;
    } else {
      const nf = _normFront(bc.front);
      if (nf && frontSet.has(nf)) continue;
      const card = { ...bc, backendId: bc.id };
      merged.push(card);
      if (bc.id) byId.set(bc.id, card);
      byKey.set(key, card);
      if (nf) frontSet.add(nf);
      added++;
    }
  }

  _storageSaveFlashcards(merged);
  return added;
}

// ── Analytics (backend-only reads) ───────────────────────────────────────

/**
 * Fetch server-side analytics. Returns null when backend is disabled or
 * the call fails — callers should fall back to the local analyticsEngine.
 */
export async function getBackendAnalytics() {
  if (!USE_BACKEND) return null;
  try {
    return await api.analytics.get();
  } catch (err) {
    console.warn('[dataProvider] Backend analytics fetch failed:', err.message);
    return null;
  }
}

export async function getProgressGains() {
  if (!USE_BACKEND) return null;
  try {
    const { gains } = await api.analytics.progress();
    return gains;
  } catch (err) {
    console.warn('[dataProvider] Backend progress fetch failed:', err.message);
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _arrayToRecord(arr) {
  if (!arr) return {};
  if (Array.isArray(arr)) {
    return Object.fromEntries(
      arr.map(({ name, ...rest }) => [name, rest]),
    );
  }
  return arr;
}

function _flashcardIdentity(card) {
  const source = card?.sourceQuestionId ?? card?.source_question_id ?? '';
  const tag = card?.tag ?? '';
  const front = (card?.front ?? '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${source}::${tag}::${front}`;
}
