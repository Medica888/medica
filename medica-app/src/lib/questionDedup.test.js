import { describe, it, expect } from 'vitest'
import {
  getBaseQuestionId,
  validateUniqueQuestions,
  buildSeenState,
  filterUnseenQuestions,
} from './questionDedup.js'

const q = (id, stem, testedConcept = '') => ({ id, stem, testedConcept })

describe('getBaseQuestionId', () => {
  it('strips _v1, _v2 clone suffixes', () => {
    expect(getBaseQuestionId('q001_v1')).toBe('q001')
    expect(getBaseQuestionId('q001_v12')).toBe('q001')
    expect(getBaseQuestionId('q001')).toBe('q001')
  })
})

describe('validateUniqueQuestions — test 2: duplicate IDs rejected', () => {
  it('flags questions with the same id', () => {
    const questions = [q('q1', 'Stem A'), q('q1', 'Stem B')]
    const result    = validateUniqueQuestions(questions)
    expect(result.valid).toBe(false)
    expect(result.duplicates[0].reason).toBe('duplicate_id')
  })
})

describe('validateUniqueQuestions — test 3: duplicate base IDs rejected', () => {
  it('flags a _v1 clone whose base ID has already been seen', () => {
    const questions = [q('q1', 'Original stem about cardiology'), q('q1_v1', 'Clone stem about cardiology')]
    const result    = validateUniqueQuestions(questions)
    expect(result.valid).toBe(false)
    expect(result.duplicates[0].reason).toBe('duplicate_base_id')
  })
})

describe('validateUniqueQuestions — test 4: duplicate normalized stems rejected', () => {
  it('flags questions whose stems normalize to the same string', () => {
    const stem    = 'A 68-year-old man presents with chest pain'
    const variant = 'a  68-year-old man presents with chest pain!!!'
    const questions = [q('q1', stem), q('q2', variant)]
    const result    = validateUniqueQuestions(questions)
    expect(result.valid).toBe(false)
    expect(result.duplicates[0].reason).toBe('duplicate_stem')
  })
})

describe('validateUniqueQuestions — test 11: rejects multiple duplicates in a large set', () => {
  it('detects all duplicates across 40 questions', () => {
    const unique    = Array.from({ length: 27 }, (_, i) => q(`q${i}`, `Unique stem number ${i} about medicine`))
    const clones    = [q('q0_v1', 'Unique stem number 0 about medicine'), q('q1_v1', 'Unique stem number 1 about medicine')]
    const questions = [...unique, ...clones]
    const result    = validateUniqueQuestions(questions)
    expect(result.valid).toBe(false)
    expect(result.duplicates).toHaveLength(2)
  })
})

describe('validateUniqueQuestions — pass case', () => {
  it('accepts an entirely unique set', () => {
    const questions = Array.from({ length: 10 }, (_, i) => q(`q${i}`, `Distinct clinical vignette number ${i}`))
    const result    = validateUniqueQuestions(questions)
    expect(result.valid).toBe(true)
    expect(result.uniqueCount).toBe(10)
  })
})

describe('buildSeenState', () => {
  it('collects questionIds from history', () => {
    const history   = [{ questionIds: ['q001', 'q002'], missedQuestions: [] }]
    const seenState = buildSeenState(history)
    expect(seenState.seenIds.has('q001')).toBe(true)
    expect(seenState.seenBaseIds.has('q001')).toBe(true)
  })

  it('handles missing questionIds gracefully', () => {
    const history   = [{ missedQuestions: [{ id: 'q005', stem: 'Some stem text' }] }]
    const seenState = buildSeenState(history)
    expect(seenState.seenIds.has('q005')).toBe(true)
  })
})

describe('filterUnseenQuestions', () => {
  it('excludes questions whose IDs appear in seenState', () => {
    const seenState = buildSeenState([{ questionIds: ['q001'], missedQuestions: [] }])
    const pool      = [q('q001', 'First stem'), q('q002', 'Second stem')]
    const result    = filterUnseenQuestions(pool, seenState)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('q002')
  })

  it('excludes clone variants of seen questions', () => {
    const seenState = buildSeenState([{ questionIds: ['q001'], missedQuestions: [] }])
    const pool      = [q('q001_v1', 'Cloned stem'), q('q002', 'Fresh stem')]
    const result    = filterUnseenQuestions(pool, seenState)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('q002')
  })
})
