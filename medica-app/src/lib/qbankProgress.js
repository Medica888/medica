import { getBaseQuestionId } from './questionDedup.js'
import { normalizeAnswerLetter } from './answerNormalize.js'

const ATTEMPT_RESULTS = new Set(['correct', 'incorrect', 'unanswered', 'needs-review'])

function normalizeAttemptResult(result) {
  return ATTEMPT_RESULTS.has(result) ? result : 'needs-review'
}

/**
 * Classify a given answer letter against the correct letter.
 * Used by both dataProvider (local) and sessionNormalizer (backend) to keep
 * the result computation identical across storage paths.
 */
export function classifyAnswer(givenLetter, correctLetter) {
  const given = normalizeAnswerLetter(givenLetter)
  const correct = normalizeAnswerLetter(correctLetter)
  if (!given) return 'unanswered'
  if (!correct) return 'needs-review'
  return given === correct ? 'correct' : 'incorrect'
}

/**
 * Derive canonical attempt records from one completed session.
 * Supports: new format (questionAttempts[]) and legacy format (questionIds + missedQuestions).
 */
export function buildAttemptsFromSession(session) {
  if (Array.isArray(session?.questionAttempts) && session.questionAttempts.length > 0) {
    return session.questionAttempts.map(a => ({
      questionId: getBaseQuestionId(String(a.questionId || '')),
      result: normalizeAttemptResult(a.result),
      mode: a.mode || session.mode || 'practice',
      sessionId: a.sessionId || session.id || '',
      completedAt: a.completedAt || session.completedAt || '',
    }))
  }

  const { questionIds, missedQuestions, mode, id: sessionId, completedAt } = session || {}
  const attempts = []

  if (Array.isArray(questionIds) && questionIds.length > 0) {
    const missedSet = new Set(
      (missedQuestions || [])
        .map(q => {
          const raw = q?.id ?? (typeof q === 'string' ? q : null)
          return raw ? getBaseQuestionId(String(raw)) : null
        })
        .filter(Boolean),
    )
    for (const rawId of questionIds) {
      const baseId = getBaseQuestionId(String(rawId || ''))
      if (!baseId) continue
      attempts.push({
        questionId: baseId,
        result: missedSet.has(baseId) ? 'needs-review' : 'correct',
        mode: mode || 'practice',
        sessionId: sessionId || '',
        completedAt: completedAt || '',
      })
    }
    return attempts
  }

  for (const q of (missedQuestions || [])) {
    const raw = q?.id ?? (typeof q === 'string' ? q : null)
    if (!raw) continue
    const baseId = getBaseQuestionId(String(raw))
    if (!baseId) continue
    attempts.push({
      questionId: baseId,
      result: 'needs-review',
      mode: mode || 'practice',
      sessionId: sessionId || '',
      completedAt: completedAt || '',
    })
  }

  return attempts
}

/**
 * Build lookup maps for progress computation from all sessions and an optional
 * active (in-progress) QBank session.
 *
 * Returns:
 *   attemptsByQuestion — Map<baseId, attempt[]>
 *   activeSessionIds   — Set<baseId> of questions in the current live session
 */
export function buildProgressMaps(sessions, activeQBankSession, progressLedger = []) {
  const attemptsByQuestion = new Map()

  for (const session of (sessions || [])) {
    for (const attempt of buildAttemptsFromSession(session)) {
      if (!attempt.questionId) continue
      const list = attemptsByQuestion.get(attempt.questionId)
      if (list) list.push(attempt)
      else attemptsByQuestion.set(attempt.questionId, [attempt])
    }
  }

  for (const entry of (progressLedger || [])) {
    const questionId = getBaseQuestionId(String(entry?.questionId || ''))
    if (!questionId) continue
    const aggregate = {
      questionId,
      result: normalizeAttemptResult(entry.latestResult),
      mode: entry.latestMode || 'practice',
      sessionId: entry.latestSessionId || '',
      completedAt: entry.latestCompletedAt || '',
      attemptCount: Math.max(0, Number(entry.attemptCount) || 0),
      repeatedCorrect: Number(entry.correctSessionCount) >= 2,
      isAggregate: true,
    }
    const list = attemptsByQuestion.get(questionId)
    if (list) list.push(aggregate)
    else attemptsByQuestion.set(questionId, [aggregate])
  }

  const activeSessionIds = new Set()
  if (activeQBankSession && !activeQBankSession.completed) {
    for (const q of (activeQBankSession.questions || [])) {
      const baseId = getBaseQuestionId(String(q?.id || ''))
      if (baseId) activeSessionIds.add(baseId)
    }
  }

  return { attemptsByQuestion, activeSessionIds }
}

/**
 * Determine the progress state for one question.
 * States: 'unseen' | 'in-progress' | 'needs-review' | 'correct' | 'repeated-correct'
 */
export function getProgressState(questionId, attemptsByQuestion, activeSessionIds) {
  const baseId = getBaseQuestionId(String(questionId || ''))

  if (activeSessionIds.has(baseId)) return 'in-progress'

  const attempts = attemptsByQuestion.get(baseId)
  if (!attempts || attempts.length === 0) return 'unseen'

  const sorted = [...attempts].sort((a, b) => {
    const ta = a.completedAt || ''
    const tb = b.completedAt || ''
    if (ta !== tb) return ta < tb ? -1 : 1
    return (a.sessionId || '').localeCompare(b.sessionId || '')
  })

  const latest = sorted[sorted.length - 1]
  if (latest.result !== 'correct') return 'needs-review'

  const hadEarlierCorrect = latest.repeatedCorrect || sorted.some(
    a => a.result === 'correct' && a.sessionId !== latest.sessionId,
  )
  return hadEarlierCorrect ? 'repeated-correct' : 'correct'
}

/** Count each progress state across the full inventory. */
export function computeProgressCounts(inventory, attemptsByQuestion, activeSessionIds) {
  const counts = {
    all: inventory.length,
    unseen: 0,
    'in-progress': 0,
    'needs-review': 0,
    correct: 0,
    'repeated-correct': 0,
  }
  for (const q of inventory) {
    const state = getProgressState(q.id, attemptsByQuestion, activeSessionIds)
    counts[state] = (counts[state] || 0) + 1
  }
  return counts
}

/** Return { count, lastAttemptedAt } for display in a question row. */
export function getAttemptSummary(questionId, attemptsByQuestion) {
  const baseId = getBaseQuestionId(String(questionId || ''))
  const attempts = attemptsByQuestion.get(baseId)
  if (!attempts || attempts.length === 0) return { count: 0, lastAttemptedAt: null }
  const latest = attempts.reduce(
    (best, a) => ((a.completedAt || '') > (best.completedAt || '') ? a : best),
    attempts[0],
  )
  const directCount = attempts.filter(a => !a.isAggregate).length
  const aggregateCount = attempts.reduce(
    (count, attempt) => Math.max(count, Number(attempt.attemptCount) || 0),
    0,
  )
  return { count: Math.max(directCount, aggregateCount), lastAttemptedAt: latest.completedAt || null }
}
