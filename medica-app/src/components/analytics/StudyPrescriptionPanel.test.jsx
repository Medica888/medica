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
}))

import * as apiClient       from '../../lib/apiClient'
import * as useMasteryModule from '../../hooks/useMastery'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CONCEPT_REVIEW = {
  conceptId:          'concept-uuid-1',
  name:               'Autonomic Pharmacology',
  subject:            'Pharmacology',
  priority:           'priority',
  reason:             'Due for spaced review',
  nextReviewAt:       '2026-05-30T00:00:00.000Z', // past — shows "Due Today"
  reviewIntervalDays: 4,
}

// rx.enabled = false avoids the full prescription tier render
// but still renders DailyPlanSummary
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
    // Row should still be visible — not dismissed on error
    expect(screen.getByText('Autonomic Pharmacology')).toBeTruthy()
  })

  it('does not render ease buttons when no concept reviews exist', () => {
    useMasteryModule.useDailyStudyPlan.mockReturnValue(DAILY_PLAN_EMPTY)
    setup()
    expect(screen.queryByRole('button', { name: /again/i })).toBeNull()
  })

  it('returns null and renders nothing when unauthenticated', () => {
    apiClient.getAuthToken.mockReturnValue(null)
    const { container } = setup()
    expect(container.firstChild).toBeNull()
  })
})
