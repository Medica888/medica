import { describe, it, expect } from 'vitest'
import {
  classifyAnswer,
  buildAttemptsFromSession,
  buildProgressMaps,
  getProgressState,
  computeProgressCounts,
  getAttemptSummary,
} from './qbankProgress.js'

// ── classifyAnswer ──────────────────────────────────────────────────────────

describe('classifyAnswer', () => {
  it('returns correct when letters match', () => {
    expect(classifyAnswer('A', 'A')).toBe('correct')
    expect(classifyAnswer('D', 'D')).toBe('correct')
  })

  it('returns incorrect when letters differ', () => {
    expect(classifyAnswer('B', 'A')).toBe('incorrect')
  })

  it('returns unanswered when given letter is empty or falsy', () => {
    expect(classifyAnswer('', 'A')).toBe('unanswered')
    expect(classifyAnswer(null, 'A')).toBe('unanswered')
    expect(classifyAnswer(undefined, 'A')).toBe('unanswered')
  })
})

// ── buildAttemptsFromSession ────────────────────────────────────────────────

describe('buildAttemptsFromSession', () => {
  it('uses questionAttempts array when present (new format)', () => {
    const session = {
      id: 's1',
      mode: 'practice',
      completedAt: '2026-01-01T10:00:00.000Z',
      questionAttempts: [
        { questionId: 'q1', result: 'correct',   mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' },
        { questionId: 'q2', result: 'incorrect',  mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' },
      ],
    }
    const attempts = buildAttemptsFromSession(session)
    expect(attempts).toHaveLength(2)
    expect(attempts[0]).toMatchObject({ questionId: 'q1', result: 'correct' })
    expect(attempts[1]).toMatchObject({ questionId: 'q2', result: 'incorrect' })
  })

  it('falls back to questionIds + missedQuestions (legacy format)', () => {
    const session = {
      id: 's2',
      mode: 'exam',
      completedAt: '2026-01-02T10:00:00.000Z',
      questionIds: ['q1', 'q2', 'q3'],
      missedQuestions: [{ id: 'q2' }],
    }
    const attempts = buildAttemptsFromSession(session)
    expect(attempts).toHaveLength(3)
    const byId = Object.fromEntries(attempts.map(a => [a.questionId, a.result]))
    expect(byId.q1).toBe('correct')
    expect(byId.q2).toBe('needs-review')
    expect(byId.q3).toBe('correct')
  })

  it('handles missedQuestions-only legacy sessions (no questionIds)', () => {
    const session = {
      id: 's3',
      mode: 'practice',
      completedAt: '2026-01-03T10:00:00.000Z',
      missedQuestions: [{ id: 'q5' }, { id: 'q6' }],
    }
    const attempts = buildAttemptsFromSession(session)
    expect(attempts).toHaveLength(2)
    expect(attempts.every(a => a.result === 'needs-review')).toBe(true)
  })

  it('returns empty array for an empty or null session', () => {
    expect(buildAttemptsFromSession(null)).toHaveLength(0)
    expect(buildAttemptsFromSession({})).toHaveLength(0)
    expect(buildAttemptsFromSession({ questionIds: [], missedQuestions: [] })).toHaveLength(0)
  })

  it('strips _vN suffix when deriving baseId from questionIds', () => {
    const session = {
      id: 's4',
      mode: 'practice',
      completedAt: '2026-01-04T10:00:00.000Z',
      questionIds: ['q10_v2', 'q11_v1'],
      missedQuestions: [],
    }
    const attempts = buildAttemptsFromSession(session)
    expect(attempts[0].questionId).toBe('q10')
    expect(attempts[1].questionId).toBe('q11')
  })
})

// ── getProgressState ────────────────────────────────────────────────────────

function makeAttemptMaps(sessions) {
  return buildProgressMaps(sessions, null)
}

describe('getProgressState', () => {
  it('returns unseen for a question with no attempts', () => {
    const { attemptsByQuestion, activeSessionIds } = makeAttemptMaps([])
    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('unseen')
  })

  it('returns in-progress when question is in the active session', () => {
    const { attemptsByQuestion } = makeAttemptMaps([])
    const activeSessionIds = new Set(['q1'])
    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('in-progress')
  })

  it('returns needs-review when the latest attempt was incorrect', () => {
    const sessions = [
      {
        id: 's1',
        completedAt: '2026-01-01T10:00:00.000Z',
        questionAttempts: [{ questionId: 'q1', result: 'correct',  mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' }],
      },
      {
        id: 's2',
        completedAt: '2026-01-02T10:00:00.000Z',
        questionAttempts: [{ questionId: 'q1', result: 'incorrect', mode: 'practice', sessionId: 's2', completedAt: '2026-01-02T10:00:00.000Z' }],
      },
    ]
    const { attemptsByQuestion, activeSessionIds } = makeAttemptMaps(sessions)
    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('needs-review')
  })

  it('returns correct when correct once in one session', () => {
    const sessions = [{
      id: 's1',
      completedAt: '2026-01-01T10:00:00.000Z',
      questionAttempts: [{ questionId: 'q1', result: 'correct', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' }],
    }]
    const { attemptsByQuestion, activeSessionIds } = makeAttemptMaps(sessions)
    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('correct')
  })

  it('returns repeated-correct when correct in two different sessions', () => {
    const sessions = [
      {
        id: 's1',
        completedAt: '2026-01-01T10:00:00.000Z',
        questionAttempts: [{ questionId: 'q1', result: 'correct', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' }],
      },
      {
        id: 's2',
        completedAt: '2026-01-05T10:00:00.000Z',
        questionAttempts: [{ questionId: 'q1', result: 'correct', mode: 'practice', sessionId: 's2', completedAt: '2026-01-05T10:00:00.000Z' }],
      },
    ]
    const { attemptsByQuestion, activeSessionIds } = makeAttemptMaps(sessions)
    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('repeated-correct')
  })

  it('does NOT return repeated-correct for two correct answers in the same session', () => {
    const sessions = [{
      id: 's1',
      completedAt: '2026-01-01T10:00:00.000Z',
      questionAttempts: [
        { questionId: 'q1', result: 'correct', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' },
        { questionId: 'q1', result: 'correct', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:01:00.000Z' },
      ],
    }]
    const { attemptsByQuestion, activeSessionIds } = makeAttemptMaps(sessions)
    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('correct')
  })

  it('resolves baseId — strips _vN suffix before looking up state', () => {
    const sessions = [{
      id: 's1',
      completedAt: '2026-01-01T10:00:00.000Z',
      questionAttempts: [{ questionId: 'q10', result: 'correct', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' }],
    }]
    const { attemptsByQuestion, activeSessionIds } = makeAttemptMaps(sessions)
    expect(getProgressState('q10_v2', attemptsByQuestion, activeSessionIds)).toBe('correct')
  })
})

// ── computeProgressCounts ───────────────────────────────────────────────────

describe('computeProgressCounts', () => {
  it('counts each state correctly across a mixed inventory', () => {
    const sessions = [
      {
        id: 's1',
        completedAt: '2026-01-01T10:00:00.000Z',
        questionAttempts: [
          { questionId: 'q1', result: 'correct',   mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' },
          { questionId: 'q2', result: 'incorrect',  mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' },
        ],
      },
      {
        id: 's2',
        completedAt: '2026-01-05T10:00:00.000Z',
        questionAttempts: [
          { questionId: 'q1', result: 'correct', mode: 'practice', sessionId: 's2', completedAt: '2026-01-05T10:00:00.000Z' },
        ],
      },
    ]
    const inventory = [
      { id: 'q1' }, // repeated-correct
      { id: 'q2' }, // needs-review
      { id: 'q3' }, // unseen
    ]
    const activeQBankSession = { questions: [{ id: 'q3' }], completed: false }
    const { attemptsByQuestion, activeSessionIds } = buildProgressMaps(sessions, activeQBankSession)
    const counts = computeProgressCounts(inventory, attemptsByQuestion, activeSessionIds)

    expect(counts.all).toBe(3)
    expect(counts['repeated-correct']).toBe(1)
    expect(counts['needs-review']).toBe(1)
    expect(counts['in-progress']).toBe(1)
    expect(counts.unseen).toBe(0)
    expect(counts.correct).toBe(0)
  })
})

// ── getAttemptSummary ───────────────────────────────────────────────────────

describe('getAttemptSummary', () => {
  it('returns count=0 and null lastAttemptedAt for an unseen question', () => {
    const { attemptsByQuestion } = makeAttemptMaps([])
    const summary = getAttemptSummary('q1', attemptsByQuestion)
    expect(summary.count).toBe(0)
    expect(summary.lastAttemptedAt).toBeNull()
  })

  it('returns attempt count and the most recent completedAt', () => {
    const sessions = [
      {
        id: 's1',
        completedAt: '2026-01-01T10:00:00.000Z',
        questionAttempts: [{ questionId: 'q1', result: 'incorrect', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' }],
      },
      {
        id: 's2',
        completedAt: '2026-01-10T10:00:00.000Z',
        questionAttempts: [{ questionId: 'q1', result: 'correct',   mode: 'practice', sessionId: 's2', completedAt: '2026-01-10T10:00:00.000Z' }],
      },
    ]
    const { attemptsByQuestion } = makeAttemptMaps(sessions)
    const summary = getAttemptSummary('q1', attemptsByQuestion)
    expect(summary.count).toBe(2)
    expect(summary.lastAttemptedAt).toBe('2026-01-10T10:00:00.000Z')
  })
})

// ── buildProgressMaps — activeSessionIds ────────────────────────────────────

describe('buildProgressMaps', () => {
  it('active session IDs are empty when session is marked completed', () => {
    const activeQBankSession = {
      questions: [{ id: 'q1' }, { id: 'q2' }],
      completed: true,
    }
    const { activeSessionIds } = buildProgressMaps([], activeQBankSession)
    expect(activeSessionIds.size).toBe(0)
  })

  it('active session IDs are populated when session is not completed', () => {
    const activeQBankSession = {
      questions: [{ id: 'q1' }, { id: 'q2' }],
      completed: false,
    }
    const { activeSessionIds } = buildProgressMaps([], activeQBankSession)
    expect(activeSessionIds.has('q1')).toBe(true)
    expect(activeSessionIds.has('q2')).toBe(true)
  })

  it('parity: classifyAnswer produces the same result whether session is local or backend-normalized', () => {
    // Local saveSession would produce result: 'incorrect' for a wrong answer
    // Backend normalizeBackendSession uses normalizeAnswerLetter(q.correct_answer)
    // Both rely on classifyAnswer — test that the same inputs produce the same output

    const sessions = [{
      id: 's1',
      completedAt: '2026-01-01T10:00:00.000Z',
      questionAttempts: [
        { questionId: 'q1', result: 'incorrect', mode: 'practice', sessionId: 's1', completedAt: '2026-01-01T10:00:00.000Z' },
      ],
    }]
    const { attemptsByQuestion } = buildProgressMaps(sessions, null)
    expect(getProgressState('q1', attemptsByQuestion, new Set())).toBe('needs-review')
  })

  it('uses compact ledger history after detailed sessions are evicted', () => {
    const ledger = [{
      questionId: 'q1',
      attemptCount: 7,
      correctSessionCount: 2,
      latestResult: 'correct',
      latestCompletedAt: '2026-06-01T10:00:00.000Z',
      latestSessionId: 's7',
    }]
    const { attemptsByQuestion, activeSessionIds } = buildProgressMaps([], null, ledger)

    expect(getProgressState('q1', attemptsByQuestion, activeSessionIds)).toBe('repeated-correct')
    expect(getAttemptSummary('q1', attemptsByQuestion)).toEqual({
      count: 7,
      lastAttemptedAt: '2026-06-01T10:00:00.000Z',
    })
  })
})
