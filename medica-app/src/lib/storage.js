import { enrichQuestionWithUsmleTaxonomy } from './usmleTaxonomy.js'
import { validateClinicalCard } from './flashcardValidator.js'
import { getQuestionFingerprint } from './questionDedup.js'
import { getRangeStartDate, isTimestampInRange } from './dateRange.js'

const KEY = 'medica_last_quiz_config'
const SESSION_KEY = 'medica_last_quiz_session'
const QUESTION_REPORTS_KEY = 'medica_question_reports'
const TRUSTED_QUESTIONS_KEY = 'medica_trusted_generated_questions'
const TRUSTED_QUESTIONS_MAX = 500
const QUESTION_REPORTS_UPDATED_EVENT = 'medica:question-reports-updated'

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


export function getQuestionReports() {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(QUESTION_REPORTS_KEY)
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
    const taggedQuestion = enrichQuestionWithUsmleTaxonomy(question, context)
    const report = {
      id: `${question.id}:${reason}`,
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
    localStorage.setItem(QUESTION_REPORTS_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent(QUESTION_REPORTS_UPDATED_EVENT))
    // Best-effort backend sync — fire-and-forget, never blocks the UI
    _postReportToBackend(report, question, context)
    return report
  } catch {
    return null
  }
}

/**
 * Fire-and-forget: mirrors the local report to the backend so cross-user
 * quarantine thresholds can accumulate.  Silently swallows all errors —
 * localStorage is the primary store; backend is best-effort.
 *
 * Only runs when VITE_USE_BACKEND_API === 'true' (i.e. the backend is reachable).
 * The backend route uses optionalAuth so unauthenticated reports are accepted.
 */
function _postReportToBackend(report, question, context) {
  if (typeof window === 'undefined') return
  if (typeof fetch === 'undefined') return
  // Env guard — mirrors the convention used in generateAIQuestions.js
  try {
    if (import.meta.env?.VITE_USE_BACKEND_API !== 'true') return
  } catch {
    return
  }
  fetch('/api/question-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fingerprint:      report.fingerprint,
      reason:           report.reason,
      questionId:       question?.id ?? null,
      stemPreview:      String(question?.stem || '').slice(0, 100) || null,
      testedConcept:    report.testedConcept || null,
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
    }),
  }).catch(() => { /* silently ignore — local save is primary */ })
}

export function subscribeQuestionReports(listener) {
  if (typeof window === 'undefined') return () => {}
  const onStorage = (event) => {
    if (event.key === QUESTION_REPORTS_KEY) listener()
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
      localStorage.setItem(QUESTION_REPORTS_KEY, JSON.stringify(filtered))
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
    const raw = localStorage.getItem(TRUSTED_QUESTIONS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function _matchesRequestedValue(requested, actual, allLabel) {
  if (!requested || requested === allLabel || requested === 'Balanced') return true
  return String(actual || '').toLowerCase() === String(requested).toLowerCase()
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
    return _matchesRequestedValue(config.subject, q.subject, 'All Subjects')
      && _matchesRequestedValue(config.system, q.system, 'All Systems')
      && _matchesRequestedValue(config.difficulty, q.difficulty, 'Balanced')
      && _matchesRequestedTopic(config, q)
  })
}

/**
 * Removes questions from trusted storage whose id or fingerprint is in `staleIds`.
 * Called when re-validation under updated rules finds a previously-trusted question
 * no longer meets quality standards — the stale entry is purged so the AI fill
 * step regenerates a fresh replacement on the next session.
 *
 * @param {Set<string>} staleIds  — set of id or fingerprint strings to remove
 * @returns {number}              — count of entries removed
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
      localStorage.setItem(TRUSTED_QUESTIONS_KEY, JSON.stringify(filtered))
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
      const q = enrichQuestionWithUsmleTaxonomy(rawQuestion, config)
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
      localStorage.setItem(TRUSTED_QUESTIONS_KEY, JSON.stringify([...additions, ...existing].slice(0, TRUSTED_QUESTIONS_MAX)))
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
 * Mark a card as reviewed with a given ease rating.
 * Simple MVP logic: easy -> mastered; again/hard -> learning;
 * good -> mastered if reviewCount >= 2, otherwise learning.
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
