const KEY = 'medica_last_quiz_config'
const SESSION_KEY = 'medica_last_quiz_session'

/** @param {import('./quizTypes').QuizConfig} config */
export function saveLastQuizConfig(config) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify(config))
  } catch { /* quota or privacy mode */ }
}

/** @returns {import('./quizTypes').QuizConfig|null} */
export function getLastQuizConfig() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLastQuizConfig() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch { /* ignore */ }
}

/** @param {import('./quizTypes').QuizSession} session */
export function saveQuizSession(session) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch { /* quota or privacy mode */ }
}

/** @returns {import('./quizTypes').QuizSession|null} */
export function getLastQuizSession() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearLastQuizSession() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

const PRACTICE_RESULTS_KEY = 'medica_last_practice_results'

/** @param {import('./practiceScoring').PracticeResults} results */
export function savePracticeResults(results) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PRACTICE_RESULTS_KEY, JSON.stringify(results))
  } catch { /* quota or privacy mode */ }
}

/** @returns {import('./practiceScoring').PracticeResults|null} */
export function getLastPracticeResults() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(PRACTICE_RESULTS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearPracticeResults() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(PRACTICE_RESULTS_KEY)
  } catch { /* ignore */ }
}

const COACH_RESULTS_KEY = 'medica_last_coach_results'

/** @param {object} results */
export function saveCoachResults(results) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(COACH_RESULTS_KEY, JSON.stringify(results))
  } catch { /* quota or privacy mode */ }
}

/** @returns {object|null} */
export function getLastCoachResults() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(COACH_RESULTS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearCoachResults() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(COACH_RESULTS_KEY)
  } catch { /* ignore */ }
}

const FLASHCARDS_KEY     = 'medica:flashcards'
const FLASHCARDS_KEY_OLD = 'medica_flashcards'

/** @param {object[]} cards */
export function saveFlashcards(cards) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(FLASHCARDS_KEY, JSON.stringify(cards))
    // Remove legacy key once we've written to the new one
    localStorage.removeItem(FLASHCARDS_KEY_OLD)
  } catch { /* quota or privacy mode */ }
}

/** @returns {object[]} */
export function getFlashcards() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(FLASHCARDS_KEY)
    if (raw) return JSON.parse(raw)
    // One-time migration from legacy key
    const legacy = localStorage.getItem(FLASHCARDS_KEY_OLD)
    return legacy ? JSON.parse(legacy) : []
  } catch {
    return []
  }
}

export function clearFlashcards() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(FLASHCARDS_KEY)
    localStorage.removeItem(FLASHCARDS_KEY_OLD)
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
 * Mark a card as reviewed with a given ease rating.
 * Simple MVP logic: easy → mastered; again/hard → learning;
 * good → mastered if reviewCount >= 2, otherwise learning.
 * @param {string} id
 * @param {'again'|'hard'|'good'|'easy'} ease
 */
export function markFlashcardReviewed(id, ease) {
  if (typeof window === 'undefined') return
  try {
    const cards = getFlashcards()
    const card = cards.find(c => c.id === id)
    if (!card) return
    let status
    if (ease === 'easy') {
      status = 'mastered'
    } else if (ease === 'good') {
      status = (card.reviewCount || 0) >= 2 ? 'mastered' : 'learning'
    } else {
      status = 'learning'
    }
    updateFlashcardStatus(id, status, ease)
  } catch { /* ignore */ }
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
    localStorage.setItem(WEAK_SPOT_REPAIR_KEY, JSON.stringify(repairState))
  } catch { /* quota or privacy mode */ }
}

/** @returns {object|null} */
export function getWeakSpotRepair() {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(WEAK_SPOT_REPAIR_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearWeakSpotRepair() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(WEAK_SPOT_REPAIR_KEY)
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
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(updated))
  } catch { /* quota or privacy mode */ }
}

export function getSessionHistory() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function clearSessionHistory() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(SESSION_HISTORY_KEY)
  } catch { /* ignore */ }
}
