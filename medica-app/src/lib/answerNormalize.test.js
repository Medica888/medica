import { describe, expect, it } from 'vitest'
import {
  ANSWER_LETTERS,
  getQuestionCorrectLetter,
  normalizeAnswerLetter,
  normalizeOptions,
} from './answerNormalize.js'

describe('answerNormalize', () => {
  it('normalizes answer letters from common answer shapes', () => {
    expect(normalizeAnswerLetter('a')).toBe('A')
    expect(normalizeAnswerLetter('B. Beta blocker')).toBe('B')
    expect(normalizeAnswerLetter(2)).toBe('C')
    expect(normalizeAnswerLetter('E. Correct fifth option')).toBe('E')
    expect(normalizeAnswerLetter('L. Twelfth option')).toBe('L')
    expect(normalizeAnswerLetter(11)).toBe('L')
    expect(normalizeAnswerLetter('1')).toBe('')
    expect(normalizeAnswerLetter('M. Beyond supported Step-style range')).toBe('')
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

  it('preserves answer options through L for longer Step-style option sets', () => {
    expect(normalizeOptions([
      'A. Alpha',
      'B. Beta',
      'C. Gamma',
      'D. Delta',
      'E. Epsilon',
      { letter: 'l', text: 'Twelfth option' },
      'M. Unsupported thirteenth option',
    ])).toEqual([
      { letter: 'A', text: 'Alpha' },
      { letter: 'B', text: 'Beta' },
      { letter: 'C', text: 'Gamma' },
      { letter: 'D', text: 'Delta' },
      { letter: 'E', text: 'Epsilon' },
      { letter: 'L', text: 'Twelfth option' },
    ])
  })

  it('prefers canonical correct over legacy correctAnswer', () => {
    expect(getQuestionCorrectLetter({ correct: 'C', correctAnswer: 'A' })).toBe('C')
  })

  it('falls back to legacy correctAnswer when correct is missing', () => {
    expect(getQuestionCorrectLetter({ correctAnswer: 'D' })).toBe('D')
  })

  it('supports backend correct_answer when app aliases are missing', () => {
    expect(getQuestionCorrectLetter({ correct_answer: 'b' })).toBe('B')
  })

  it('supports correct answers through option L', () => {
    expect(getQuestionCorrectLetter({ correct: 'L' })).toBe('L')
    expect(getQuestionCorrectLetter({ correct: 'M' })).toBe('')
  })

  it('treats correct: 0 as option A instead of falling through as missing', () => {
    expect(getQuestionCorrectLetter({ correct: 0 })).toBe('A')
  })

  it('treats correct: 1 as option B', () => {
    expect(getQuestionCorrectLetter({ correct: 1 })).toBe('B')
  })

  it('falls back past an empty-string correct to the next alias', () => {
    expect(getQuestionCorrectLetter({ correct: '', correctAnswer: 'D' })).toBe('D')
  })

  it('falls back past an empty-string correct and correctAnswer to correct_answer', () => {
    expect(getQuestionCorrectLetter({ correct: '', correctAnswer: '', correct_answer: 'C' })).toBe('C')
  })

  it('lets canonical correct: 0 override a conflicting correctAnswer alias', () => {
    expect(getQuestionCorrectLetter({ correct: 0, correctAnswer: 'D' })).toBe('A')
  })

  // ─── Duplicate option letters (malformed/imported data) ────────────────────

  it('relabels options positionally when incoming data has a duplicate option letter', () => {
    expect(normalizeOptions([
      { letter: 'A', text: 'First A' },
      { letter: 'A', text: 'Second A (malformed duplicate)' },
      { letter: 'B', text: 'Beta' },
    ])).toEqual([
      { letter: 'A', text: 'First A' },
      { letter: 'B', text: 'Second A (malformed duplicate)' },
      { letter: 'C', text: 'Beta' },
    ])
  })

  it('relabels duplicate string-shape options the same way', () => {
    expect(normalizeOptions(['A. First A', 'A. Second A', 'B. Beta'])).toEqual([
      { letter: 'A', text: 'First A' },
      { letter: 'B', text: 'Second A' },
      { letter: 'C', text: 'Beta' },
    ])
  })

  it('caps relabeling at option L for a duplicate-lettered set longer than 12', () => {
    const options = Array.from({ length: 13 }, (_, i) => ({ letter: 'A', text: `Option ${i}` }))
    const result = normalizeOptions(options)
    expect(result).toHaveLength(12)
    expect(result.map(o => o.letter)).toEqual(ANSWER_LETTERS)
  })

  it('does not relabel when option letters are already unique, even out of order', () => {
    expect(normalizeOptions([
      { letter: 'B', text: 'Beta' },
      { letter: 'A', text: 'Alpha' },
    ])).toEqual([
      { letter: 'B', text: 'Beta' },
      { letter: 'A', text: 'Alpha' },
    ])
  })
})
