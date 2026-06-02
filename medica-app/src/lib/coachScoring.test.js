import { describe, expect, it } from 'vitest'
import { calculateCoachResults } from './coachScoring.js'

const makeQuestion = (id, correctAnswer) => ({
  id,
  correctAnswer,
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  difficulty: 'Balanced',
})

describe('calculateCoachResults', () => {
  it('prefers correct over correctAnswer when both are present', () => {
    const session = {
      questions: [{ ...makeQuestion('q1', 'A'), correct: 'B' }],
      answers: { q1: 'B' },
    }

    const result = calculateCoachResults(session)

    expect(result.correct).toBe(1)
    expect(result.missedQuestions).toHaveLength(0)
  })

  it('falls back to correctAnswer when correct is absent', () => {
    const session = {
      questions: [makeQuestion('q1', 'C')],
      answers: { q1: 'c' },
    }

    const result = calculateCoachResults(session)

    expect(result.correct).toBe(1)
    expect(result.missedQuestions).toHaveLength(0)
  })

  it('tracks USMLE task weakness in coach results', () => {
    const session = {
      questions: [
        {
          ...makeQuestion('q1', 'A'),
          usmleContentArea: 'Cardiovascular System',
          physicianTask: 'Patient Care: Pharmacotherapy',
        },
        {
          ...makeQuestion('q2', 'A'),
          usmleContentArea: 'Cardiovascular System',
          physicianTask: 'Patient Care: Pharmacotherapy',
        },
      ],
      answers: { q1: 'B', q2: 'B' },
    }

    const result = calculateCoachResults(session)

    expect(result.physicianTaskBreakdown[0]).toMatchObject({
      name: 'Patient Care: Pharmacotherapy',
      percentage: 0,
    })
    expect(result.weakAreas.some(w => w.type === 'Physician Task')).toBe(true)
  })
})
