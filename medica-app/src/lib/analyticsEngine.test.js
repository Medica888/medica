import { describe, expect, it } from 'vitest'

import { buildAnalyticsData, filterSessionsByRange, getRangeStartDate } from './analyticsEngine.js'

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
    // Trust boundary (Phase 1): trusted analytics only aggregate sessions the
    // centralized policy permits. These fixtures represent ordinary, already-
    // synced sessions, so they default to a trusted classification — trust
    // filtering itself has its own dedicated describe block below.
    integrityStatus: 'client_selected_verified',
    ...overrides,
  }
}

// Fixed "now" for all range tests: 2026-06-05 noon UTC
const NOW = new Date('2026-06-05T12:00:00.000Z')

// ── Existing taxonomy test (unchanged) ────────────────────────────────────────

describe('buildAnalyticsData - USMLE taxonomy analytics', () => {
  it('aggregates USMLE content areas and physician tasks into study priorities', () => {
    const data = buildAnalyticsData({ sessions: [
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
        integrityStatus: 'client_selected_verified',
      },
    ] })

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
    const data = buildAnalyticsData({ sessions: [
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
    ] }, 'all', NOW)

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
  it('includes sessions from today, 10 days ago, and 40 days ago', () => {
    const data = buildAnalyticsData({ sessions: [
      makeSession(0),   // today
      makeSession(10),  // 10 days ago
      makeSession(40),  // 40 days ago
    ] }, 'all', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(3)
  })
})

// ── Test 2: Week includes only last 7 days ────────────────────────────────────

describe('buildAnalyticsData — range: week', () => {
  it('includes only sessions from the last 7 days', () => {
    const data = buildAnalyticsData({ sessions: [
      makeSession(0),   // today — IN
      makeSession(6),   // 6 days ago — IN
      makeSession(8),   // 8 days ago — OUT
      makeSession(40),  // 40 days ago — OUT
    ] }, 'week', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(2)
  })

  it('excludes sessions exactly 7 days old (boundary: >= start, not >)', () => {
    const startOfWeek = new Date(NOW.getTime())
    startOfWeek.setDate(startOfWeek.getDate() - 7)
    const data = buildAnalyticsData({ sessions: [
      { ...makeSession(0), completedAt: startOfWeek.toISOString() },  // exactly at boundary — IN
    ] }, 'week', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(1)
  })
})

// ── Test 3: Month includes only last 30 days ──────────────────────────────────

describe('buildAnalyticsData — range: month', () => {
  it('includes only sessions from the last 30 days', () => {
    const data = buildAnalyticsData({ sessions: [
      makeSession(0),   // today — IN
      makeSession(10),  // 10 days ago — IN
      makeSession(29),  // 29 days ago — IN
      makeSession(31),  // 31 days ago — OUT
      makeSession(40),  // 40 days ago — OUT
    ] }, 'month', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(3)
  })
})

// ── Test 4: Sessions outside range excluded from overview totals ──────────────

describe('buildAnalyticsData — range filters overview totals', () => {
  it('week range: totalQuestions only counts in-range sessions', () => {
    const sessions = [
      makeSession(0,  { total: 10, correct: 8 }),   // in range
      makeSession(40, { total: 20, correct: 15 }),  // out of range
    ]
    const weekData = buildAnalyticsData({ sessions }, 'week', NOW)
    const allData  = buildAnalyticsData({ sessions }, 'all',  NOW)
    expect(weekData.overview.totalQuestions).toBe(10)
    expect(allData.overview.totalQuestions).toBe(30)
  })
})

// ── Test 5: Subject breakdown changes by range ────────────────────────────────

describe('buildAnalyticsData — subject breakdown is range-aware', () => {
  it('week range returns only subjects from in-range sessions', () => {
    const sessions = [
      makeSession(0,  { subjectBreakdown: [{ name: 'Pharmacology', correct: 8, total: 10, percentage: 80 }], systemBreakdown: [] }),
      makeSession(40, { subjectBreakdown: [{ name: 'Anatomy',      correct: 5, total: 10, percentage: 50 }], systemBreakdown: [] }),
    ]
    const weekData = buildAnalyticsData({ sessions }, 'week', NOW)
    const names = weekData.subjectBreakdown.map(s => s.name)
    expect(names).toContain('Pharmacology')
    expect(names).not.toContain('Anatomy')
  })
})

// ── Test 6: System breakdown changes by range ─────────────────────────────────

describe('buildAnalyticsData — system breakdown is range-aware', () => {
  it('month range excludes systems from sessions older than 30 days', () => {
    const data = buildAnalyticsData({ sessions: [
      makeSession(5,  { subjectBreakdown: [], systemBreakdown: [{ name: 'Renal', correct: 7, total: 10, percentage: 70 }] }),
      makeSession(40, { subjectBreakdown: [], systemBreakdown: [{ name: 'Neurology', correct: 4, total: 10, percentage: 40 }] }),
    ] }, 'month', NOW)
    const names = data.systemBreakdown.map(s => s.name)
    expect(names).toContain('Renal / Urinary')
    expect(names).not.toContain('Neurology')
  })
})

// ── Test 7: Trends use only filtered sessions ─────────────────────────────────

describe('buildAnalyticsData — trends are range-aware', () => {
  it('week range trend has fewer points than all-time trend', () => {
    const sessions = [
      makeSession(0),
      makeSession(10),
      makeSession(40),
    ]
    const weekData = buildAnalyticsData({ sessions }, 'week', NOW)
    const allData  = buildAnalyticsData({ sessions }, 'all',  NOW)
    expect(weekData.trends.length).toBeLessThan(allData.trends.length)
    expect(weekData.trends.length).toBe(1)
    expect(allData.trends.length).toBe(3)
  })
})

// ── Test 8: Empty week range returns rangeEmpty state ────────────────────────

describe('buildAnalyticsData — empty week range', () => {
  it('returns { empty:true, rangeEmpty:true } when no sessions in last 7 days', () => {
    const data = buildAnalyticsData({ sessions: [
      makeSession(40),  // only session is 40 days ago
    ] }, 'week', NOW)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(true)
  })
})

// ── Test 9: Empty month range returns rangeEmpty state ───────────────────────

describe('buildAnalyticsData — empty month range', () => {
  it('returns { empty:true, rangeEmpty:true } when no sessions in last 30 days', () => {
    const data = buildAnalyticsData({ sessions: [
      makeSession(40),
      makeSession(60),
    ] }, 'month', NOW)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(true)
  })

  it('rangeEmpty is false for all-time empty (no sessions at all)', () => {
    const data = buildAnalyticsData({ sessions: [] }, 'all', NOW)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(false)
  })
})

// ── Test 10: Invalid/missing completedAt handled safely ─────────────────────

describe('buildAnalyticsData — invalid completedAt handling', () => {
  it('session with null completedAt is excluded from week filter', () => {
    const data = buildAnalyticsData({ sessions: [
      { ...makeSession(0), completedAt: null },
      makeSession(0),  // valid today session
    ] }, 'week', NOW)
    expect(data.overview.totalSessions).toBe(1)  // only the valid one
  })

  it('session with undefined completedAt is excluded from month filter', () => {
    const data = buildAnalyticsData({ sessions: [
      { ...makeSession(5), completedAt: undefined },
      makeSession(5),
    ] }, 'month', NOW)
    expect(data.overview.totalSessions).toBe(1)
  })

  it('session with null completedAt is included in all-time range', () => {
    const data = buildAnalyticsData({ sessions: [
      { ...makeSession(0), completedAt: null },
    ] }, 'all', NOW)
    // _buildSessions sorts by completedAt, but null causes NaN which sorts to end
    // The session IS included (length > 0)
    expect(data.empty).toBe(false)
    expect(data.overview.totalSessions).toBe(1)
  })

  it('session with invalid date string is excluded from week filter', () => {
    const data = buildAnalyticsData({ sessions: [
      { ...makeSession(0), completedAt: 'not-a-date' },
      makeSession(0),
    ] }, 'week', NOW)
    expect(data.overview.totalSessions).toBe(1)
  })
})

// ── Test 11: storageData edge cases ──────────────────────────────────────────

describe('buildAnalyticsData — storageData edge cases', () => {
  it('returns { empty:true, rangeEmpty:false } when storageData is null', () => {
    const data = buildAnalyticsData(null)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(false)
  })

  it('returns { empty:true, rangeEmpty:false } when storageData is undefined', () => {
    const data = buildAnalyticsData(undefined)
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(false)
  })

  it('returns { empty:true, rangeEmpty:false } when sessions key is missing', () => {
    const data = buildAnalyticsData({})
    expect(data.empty).toBe(true)
    expect(data.rangeEmpty).toBe(false)
  })
})

// ── Test 12: flashcardsData computed from passed flashcards ──────────────────

describe('buildAnalyticsData — flashcardsData from storageData', () => {
  it('counts due and mastered from flashcards array', () => {
    const flashcards = [
      { reviewStatus: 'new' },
      { reviewStatus: 'learning' },
      { reviewStatus: 'mastered' },
      { reviewStatus: 'mastered' },
    ]
    const data = buildAnalyticsData({ sessions: [makeSession(0)], flashcards }, 'all', NOW)
    expect(data.flashcardsData.total).toBe(4)
    expect(data.flashcardsData.due).toBe(2)
    expect(data.flashcardsData.mastered).toBe(2)
    expect(data.overview.flashcardsDue).toBe(2)
  })

  it('returns zero counts when flashcards is empty', () => {
    const data = buildAnalyticsData({ sessions: [makeSession(0)], flashcards: [] }, 'all', NOW)
    expect(data.flashcardsData.total).toBe(0)
    expect(data.flashcardsData.due).toBe(0)
    expect(data.flashcardsData.mastered).toBe(0)
  })

  it('defaults to empty flashcards when key is omitted', () => {
    const data = buildAnalyticsData({ sessions: [makeSession(0)] }, 'all', NOW)
    expect(data.flashcardsData.total).toBe(0)
  })

  it('uses unstable flashcard reviews as a next-session target when quiz weaknesses are stable', () => {
    const session = makeSession(0, {
      percentage: 85,
      subjectBreakdown: [{ name: 'Pharmacology', correct: 8, total: 10, percentage: 80 }],
      systemBreakdown: [{ name: 'Renal / Urinary', correct: 8, total: 10, percentage: 80 }],
      missedQuestions: [],
    })
    const flashcardReviewEvents = [
      {
        cardId: 'fc1',
        ease: 'again',
        reviewedAt: '2026-06-14T08:00:00.000Z',
        concept: 'Loop diuretics',
        topic: 'Diuretics',
        subject: 'Pharmacology',
        system: 'Renal / Urinary',
      },
      {
        cardId: 'fc1',
        ease: 'hard',
        reviewedAt: '2026-06-14T08:05:00.000Z',
        concept: 'Loop diuretics',
        topic: 'Diuretics',
        subject: 'Pharmacology',
        system: 'Renal / Urinary',
      },
    ]

    const data = buildAnalyticsData({ sessions: [session], flashcardReviewEvents }, 'all', NOW)

    expect(data.flashcardMastery.weakConcepts[0]).toMatchObject({
      concept: 'Loop diuretics',
      instabilityScore: 100,
    })
    expect(data.nextSession).toMatchObject({
      mode: 'coach',
      area: 'Loop diuretics',
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      topic: 'Diuretics',
    })
  })
})

// ── Test 13: lastPractice / lastCoach merge behavior ─────────────────────────

describe('buildAnalyticsData — lastPractice and lastCoach merge', () => {
  it('includes lastPractice session when not already in sessions array', () => {
    const lastPractice = makeSession(1, { completedAt: '2026-06-04T10:00:00.000Z', total: 5, correct: 4 })
    const data = buildAnalyticsData({ sessions: [makeSession(0)], lastPractice }, 'all', NOW)
    expect(data.overview.totalSessions).toBe(2)
  })

  it('does not duplicate a session already present in the sessions array', () => {
    const shared = makeSession(0)
    const data = buildAnalyticsData({ sessions: [shared], lastPractice: shared }, 'all', NOW)
    expect(data.overview.totalSessions).toBe(1)
  })

  it('includes lastCoach session when not already in sessions array', () => {
    const lastCoach = makeSession(2, { completedAt: '2026-06-03T08:00:00.000Z', mode: 'coach', total: 8, correct: 6 })
    const data = buildAnalyticsData({ sessions: [makeSession(0)], lastCoach }, 'all', NOW)
    expect(data.overview.totalSessions).toBe(2)
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

// ── Trust filtering (Phase 1) — Medica Score/readiness/weak areas/trends ─────

describe('buildAnalyticsData — trusted analytics filtering', () => {
  it('includes a server_issued session in trusted analytics', () => {
    const data = buildAnalyticsData({ sessions: [makeSession(0, { integrityStatus: 'server_issued', medicaScore: 90 })] }, 'all', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.avgMedicaScore).toBe(90)
  })

  it('includes a client_selected_verified session in trusted analytics', () => {
    const data = buildAnalyticsData({ sessions: [makeSession(0, { integrityStatus: 'client_selected_verified', medicaScore: 70 })] }, 'all', NOW)
    expect(data.empty).toBe(false)
    expect(data.overview.avgMedicaScore).toBe(70)
  })

  it('excludes an unverified_local session from Medica Score and readiness', () => {
    const data = buildAnalyticsData({
      sessions: [makeSession(0, { integrityStatus: 'unverified_local', medicaScore: 99, readinessLabel: 'Strong' })],
    }, 'all', NOW)
    // Personal history still shows the session; trusted overview is computed from nothing.
    expect(data.empty).toBe(false)
    expect(data.sessions).toHaveLength(1)
    expect(data.overview.avgMedicaScore).toBe(0)
    expect(data.overview.latestReadiness).toBe('N/A')
  })

  it('excludes a legacy_unverified session from new trusted calculations', () => {
    const data = buildAnalyticsData({
      sessions: [makeSession(0, { integrityStatus: 'legacy_unverified', medicaScore: 99 })],
    }, 'all', NOW)
    expect(data.overview.avgMedicaScore).toBe(0)
  })

  it('a session with no integrityStatus at all (never synced) is excluded, the same as legacy_unverified', () => {
    // eslint-disable-next-line no-unused-vars
    const { integrityStatus: _drop, ...noStatus } = makeSession(0, { medicaScore: 99 })
    const data = buildAnalyticsData({ sessions: [noStatus] }, 'all', NOW)
    expect(data.overview.avgMedicaScore).toBe(0)
  })

  it('personal history (the returned `sessions` field) still includes all four classifications — never hidden or deleted', () => {
    const data = buildAnalyticsData({
      sessions: [
        makeSession(0, { integrityStatus: 'server_issued' }),
        makeSession(1, { integrityStatus: 'client_selected_verified' }),
        makeSession(2, { integrityStatus: 'unverified_local' }),
        makeSession(3, { integrityStatus: 'legacy_unverified' }),
      ],
    }, 'all', NOW)
    expect(data.sessions).toHaveLength(4)
  })

  it('mixing trusted and untrusted sessions produces the SAME trusted metric as using only the trusted sessions', () => {
    const trustedOnly = buildAnalyticsData({
      sessions: [
        makeSession(0, { integrityStatus: 'server_issued', medicaScore: 60 }),
        makeSession(1, { integrityStatus: 'client_selected_verified', medicaScore: 80 }),
      ],
    }, 'all', NOW)
    const mixed = buildAnalyticsData({
      sessions: [
        makeSession(0, { integrityStatus: 'server_issued', medicaScore: 60 }),
        makeSession(1, { integrityStatus: 'client_selected_verified', medicaScore: 80 }),
        makeSession(2, { integrityStatus: 'unverified_local', medicaScore: 1 }),
        makeSession(3, { integrityStatus: 'legacy_unverified', medicaScore: 100 }),
      ],
    }, 'all', NOW)

    expect(mixed.overview.avgMedicaScore).toBe(trustedOnly.overview.avgMedicaScore)
    // Personal history diverges (mixed has more sessions) — only the trusted metric must match.
    expect(mixed.sessions.length).not.toBe(trustedOnly.sessions.length)
  })

  it('the frontend cannot elevate analytics eligibility by changing mode — eligibility is governed by integrityStatus alone', () => {
    const examVersion = buildAnalyticsData({
      sessions: [makeSession(0, { mode: 'exam', integrityStatus: 'unverified_local', medicaScore: 95 })],
    }, 'all', NOW)
    const practiceVersion = buildAnalyticsData({
      sessions: [makeSession(0, { mode: 'practice', integrityStatus: 'unverified_local', medicaScore: 95 })],
    }, 'all', NOW)

    expect(examVersion.overview.avgMedicaScore).toBe(0)
    expect(practiceVersion.overview.avgMedicaScore).toBe(0)
  })
})
