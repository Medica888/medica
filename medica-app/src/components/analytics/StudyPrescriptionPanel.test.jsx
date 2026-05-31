import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StudyPrescriptionPanel from './StudyPrescriptionPanel'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/apiClient', () => ({
  getAuthToken:  vi.fn(() => 'test-token'),
  mastery: {
    reviewConcept: vi.fn(),
  },
}))

vi.mock('../../hooks/useMastery', () => ({
  useStudyPrescription: vi.fn(),
  useDailyStudyPlan:    vi.fn(),
  useDueReviews:        vi.fn(),
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
    apiClient.getAuthToken.mockReturnValue('test-token')
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_WITH_REVIEW)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
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
    apiClient.getAuthToken.mockReturnValue(null)
    const { container } = setup()
    expect(container.firstChild).toBeNull()
  })
})

describe('StudyPrescriptionPanel — unified review queue (Phase 5.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiClient.getAuthToken.mockReturnValue('test-token')
    useMasteryModule.useStudyPrescription.mockReturnValue(RX_DISABLED)
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_EMPTY)
    useMasteryModule.useDueReviews.mockReturnValue(DUE_REVIEWS_EMPTY)
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

    const rows = screen.getAllByRole('group') // each concept has a role="group" ease row
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
