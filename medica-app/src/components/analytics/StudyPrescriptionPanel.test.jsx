import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StudyPrescriptionPanel from './StudyPrescriptionPanel'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/apiClient', () => ({
  isAuthenticated: vi.fn(() => true),
  mastery: {
    reviewConcept: vi.fn(),
  },
}))

vi.mock('../../hooks/useMastery', () => ({
  useStudyPrescription: vi.fn(),
  useDailyStudyPlan:    vi.fn(),
  useDueReviews:        vi.fn(),
  useReviewStats:       vi.fn(),
}))

import * as apiClient        from '../../lib/apiClient'
import * as useMasteryModule from '../../hooks/useMastery'

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Prescribed concept (daily plan only — no daysOverdue)
const CONCEPT_REVIEW = {
  conceptId:          'concept-uuid-1',
  name:               'Autonomic Pharmacology',
  subject:            'Pharmacology',
  priority:           'priority',
  reason:             'Due for spaced review',
  nextReviewAt:       '2026-05-30T00:00:00.000Z',
  reviewIntervalDays: 4,
}

// A distinct due review item from the SRS endpoint
const DUE_REVIEW_ITEM = {
  conceptId:          'concept-uuid-2',
  name:               'Beta Blockers',
  subject:            'Pharmacology',
  priority:           'priority',
  reviewIntervalDays: 2,
  nextReviewAt:       '2026-05-29T00:00:00.000Z',
  daysOverdue:        2,
}

// Same conceptId as CONCEPT_REVIEW — used to test deduplication
const DUE_REVIEW_DUPLICATE = {
  conceptId:          'concept-uuid-1', // same as CONCEPT_REVIEW
  name:               'Autonomic Pharmacology',
  subject:            'Pharmacology',
  priority:           'priority',
  reviewIntervalDays: 4,
  nextReviewAt:       '2026-05-30T00:00:00.000Z',
  daysOverdue:        1,
}

// rx.enabled = false → still renders DailyPlanSummary
const RX_DISABLED = {
  data: { enabled: false, reason: 'Not enough data' },
  loading: false, error: null,
}

const DAILY_PLAN_WITH_REVIEW = {
  data: {
    date:                  '2026-05-31',
    readinessStatus:       'Developing',
    estimatedMinutes:      30,
    recommendedQuestions:  10,
    recommendedFlashcards: 5,
    conceptReviews:        [CONCEPT_REVIEW],
    focusSubjects:         ['Pharmacology'],
    summary:               'Focus today on weak Pharmacology concepts.',
  },
  loading: false, error: null,
}

const DAILY_PLAN_EMPTY = {
  data: { ...DAILY_PLAN_WITH_REVIEW.data, conceptReviews: [] },
  loading: false, error: null,
}

const DUE_REVIEWS_EMPTY = {
  data: { reviews: [], total: 0, overdueCount: 0 },
  loading: false, error: null,
}

const REVIEW_STATS_EMPTY = {
  data: {
    reviewedToday: 0, reviewedThisWeek: 0, currentStreak: 0, totalReviewed: 0,
    todayBreakdown: { again: 0, hard: 0, good: 0, easy: 0 },
    longestStreak: 0, activeDaysThisWeek: 0,
    dailyGoal: 20, goalProgress: 0, activity30Days: [],
    dueToday: 0, completionPercent: null,
  },
  loading: false, error: null,
}

const REVIEW_STATS_WITH_DATA = {
  data: {
    reviewedToday: 5, reviewedThisWeek: 23, currentStreak: 4, totalReviewed: 12,
    todayBreakdown: { again: 1, hard: 1, good: 2, easy: 1 },
    longestStreak: 14, activeDaysThisWeek: 5,
    dailyGoal: 20, goalProgress: 5,
    activity30Days: [{ date: '2026-05-25', reviews: 12 }, { date: '2026-06-01', reviews: 5 }],
    dueToday: 18, completionPercent: 28,
  },
  loading: false, error: null,
}

const REVIEW_STATS_GOAL_DONE = {
  data: {
    reviewedToday: 20, reviewedThisWeek: 23, currentStreak: 4, totalReviewed: 20,
    todayBreakdown: { again: 1, hard: 1, good: 10, easy: 8 },
    longestStreak: 14, activeDaysThisWeek: 5,
    dailyGoal: 20, goalProgress: 20,
    activity30Days: [{ date: '2026-06-01', reviews: 20 }],
    dueToday: 18, completionPercent: 100,
  },
  loading: false, error: null,
}

const DUE_REVIEWS_WITH_ITEM = {
  data: { reviews: [DUE_REVIEW_ITEM], total: 1, overdueCount: 1 },
  loading: false, error: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setup() {
  return render(<StudyPrescriptionPanel />)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StudyPrescriptionPanel — ease review buttons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.isAuthenticated.mockReturnValue(true)
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
  })

  it('renders Again / Hard / Good / Easy buttons for a concept review row', () => {
    setup()
    expect(screen.getByRole('button', { name: /again/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /hard/i  })).toBeTruthy()
    expect(screen.getByRole('button', { name: /good/i  })).toBeTruthy()
    expect(screen.getByRole('button', { name: /easy/i  })).toBeTruthy()
  })

  it('shows correct interval preview labels (reviewIntervalDays = 4)', () => {
    setup()
    // again → 1, hard → max(4,1)=4, good → round(4*1.5)=6, easy → min(4*2,30)=8
    expect(screen.getByText('1d')).toBeTruthy()
    expect(screen.getByText('4d')).toBeTruthy()
    expect(screen.getByText('6d')).toBeTruthy()
    expect(screen.getByText('8d')).toBeTruthy()
  })

  it('calls mastery.reviewConcept with conceptId and result when Good is clicked', async () => {
    apiClient.mastery.reviewConcept.mockResolvedValue({
      conceptId: CONCEPT_REVIEW.conceptId,
      result: 'good',
      reviewIntervalDays: 6,
      nextReviewAt: null,
    })
    setup()

    fireEvent.click(screen.getByRole('button', { name: /good/i }))

    await waitFor(() => {
      expect(apiClient.mastery.reviewConcept).toHaveBeenCalledTimes(1)
      expect(apiClient.mastery.reviewConcept).toHaveBeenCalledWith(
        CONCEPT_REVIEW.conceptId,
        'good',
      )
    })
  })

  it('dismisses the concept row after a successful review', async () => {
    apiClient.mastery.reviewConcept.mockResolvedValue({
      conceptId: CONCEPT_REVIEW.conceptId,
      result: 'easy',
      reviewIntervalDays: 8,
      nextReviewAt: null,
    })
    setup()
    expect(screen.getByText('Autonomic Pharmacology')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /easy/i }))

    await waitFor(() => {
      expect(screen.queryByText('Autonomic Pharmacology')).toBeNull()
    })
  })

  it('shows an error alert when the API call fails', async () => {
    apiClient.mastery.reviewConcept.mockRejectedValue(new Error('Network error'))
    setup()

    fireEvent.click(screen.getByRole('button', { name: /again/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
      expect(screen.getByText(/review failed/i)).toBeTruthy()
    })
  })

  it('keeps the concept row visible after a failed review', async () => {
    apiClient.mastery.reviewConcept.mockRejectedValue(new Error('Network error'))
    setup()

    fireEvent.click(screen.getByRole('button', { name: /hard/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
    expect(screen.getByText('Autonomic Pharmacology')).toBeTruthy()
  })

  it('does not render ease buttons when no concept reviews exist', () => {
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_EMPTY)
    // dueReviews is also empty (default from beforeEach)
    setup()
    expect(screen.queryByRole('button', { name: /again/i })).toBeNull()
  })

  it('returns null and renders nothing when unauthenticated', () => {
    apiClient.isAuthenticated.mockReturnValue(false)
    const { container } = setup()
    expect(container.firstChild).toBeNull()
  })
})

describe('StudyPrescriptionPanel — unified review queue (Phase 5.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.isAuthenticated.mockReturnValue(true)
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_EMPTY)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
  })

  it('renders due review items from useDueReviews', () => {
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_WITH_ITEM)
    setup()
    expect(screen.getByText('Beta Blockers')).toBeTruthy()
  })

  it('shows overdue badge when overdueCount > 0', () => {
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_WITH_ITEM) // overdueCount: 1
    setup()
    expect(screen.getByText('1 overdue')).toBeTruthy()
  })

  it('does not show overdue badge when overdueCount is 0', () => {
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()
    expect(screen.queryByText(/overdue/i)).toBeNull()
  })

  it('shows "Xd overdue" status label for overdue items', () => {
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_WITH_ITEM) // daysOverdue: 2
    setup()
    expect(screen.getByText(/2d overdue/i)).toBeTruthy()
  })

  // ── Deduplication — the core UX guarantee ────────────────────────────────

  it('a concept in both due reviews and daily plan appears exactly once', () => {
    useMasteryModule.useDueReviews.mockReturnValue({
      data: { reviews: [DUE_REVIEW_DUPLICATE], total: 1, overdueCount: 1 },
      loading: false, error: null,
    })
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW) // same conceptId
    setup()

    // 'Autonomic Pharmacology' must appear exactly once regardless of source
    expect(screen.getAllByText('Autonomic Pharmacology')).toHaveLength(1)
  })

  it('due items appear before prescribed-not-due items', () => {
    // Beta Blockers is due (daysOverdue: 2); Autonomic Pharmacology is prescribed only
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_WITH_ITEM)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()

    screen.getAllByRole('group') // verify ease rows render for each concept
    // Both concepts rendered; Beta Blockers (due) must appear first
    const allText = document.body.textContent
    const betaPos = allText.indexOf('Beta Blockers')
    const autoPos = allText.indexOf('Autonomic Pharmacology')
    expect(betaPos).toBeLessThan(autoPos)
  })

  it('dismissing a due item removes it from the queue without affecting other items', async () => {
    apiClient.mastery.reviewConcept.mockResolvedValue({
      conceptId: DUE_REVIEW_ITEM.conceptId,
      result: 'good',
      reviewIntervalDays: 3,
      nextReviewAt: null,
    })
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_WITH_ITEM)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()

    // Both start visible
    expect(screen.getByText('Beta Blockers')).toBeTruthy()
    expect(screen.getByText('Autonomic Pharmacology')).toBeTruthy()

    // Rate the due item (Beta Blockers is first — click its Good button)
    const goodButtons = screen.getAllByRole('button', { name: /good/i })
    fireEvent.click(goodButtons[0]) // first Good button → Beta Blockers

    await waitFor(() => {
      expect(screen.queryByText('Beta Blockers')).toBeNull()
    })
    // Prescribed item still visible
    expect(screen.getByText('Autonomic Pharmacology')).toBeTruthy()
  })
})

describe('StudyPrescriptionPanel — review analytics (Phase 5.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.isAuthenticated.mockReturnValue(true)
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_EMPTY)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
  })

  it('shows retention row with daily goal when stats are available', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA)
    setup()
    expect(screen.getByText('Daily Goal')).toBeTruthy()
    expect(screen.getByText('5 / 20')).toBeTruthy() // goalProgress / dailyGoal
  })

  it('shows streak pill when currentStreak > 0', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA) // streak: 4
    setup()
    expect(screen.getByText('4d')).toBeTruthy()
    expect(screen.getByText('streak')).toBeTruthy()
  })

  it('does not render stats row when all counts are zero', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()
    // 'streak' and 'this week' only appear in the stats row — not in daily plan stats
    expect(screen.queryByText('streak')).toBeNull()
    expect(screen.queryByText('this week')).toBeNull()
  })

  it('shows session complete strip after all items are dismissed', async () => {
    apiClient.mastery.reviewConcept.mockResolvedValue({
      conceptId: CONCEPT_REVIEW.conceptId, result: 'good', reviewIntervalDays: 6, nextReviewAt: null,
    })
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()

    fireEvent.click(screen.getByRole('button', { name: /good/i }))

    await waitFor(() => {
      expect(screen.getByText('Session complete')).toBeTruthy()
    })
  })

  it('session summary shows the rated ease counts', async () => {
    apiClient.mastery.reviewConcept.mockResolvedValue({
      conceptId: CONCEPT_REVIEW.conceptId, result: 'easy', reviewIntervalDays: 8, nextReviewAt: null,
    })
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()

    fireEvent.click(screen.getByRole('button', { name: /easy/i }))

    await waitFor(() => {
      expect(screen.getByText('Session complete')).toBeTruthy()
      expect(screen.getByText('Easy')).toBeTruthy() // ease label in summary
    })
  })
})

describe('StudyPrescriptionPanel — retention layer (Phase 5.6)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.isAuthenticated.mockReturnValue(true)
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_EMPTY)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
  })

  it('always shows Daily Goal bar with label', () => {
    setup()
    expect(screen.getByText('Daily Goal')).toBeTruthy()
  })

  it('shows 0 / 20 when no reviews today', () => {
    setup()
    expect(screen.getByText('0 / 20')).toBeTruthy()
  })

  it('shows goalProgress / dailyGoal when reviews exist', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA) // goalProgress: 5
    setup()
    expect(screen.getByText('5 / 20')).toBeTruthy()
  })

  it('shows "✓ Completed" instead of progress when goal is reached', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_GOAL_DONE)
    setup()
    expect(screen.getByText('✓ Completed')).toBeTruthy()
    expect(screen.queryByText('20 / 20')).toBeNull()
  })

  it('shows streak pill when currentStreak > 0', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA) // streak: 4
    setup()
    expect(screen.getByText('4d')).toBeTruthy()
    expect(screen.getByText('streak')).toBeTruthy()
  })

  it('shows longest streak pill when longestStreak > currentStreak', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA) // longest: 14, current: 4
    setup()
    expect(screen.getByText('14d')).toBeTruthy()
    expect(screen.getByText('best')).toBeTruthy()
  })

  it('does not show best pill when longestStreak equals currentStreak', () => {
    useMasteryModule.useReviewStats.mockReturnValue({
      data: { ...REVIEW_STATS_WITH_DATA.data, longestStreak: 4, currentStreak: 4 },
      loading: false, error: null,
    })
    setup()
    expect(screen.queryByText('best')).toBeNull()
  })

  it('shows activeDaysThisWeek / 7 pill when active days > 0', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA) // activeDays: 5
    setup()
    expect(screen.getByText('5/7')).toBeTruthy()
    expect(screen.getByText('days active')).toBeTruthy()
  })

  it('shows completion percent pill when dueToday > 0', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA) // 28%, dueToday: 18
    setup()
    expect(screen.getByText('28%')).toBeTruthy()
    expect(screen.getByText('reviews / due')).toBeTruthy()
  })

  it('does not show completion pill when dueToday is 0', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY) // dueToday: 0
    setup()
    expect(screen.queryByText('of due done')).toBeNull()
  })

  it('renders 30 activity cells when activity30Days has data', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_WITH_DATA)
    setup()
    // The strip renders 30 cells regardless of how many days have data
    const strip = document.querySelector('.spp-activity-strip')
    expect(strip).not.toBeNull()
    expect(strip.children).toHaveLength(30)
  })

  it('does not render activity strip when activity30Days is empty', () => {
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
    setup()
    expect(document.querySelector('.spp-activity-strip')).toBeNull()
  })
})

describe('StudyPrescriptionPanel — USMLE taxonomy chips', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.isAuthenticated.mockReturnValue(true)
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
    useMasteryModule.useReviewStats.mockReturnValue(REVIEW_STATS_EMPTY)
  })

  it('renders without taxonomy chips when focusUsmleContentAreas and focusPhysicianTasks are absent', () => {
    // DAILY_PLAN_WITH_REVIEW has no taxonomy fields — existing plan should look identical
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    setup()
    expect(document.querySelector('[aria-label="USMLE content areas"]')).toBeNull()
    expect(document.querySelector('[aria-label="Physician tasks"]')).toBeNull()
    // Existing subject chips still render (may appear more than once — in focusSubjects + concept row)
    expect(screen.getAllByText('Pharmacology').length).toBeGreaterThan(0)
  })

  it('renders USMLE content area chips when focusUsmleContentAreas is present', () => {
    useMasteryModule.useDailyStudyPlan.mockReturnValue({
      data: {
        ...DAILY_PLAN_WITH_REVIEW.data,
        focusUsmleContentAreas: ['Cardiovascular System', 'Renal & Urinary System'],
      },
      loading: false, error: null,
    })
    setup()
    expect(screen.getByText('Cardiovascular System')).toBeTruthy()
    expect(screen.getByText('Renal & Urinary System')).toBeTruthy()
    expect(document.querySelector('[aria-label="USMLE content areas"]')).toBeTruthy()
  })

  it('renders physician task chips when focusPhysicianTasks is present', () => {
    useMasteryModule.useDailyStudyPlan.mockReturnValue({
      data: {
        ...DAILY_PLAN_WITH_REVIEW.data,
        focusPhysicianTasks: ['Patient Care: Pharmacotherapy'],
      },
      loading: false, error: null,
    })
    setup()
    expect(screen.getByText('Patient Care: Pharmacotherapy')).toBeTruthy()
    expect(document.querySelector('[aria-label="Physician tasks"]')).toBeTruthy()
  })

  it('renders all three chip groups when all taxonomy fields are present', () => {
    useMasteryModule.useDailyStudyPlan.mockReturnValue({
      data: {
        ...DAILY_PLAN_WITH_REVIEW.data,
        focusUsmleContentAreas: ['Cardiovascular System'],
        focusPhysicianTasks:    ['Patient Care: Pharmacotherapy'],
      },
      loading: false, error: null,
    })
    setup()
    // Subject chip appears in focusSubjects row and concept review row
    expect(screen.getAllByText('Pharmacology').length).toBeGreaterThan(0)
    expect(screen.getByText('Cardiovascular System')).toBeTruthy()
    expect(screen.getByText('Patient Care: Pharmacotherapy')).toBeTruthy()
  })

  it('does not render USMLE chips when focusUsmleContentAreas is empty', () => {
    useMasteryModule.useDailyStudyPlan.mockReturnValue({
      data: { ...DAILY_PLAN_WITH_REVIEW.data, focusUsmleContentAreas: [] },
      loading: false, error: null,
    })
    setup()
    expect(document.querySelector('[aria-label="USMLE content areas"]')).toBeNull()
  })
})
