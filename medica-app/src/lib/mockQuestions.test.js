import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateUniqueQuestions } from './questionDedup.js'

vi.mock('./storage.js', () => ({
  getSessionHistory: vi.fn(() => []),
}))

import { getSessionHistory } from './storage.js'
import { createQuizSession, ensureQuestionCount } from './mockQuestions.js'

const baseConfig = {
  mode:          'practice',
  subject:       'All Subjects',
  system:        'All Systems',
  topic:         '',
  questionCount: 5,
  difficulty:    'Balanced',
  clinicalFocus:      '',
  coachSpecificTopic: '',
}

beforeEach(() => {
  vi.mocked(getSessionHistory).mockReturnValue([])
})

// ─── Test 1: ensureQuestionCount never clones ─────────────────────────────────

describe('ensureQuestionCount — test 1: no cloning', () => {
  it('throws INSUFFICIENT_QUESTIONS instead of cloning when pool < requested', () => {
    const pool   = [{ id: 'q1', stem: 'A', correct: 'A', options: [] }]
    const config = { questionCount: 3 }
    expect(() => ensureQuestionCount(pool, config)).toThrow('Not enough unique questions')
  })

  it('returns exact slice when pool >= requested', () => {
    const pool   = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `s${i}` }))
    const config = { questionCount: 5 }
    const result = ensureQuestionCount(pool, config)
    expect(result).toHaveLength(5)
    expect(result.every(q => pool.includes(q))).toBe(true)
  })

  it('never produces _v1 or _v2 IDs', () => {
    const pool   = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `Stem number ${i} about medicine` }))
    const config = { questionCount: 5 }
    const result = ensureQuestionCount(pool, config)
    expect(result.every(q => !q.id.includes('_v'))).toBe(true)
  })
})

// ─── Test 9/10: 40 Question Block ─────────────────────────────────────────────

describe('ensureQuestionCount — test 10: 40Q block rejects insufficient pool', () => {
  it('throws with 40Q message when pool < 40 for exam mode', () => {
    const pool   = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `Stem ${i}` }))
    const config = { questionCount: 40, mode: 'exam' }
    expect(() => ensureQuestionCount(pool, config))
      .toThrow('Not enough unique questions available for a standardized 40 Question Block.')
  })
})

describe('createQuizSession — test 9: 40Q block with too-small pool throws', () => {
  it('throws INSUFFICIENT_QUESTIONS for 40Q exam when unseen pool < 40', () => {
    // With only 27 mock questions and empty history, requesting 40 should throw
    const config = { ...baseConfig, mode: 'exam', questionCount: 40 }
    expect(() => createQuizSession(config)).toThrow('Not enough unique questions')
  })
})

// ─── Test 5: cross-session exclusion ──────────────────────────────────────────

describe('createQuizSession — test 5: excludes previously seen questions', () => {
  it('does not reuse question IDs from session history', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      { questionIds: ['q001', 'q002', 'q003'], missedQuestions: [] },
    ])
    const session = createQuizSession(baseConfig)
    const ids     = session.questions.map(q => q.id)
    expect(ids).not.toContain('q001')
    expect(ids).not.toContain('q002')
    expect(ids).not.toContain('q003')
  })
})

// ─── Test 6: fails clearly when not enough unseen questions ───────────────────

describe('createQuizSession — test 6: fails clearly when pool exhausted', () => {
  it('throws INSUFFICIENT_QUESTIONS when all questions have been seen', () => {
    // Mark all 27 questions as seen (q001-q024 + qLD001-qLD003)
    const allIds = [
      ...Array.from({ length: 24 }, (_, i) => `q${String(i + 1).padStart(3, '0')}`),
      'qLD001', 'qLD002', 'qLD003',
    ]
    vi.mocked(getSessionHistory).mockReturnValue([
      { questionIds: allIds, missedQuestions: [] },
    ])
    const config = { ...baseConfig, questionCount: 3 }
    expect(() => createQuizSession(config)).toThrow('Not enough unique questions')
  })
})

// ─── Tests 12–14: no duplicates per mode ─────────────────────────────────────

describe('createQuizSession — test 12: coach mode no duplicates', () => {
  it('produces unique questions in coach mode', () => {
    const config  = { ...baseConfig, mode: 'coach', questionCount: 3 }
    const session = createQuizSession(config)
    const result  = validateUniqueQuestions(session.questions)
    expect(result.valid).toBe(true)
  })
})

describe('createQuizSession — test 13: practice mode no duplicates', () => {
  it('produces unique questions in practice mode', () => {
    const session = createQuizSession({ ...baseConfig, mode: 'practice', questionCount: 5 })
    const result  = validateUniqueQuestions(session.questions)
    expect(result.valid).toBe(true)
  })
})

describe('createQuizSession — test 14: exam mode no duplicates', () => {
  it('produces unique questions in exam mode', () => {
    const session = createQuizSession({ ...baseConfig, mode: 'exam', questionCount: 10 })
    const result  = validateUniqueQuestions(session.questions)
    expect(result.valid).toBe(true)
  })
})

// ─── Test 15: session metadata ────────────────────────────────────────────────

describe('createQuizSession — test 15: session metadata is written', () => {
  it('includes all required session metadata fields', () => {
    const session = createQuizSession(baseConfig)
    expect(session.source).toBe('mock-fallback')
    expect(session.questionSource).toBe('mock-fallback')
    expect(typeof session.generatedAt).toBe('string')
    expect(session.requestedQuestionCount).toBe(baseConfig.questionCount)
    expect(typeof session.uniqueQuestionCount).toBe('number')
    expect(session.hasDuplicateQuestions).toBe(false)
    expect(session.hasClonedQuestions).toBe(false)
    expect(session.hasReusedQuestions).toBe(false)
    expect(typeof session.excludedPreviousQuestionCount).toBe('number')
    expect(session.generationConfigSnapshot).toMatchObject({ mode: 'practice' })
  })
})
