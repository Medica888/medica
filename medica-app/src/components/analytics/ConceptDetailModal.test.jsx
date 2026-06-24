import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConceptDetailModal from './ConceptDetailModal'

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('../../lib/apiClient', () => ({
  isAuthenticated: vi.fn(() => true),
  mastery: {
    concept:        vi.fn(),
    topicReadiness: vi.fn(),
    conceptReviews: vi.fn(),
  },
}))

vi.mock('../../hooks/useMastery', () => ({
  useMasteryConcept:  vi.fn(),
  useTopicReadiness:  vi.fn(),
  useConceptReviews:  vi.fn(),
}))

import * as useMasteryModule from '../../hooks/useMastery'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const CONCEPT = {
  id:      'c1c1c1c1-0000-0000-0000-000000000001',
  name:    'Beta Blockers',
  subject: 'Pharmacology',
  system:  'Cardiovascular',
}

const MASTERY = {
  mastery_score:          0.65,
  confidence_score:       0.8,
  attempts:               5,
  correct:                3,
  recent_incorrect_count: 2,
}

const REVIEW_HISTORY = {
  conceptId:           CONCEPT.id,
  totalReviews:        3,
  currentIntervalDays: 5,
  nextReviewAt:        '2026-06-08T10:00:00.000Z',
  lastReview: {
    result:         'good',
    reviewedAt:     '2026-06-01T10:00:00.000Z',
    intervalBefore: 3,
    intervalAfter:  5,
  },
  reviews: [
    { result: 'good',  reviewedAt: '2026-06-01T10:00:00.000Z', intervalBefore: 3, intervalAfter: 5 },
    { result: 'hard',  reviewedAt: '2026-05-31T10:00:00.000Z', intervalBefore: 2, intervalAfter: 3 },
    { result: 'again', reviewedAt: '2026-05-30T10:00:00.000Z', intervalBefore: 1, intervalAfter: 1 },
  ],
}

const EMPTY_HISTORY = {
  conceptId:           CONCEPT.id,
  totalReviews:        0,
  currentIntervalDays: null,
  nextReviewAt:        null,
  lastReview:          null,
  reviews:             [],
}

function defaultSetup(overrides = {}) {
  useMasteryModule.useMasteryConcept.mockReturnValue({
    data: { ancestor_path: ['pharmacology', 'beta-blockers'] },
    loading: false,
  })
  useMasteryModule.useTopicReadiness.mockReturnValue({
    data: { readiness: 70, status: 'Developing', trend: 'up', recommendation: 'Keep going' },
    loading: false,
  })
  useMasteryModule.useConceptReviews.mockReturnValue(
    overrides.conceptReviews ?? { data: REVIEW_HISTORY, loading: false },
  )
}

function setup(overrides = {}) {
  defaultSetup(overrides)
  render(
    <ConceptDetailModal
      concept={CONCEPT}
      mastery={MASTERY}
      tier="focus"
      onClose={vi.fn()}
    />,
  )
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ConceptDetailModal — Review History (Phase 6.0)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders the Review History section when data is present', () => {
    setup()
    expect(screen.getByText('Review History')).toBeTruthy()
    expect(screen.getByText('3 reviews')).toBeTruthy()
  })

  it('shows empty state when no reviews have been recorded', () => {
    setup({
      conceptReviews: { data: EMPTY_HISTORY, loading: false },
    })
    expect(screen.getByText('No SRS reviews yet.')).toBeTruthy()
  })

  it('does not render history content while loading', () => {
    setup({
      conceptReviews: { data: null, loading: true },
    })
    expect(screen.queryByText('Review History')).toBeNull()
    expect(screen.queryByText('No SRS reviews yet.')).toBeNull()
  })

  it('displays the last review result badge', () => {
    setup()
    // lastReview.result = 'good' — RESULT_LABEL maps to 'Good'
    // Multiple 'Good' badges may appear (last review + timeline), getAll is safe
    const goodBadges = screen.getAllByText('Good')
    expect(goodBadges.length).toBeGreaterThan(0)
  })

  it('renders one timeline entry per review in the history', () => {
    setup()
    // Each result appears as a badge in the timeline
    expect(screen.getAllByText('Good').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Hard').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Again').length).toBeGreaterThanOrEqual(1)
  })

  it('shows interval before and after for each timeline entry', () => {
    setup()
    // Entry 0: 3d → 5d
    expect(screen.getByText('3d → 5d')).toBeTruthy()
    // Entry 1: 2d → 3d
    expect(screen.getByText('2d → 3d')).toBeTruthy()
    // Entry 2: 1d → 1d
    expect(screen.getByText('1d → 1d')).toBeTruthy()
  })

  it('displays the current SRS interval', () => {
    setup()
    expect(screen.getByText('5d')).toBeTruthy()
  })
})
