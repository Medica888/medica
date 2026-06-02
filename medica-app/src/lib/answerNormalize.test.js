import { describe, expect, it } from 'vitest'
import {
  getQuestionCorrectLetter,
  normalizeAnswerLetter,
  normalizeOptions,
} from './answerNormalize.js'

describe('answerNormalize', () => {
  it('normalizes answer letters from common answer shapes', () => {
    expect(normalizeAnswerLetter('a')).toBe('A')
    expect(normalizeAnswerLetter('B. Beta blocker')).toBe('B')
    expect(normalizeAnswerLetter(2)).toBe('C')
    expect(normalizeAnswerLetter('X')).toBe('')
  })

  it('normalizes option arrays from string and object shapes', () => {
    expect(normalizeOptions(['A. ACE inhibitor', 'B. ARB'])).toEqual([
      { letter: 'A', text: 'ACE inhibitor' },
      { letter: 'B', text: 'ARB' },
    ])
    expect(normalizeOptions([{ id: 0, label: 'ATP' }, { letter: 'b', text: 'DNA' }])).toEqual([
      { letter: 'A', text: 'ATP' },
      { letter: 'B', text: 'DNA' },
    ])
  })

  it('prefers canonical correct over legacy correctAnswer', () => {
    expect(getQuestionCorrectLetter({ correct: 'C', correctAnswer: 'A' })).toBe('C')
  })

  it('falls back to legacy correctAnswer when correct is missing', () => {
    expect(getQuestionCorrectLetter({ correctAnswer: 'D' })).toBe('D')
  })
})
