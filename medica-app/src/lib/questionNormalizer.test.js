import { afterEach, describe, expect, it, vi } from 'vitest'
import { shuffleQuestionOptions } from './questionNormalizer.js'

describe('shuffleQuestionOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves a rare longer option set and keeps the correct option reachable after shuffle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const shuffled = shuffleQuestionOptions({
      id: 'rare-six-option-question',
      stem: 'A longer Step-style item with six plausible answer choices?',
      options: [
        { letter: 'A', text: 'Alpha distractor' },
        { letter: 'B', text: 'Beta distractor' },
        { letter: 'C', text: 'Gamma distractor' },
        { letter: 'D', text: 'Delta distractor' },
        { letter: 'E', text: 'Correct fifth answer' },
        { letter: 'F', text: 'Zeta distractor' },
      ],
      correct: 'E',
      optionExplanations: {
        A: 'Alpha is wrong.',
        B: 'Beta is wrong.',
        C: 'Gamma is wrong.',
        D: 'Delta is wrong.',
        E: 'Correct fifth answer is correct.',
        F: 'Zeta is wrong.',
      },
    })

    expect(shuffled.options).toHaveLength(6)
    expect(shuffled.options.map(option => option.letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect(shuffled.options.find(option => option.letter === shuffled.correct)?.text).toBe('Correct fifth answer')
    expect(Object.keys(shuffled.optionExplanations).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('caps unsupported imported options beyond L before rendering', () => {
    const shuffled = shuffleQuestionOptions({
      id: 'too-many-options',
      options: Array.from({ length: 13 }, (_, i) => ({
        letter: String.fromCharCode(65 + i),
        text: `Option ${i + 1}`,
      })),
      correct: 'L',
    })

    expect(shuffled.options).toHaveLength(12)
    expect(shuffled.options.at(-1).letter).toBe('L')
  })

  it('keeps a correct answer of L selectable and scorable after shuffle (12-option ceiling)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)

    const twelveOptions = Array.from({ length: 12 }, (_, i) => ({
      letter: String.fromCharCode(65 + i),
      text: i === 11 ? 'Correct twelfth answer' : `Distractor ${i + 1}`,
    }))

    const shuffled = shuffleQuestionOptions({
      id: 'twelve-option-question',
      options: twelveOptions,
      correct: 'L',
    })

    expect(shuffled.options).toHaveLength(12)
    expect(shuffled.correct).toBeTruthy()
    const correctOption = shuffled.options.find(option => option.letter === shuffled.correct)
    expect(correctOption?.text).toBe('Correct twelfth answer')
  })

  it('always points the shuffled correct letter at an actual rendered option (property check across many shuffles)', () => {
    const question = {
      id: 'invariant-check',
      options: [
        { letter: 'A', text: 'Alpha' },
        { letter: 'B', text: 'Beta' },
        { letter: 'C', text: 'Gamma' },
        { letter: 'D', text: 'Delta' },
        { letter: 'E', text: 'Epsilon - correct' },
      ],
      correct: 'E',
    }

    for (let i = 0; i < 25; i++) {
      const shuffled = shuffleQuestionOptions(question)
      const renderedLetters = shuffled.options.map(option => option.letter)
      expect(renderedLetters).toContain(shuffled.correct)
      expect(shuffled.options.find(option => option.letter === shuffled.correct)?.text).toBe('Epsilon - correct')
    }
  })

  it('never produces an unwinnable question - throws when the correct letter has no matching option', () => {
    const corrupt = {
      id: 'corrupt-orphan-correct',
      options: [
        { letter: 'A', text: 'Alpha' },
        { letter: 'B', text: 'Beta' },
        { letter: 'C', text: 'Gamma' },
        { letter: 'D', text: 'Delta' },
      ],
      correct: 'F', // no option F exists
    }

    expect(() => shuffleQuestionOptions(corrupt)).toThrow()
    try {
      shuffleQuestionOptions(corrupt)
    } catch (err) {
      expect(err.code).toBe('UNWINNABLE_QUESTION')
    }
  })
})
