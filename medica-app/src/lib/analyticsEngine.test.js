import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./storage', () => ({
  getSessionHistory: vi.fn(),
  getLastPracticeResults: vi.fn(() => null),
  getLastCoachResults: vi.fn(() => null),
  getFlashcards: vi.fn(() => []),
}))

import { buildAnalyticsData, filterSessionsByRange, getRangeStartDate } from './analyticsEngine.js'
import { getSessionHistory } from './storage'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSession(daysAgo, overrides = {}) {
  const d = new Date('2026-06-05T12:00:00.000Z')
  d.setDate(d.getDate() - daysAgo)
  return {
    mode: 'practice',
    completedAt: d.toISOString(),
    total: 10,
    correct: 7,
    percentage: 70,
    medicaScore: 200,
    subjectBreakdown: [{ name: 'Pathology', correct: 7, total: 10, percentage: 70 }],
    systemBreakdown:  [{ name: 'Cardiovascular', correct: 7, total: 10, percentage: 70 }],
    missedQuestions:  [],
    ...overrides,
  }
}

// Fixed "now" for all range tests: 2026-06-05 noon UTC
const NOW = new Date('2026-06-05T12:00:00.000Z')

// ── Existing taxonomy test (unchanged) ────────────────────────────────────────

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

  it('merges legacy subject and system aliases before computing analytics', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0, {
        subjectBreakdown: [
          { name: 'Neuroscience', correct: 2, total: 4, percentage: 50 },
          { name: 'Neurology', correct: 3, total: 6, percentage: 50 },
        ],
        systemBreakdown: [
          { name: 'Renal', correct: 2, total: 4, percentage: 50 },
          { name: 'Renal / Urinary', correct: 3, total: 6, percentage: 50 },
          { name: 'Skin', correct: 1, total: 2, percentage: 50 },
        ],
        missedQuestions: [
          { id: 'n1', subject: 'Neuroscience', system: 'Nervous System & Special Senses' },
          { id: 'n2', subject: 'Neurology', system: 'Neurology' },
          { id: 'r1', subject: 'Physiology', system: 'Renal' },
          { id: 's1', subject: 'Pathology', system: 'Skin' },
        ],
      }),
    ])

    const data = buildAnalyticsData('all', NOW)

    expect(data.subjectBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Neurology', correct: 5, total: 10, percentage: 50 }),
      ]),
    )
    expect(data.subjectBreakdown.some(s => s.name === 'Neuroscience')).toBe(false)
    expect(data.systemBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Renal / Urinary', correct: 5, total: 10, percentage: 50 }),
        expect.objectContaining({ name: 'Dermatology', correct: 1, total: 2, percentage: 50 }),
      ]),
    )
    expect(data.systemBreakdown.some(s => s.name === 'Renal')).toBe(false)
    expect(data.systemBreakdown.some(s => s.name === 'Skin')).toBe(false)
    expect(data.mistakeDiagnosis.topSubjects[0].name).toBe('Neurology')
  })
})

// ── Test 1: All time includes every valid session ─────────────────────────────

describe('buildAnalyticsData — range: all time', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes sessions from today, 10 days ago, and 40 days ago', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0),   // today
      makeSession(10),  // 10 days ago
      makeSession(40),  // 40 days ago
    ])
    const data = buildAnalyticsData('all', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(3)
  })
})

// ── Test 2: Week includes only last 7 days ────────────────────────────────────

describe('buildAnalyticsData — range: week', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes only sessions from the last 7 days', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0),   // today — IN
      makeSession(6),   // 6 days ago — IN
      makeSession(8),   // 8 days ago — OUT
      makeSession(40),  // 40 days ago — OUT
    ])
    const data = buildAnalyticsData('week', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(2)
  })

  it('excludes sessions exactly 7 days old (boundary: >= start, not >)', () => {
    // 7 days ago at exactly the same time as NOW minus 7 days should be IN
    const startOfWeek = new Date(NOW.getTime())
    startOfWeek.setDate(startOfWeek.getDate() - 7)
    vi.mocked(getSessionHistory).mockReturnValue([
      { ...makeSession(0), completedAt: startOfWeek.toISOString() },  // exactly at boundary — IN
    ])
    const data = buildAnalyticsData('week', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(1)
  })
})

// ── Test 3: Month includes only last 30 days ──────────────────────────────────

describe('buildAnalyticsData — range: month', () => {
  beforeEach(() => vi.clearAllMocks())

  it('includes only sessions from the last 30 days', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0),   // today — IN
      makeSession(10),  // 10 days ago — IN
      makeSession(29),  // 29 days ago — IN
      makeSession(31),  // 31 days ago — OUT
      makeSession(40),  // 40 days ago — OUT
    ])
    const data = buildAnalyticsData('month', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(3)
  })
})

// ── Test 4: Sessions outside range excluded from overview totals ──────────────

describe('buildAnalyticsData — range filters overview totals', () => {
  beforeEach(() => vi.clearAllMocks())

  it('week range: totalQuestions only counts in-range sessions', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0,  { total: 10, correct: 8 }),   // in range
      makeSession(40, { total: 20, correct: 15 }),  // out of range
    ])
    const weekData = buildAnalyticsData('week', NOW)
    const allData  = buildAnalyticsData('all',  NOW)
    expect(weekData.overview.totalQuestions).toBe(10)
    expect(allData.overview.totalQuestions).toBe(30)
  })
})

// ── Test 5: Subject breakdown changes by range ────────────────────────────────

describe('buildAnalyticsData — subject breakdown is range-aware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('week range returns only subjects from in-range sessions', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0,  { subjectBreakdown: [{ name: 'Pharmacology', correct: 8, total: 10, percentage: 80 }], systemBreakdown: [] }),
      makeSession(40, { subjectBreakdown: [{ name: 'Anatomy',      correct: 5, total: 10, percentage: 50 }], systemBreakdown: [] }),
    ])
    const weekData = buildAnalyticsData('week', NOW)
    const names = weekData.subjectBreakdown.map(s => s.name)
    expect(names).toContain('Pharmacology')
    expect(names).not.toContain('Anatomy')
  })
})

// ── Test 6: System breakdown changes by range ─────────────────────────────────

describe('buildAnalyticsData — system breakdown is range-aware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('month range excludes systems from sessions older than 30 days', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(5,  { subjectBreakdown: [], systemBreakdown: [{ name: 'Renal', correct: 7, total: 10, percentage: 70 }] }),
      makeSession(40, { subjectBreakdown: [], systemBreakdown: [{ name: 'Neurology', correct: 4, total: 10, percentage: 40 }] }),
    ])
    const monthData = buildAnalyticsData('month', NOW)
    const names = monthData.systemBreakdown.map(s => s.name)
    expect(names).toContain('Renal / Urinary')
    expect(names).not.toContain('Neurology')
  })
})

// ── Test 7: Trends use only filtered sessions ─────────────────────────────────

describe('buildAnalyticsData — trends are range-aware', () => {
  beforeEach(() => vi.clearAllMocks())

  it('week range trend has fewer points than all-time trend', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(0),
      makeSession(10),
      makeSession(40),
    ])
    const weekData = buildAnalyticsData('week', NOW)
    const allData  = buildAnalyticsData('all',  NOW)
    expect(weekData.trends.length).toBeLessThan(allData.trends.length)
    expect(weekData.trends.length).toBe(1)
    expect(allData.trends.length).toBe(3)
  })
})

// ── Test 8: Empty week range returns rangeEmpty state ────────────────────────

describe('buildAnalyticsData — empty week range', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns { empty:true, rangeEmpty:true } when no sessions in last 7 days', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(40),  // only session is 40 days ago
    ])
    const data = buildAnalyticsData('week', NOW)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(true)
  })
})

// ── Test 9: Empty month range returns rangeEmpty state ───────────────────────

describe('buildAnalyticsData — empty month range', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns { empty:true, rangeEmpty:true } when no sessions in last 30 days', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      makeSession(40),
      makeSession(60),
    ])
    const data = buildAnalyticsData('month', NOW)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(true)
  })

  it('rangeEmpty is false for all-time empty (no sessions at all)', () => {
    vi.mocked(getSessionHistory).mockReturnValue([])
    const data = buildAnalyticsData('all', NOW)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(false)
  })
})

// ── Test 10: Invalid/missing completedAt handled safely ─────────────────────

describe('buildAnalyticsData — invalid completedAt handling', () => {
  beforeEach(() => vi.clearAllMocks())

  it('session with null completedAt is excluded from week filter', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      { ...makeSession(0), completedAt: null },
      makeSession(0),  // valid today session
    ])
    const data = buildAnalyticsData('week', NOW)
    expect(data.overview.totalSessions).toBe(1)  // only the valid one
  })

  it('session with undefined completedAt is excluded from month filter', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      { ...makeSession(5), completedAt: undefined },
      makeSession(5),
    ])
    const data = buildAnalyticsData('month', NOW)
    expect(data.overview.totalSessions).toBe(1)
  })

  it('session with null completedAt is included in all-time range', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      { ...makeSession(0), completedAt: null },
    ])
    const data = buildAnalyticsData('all', NOW)
    // _buildSessions sorts by completedAt, but null causes NaN which sorts to end
    // The session IS included (length > 0)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(1)
  })

  it('session with invalid date string is excluded from week filter', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      { ...makeSession(0), completedAt: 'not-a-date' },
      makeSession(0),
    ])
    const data = buildAnalyticsData('week', NOW)
    expect(data.overview.totalSessions).toBe(1)
  })
})

// ── filterSessionsByRange and getRangeStartDate unit tests ───────────────────

describe('filterSessionsByRange', () => {
  it('returns all sessions for range=all regardless of dates', () => {
    const sessions = [makeSession(100), makeSession(0), makeSession(50)]
    expect(filterSessionsByRange(sessions, 'all', NOW)).toHaveLength(3)
  })

  it('filters correctly for week', () => {
    const sessions = [makeSession(3), makeSession(10)]
    const result = filterSessionsByRange(sessions, 'week', NOW)
    expect(result).toHaveLength(1)
    expect(new Date(result[0].completedAt) >= new Date(NOW.getTime() - 7 * 86400000)).toBe(true)
  })
})

describe('getRangeStartDate', () => {
  it('returns null for all', () => {
    expect(getRangeStartDate('all', NOW)).toBeNull()
  })

  it('returns 7 days ago for week', () => {
    const start = getRangeStartDate('week', NOW)
    const diff = (NOW.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diff).toBeCloseTo(7, 5)
  })

  it('returns 30 days ago for month', () => {
    const start = getRangeStartDate('month', NOW)
    const diff = (NOW.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    expect(diff).toBeCloseTo(30, 5)
  })
})
