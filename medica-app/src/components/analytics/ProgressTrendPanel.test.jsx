import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProgressTrendPanel from './ProgressTrendPanel'

vi.mock('../../lib/apiClient', () => ({
  getAuthToken: vi.fn(),
}))

vi.mock('../../hooks/useMastery', () => ({
  useMasteryProgress: vi.fn(),
  useMasteryTimeline: vi.fn(),
}))

import { getAuthToken } from '../../lib/apiClient'
import { useMasteryProgress, useMasteryTimeline } from '../../hooks/useMastery'

const PROGRESS_1_SESSION = {
  currentMastery:   0.53,
  previousMastery:  null,
  improvement:      null,
  priorityConcepts: { current: 24, previous: null },
  weakConcepts:     { current: 26, previous: null },
  sessionCount:     1,
  improvementRate:  0,
  learningVelocity: 0,
}

const PROGRESS_2_SESSIONS = {
  currentMastery:   0.58,
  previousMastery:  0.53,
  improvement:      0.05,
  priorityConcepts: { current: 23, previous: 24 },
  weakConcepts:     { current: 25, previous: 26 },
  sessionCount:     2,
  improvementRate:  0.05,
  learningVelocity: -1,
}

const TIMELINE_2 = {
  trend: [
    { sessionNumber: 1, sessionId: 's1', date: '2026-05-30T20:00:00Z', avgMastery: 0.53, priorityCount: 24, focusCount: 2, reinforcedCount: 0, ontrkCount: 11 },
    { sessionNumber: 2, sessionId: 's2', date: '2026-05-30T20:30:00Z', avgMastery: 0.58, priorityCount: 23, focusCount: 2, reinforcedCount: 0, ontrkCount: 12 },
  ],
  weakConceptTrend: [
    { sessionNumber: 1, date: '2026-05-30T20:00:00Z', weakCount: 26, priorityCount: 24 },
    { sessionNumber: 2, date: '2026-05-30T20:30:00Z', weakCount: 25, priorityCount: 23 },
  ],
  improvementRate:  0.05,
  learningVelocity: -1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProgressTrendPanel', () => {
  it('renders nothing when no auth token', () => {
    getAuthToken.mockReturnValue(null)
    useMasteryProgress.mockReturnValue({ data: null, loading: false, error: null })
    useMasteryTimeline.mockReturnValue({ data: null, loading: false, error: null })
    const { container } = render(<ProgressTrendPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders loading skeleton while fetching', () => {
    getAuthToken.mockReturnValue('tok')
    useMasteryProgress.mockReturnValue({ data: null, loading: true, error: null })
    useMasteryTimeline.mockReturnValue({ data: null, loading: true, error: null })
    render(<ProgressTrendPanel />)
    expect(screen.getByText('Learning Timeline')).toBeTruthy()
    // Skeleton rows are rendered
    const skeletons = document.querySelectorAll('.mp-skeleton-row')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('renders nothing on 401 error', () => {
    getAuthToken.mockReturnValue('expired')
    useMasteryProgress.mockReturnValue({ data: null, loading: false, error: { status: 401 } })
    useMasteryTimeline.mockReturnValue({ data: null, loading: false, error: null })
    const { container } = render(<ProgressTrendPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders empty state when sessionCount is 0', () => {
    getAuthToken.mockReturnValue('tok')
    useMasteryProgress.mockReturnValue({
      data: { ...PROGRESS_1_SESSION, sessionCount: 0 },
      loading: false, error: null,
    })
    useMasteryTimeline.mockReturnValue({ data: null, loading: false, error: null })
    render(<ProgressTrendPanel />)
    expect(screen.getByText(/first session/i)).toBeTruthy()
  })

  it('renders all three trend cards with populated data', () => {
    getAuthToken.mockReturnValue('tok')
    useMasteryProgress.mockReturnValue({ data: PROGRESS_2_SESSIONS, loading: false, error: null })
    useMasteryTimeline.mockReturnValue({ data: TIMELINE_2, loading: false, error: null })
    render(<ProgressTrendPanel />)
    expect(screen.getByText('Overall Mastery')).toBeTruthy()
    expect(screen.getByText('Priority Concepts')).toBeTruthy()
    expect(screen.getByText('Weak Concepts')).toBeTruthy()
  })

  it('shows current mastery value formatted as percentage', () => {
    getAuthToken.mockReturnValue('tok')
    useMasteryProgress.mockReturnValue({ data: PROGRESS_2_SESSIONS, loading: false, error: null })
    useMasteryTimeline.mockReturnValue({ data: TIMELINE_2, loading: false, error: null })
    render(<ProgressTrendPanel />)
    // 0.58 → 58%
    expect(screen.getByText('58%')).toBeTruthy()
  })

  it('shows session count in subtitle', () => {
    getAuthToken.mockReturnValue('tok')
    useMasteryProgress.mockReturnValue({ data: PROGRESS_2_SESSIONS, loading: false, error: null })
    useMasteryTimeline.mockReturnValue({ data: TIMELINE_2, loading: false, error: null })
    render(<ProgressTrendPanel />)
    expect(screen.getByText(/2 sessions/i)).toBeTruthy()
  })

  it('shows hint when only one session exists', () => {
    getAuthToken.mockReturnValue('tok')
    useMasteryProgress.mockReturnValue({ data: PROGRESS_1_SESSION, loading: false, error: null })
    useMasteryTimeline.mockReturnValue({ data: {
      trend: [TIMELINE_2.trend[0]],
      weakConceptTrend: [TIMELINE_2.weakConceptTrend[0]],
      improvementRate: 0, learningVelocity: 0,
    }, loading: false, error: null })
    render(<ProgressTrendPanel />)
    expect(screen.getByText(/1 more session/i)).toBeTruthy()
  })
})
