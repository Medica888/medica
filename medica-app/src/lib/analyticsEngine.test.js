import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./storage', () => ({
  getSessionHistory: vi.fn(),
  getLastPracticeResults: vi.fn(() => null),
  getLastCoachResults: vi.fn(() => null),
  getFlashcards: vi.fn(() => []),
}))

import { buildAnalyticsData } from './analyticsEngine.js'
import { getSessionHistory } from './storage'

describe('buildAnalyticsData - USMLE taxonomy analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates USMLE content areas and physician tasks into study priorities', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      {
        mode: 'practice',
        completedAt: '2026-06-01T12:00:00.000Z',
        total: 6,
        correct: 2,
        percentage: 33,
        medicaScore: 45,
        subjectBreakdown: [],
        systemBreakdown: [],
        usmleContentBreakdown: [
          { name: 'Cardiovascular System', correct: 1, total: 3, percentage: 33 },
        ],
        physicianTaskBreakdown: [
          { name: 'Patient Care: Pharmacotherapy', correct: 1, total: 3, percentage: 33 },
        ],
        missedQuestions: [],
      },
    ])

    const data = buildAnalyticsData()

    expect(data.usmleContentBreakdown[0]).toMatchObject({
      name: 'Cardiovascular System',
      total: 3,
      percentage: 33,
    })
    expect(data.physicianTaskBreakdown[0]).toMatchObject({
      name: 'Patient Care: Pharmacotherapy',
      total: 3,
      percentage: 33,
    })
    expect(data.studyPrescription.some(item => item.usmleContentArea === 'Cardiovascular System')).toBe(true)
    expect(data.studyPrescription.some(item => item.physicianTask === 'Patient Care: Pharmacotherapy')).toBe(true)
  })
})
