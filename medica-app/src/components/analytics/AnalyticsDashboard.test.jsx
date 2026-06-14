import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AnalyticsDashboard from './AnalyticsDashboard'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../lib/analyticsEngine', () => ({
  buildAnalyticsData: vi.fn(),
  getRangeStartDate: vi.fn(),
  filterSessionsByRange: vi.fn(s => s),
}))

vi.mock('../../hooks/useSessionHistory', () => ({
  useSessionHistory: vi.fn(() => ({
    sessions: [],
    loading: false,
    error: null,
    source: 'localStorage',
    refresh: vi.fn(),
  })),
}))

vi.mock('../../lib/storage', () => ({
  getLastPracticeResults: vi.fn(() => null),
  getLastCoachResults: vi.fn(() => null),
  getFlashcards: vi.fn(() => []),
  getFlashcardReviewEvents: vi.fn(() => []),
  getQuestionReportAnalytics: vi.fn(() => ({ total: 0, reasons: [], topConcepts: [] })),
  subscribeQuestionReports: vi.fn(() => () => {}),
}))

vi.mock('../../hooks/useMastery', () => ({
  useReadiness:        vi.fn(() => ({ data: null, loading: false, error: null })),
  useMasteryProgress:  vi.fn(() => ({ data: null, loading: false, error: null })),
  useMasteryTimeline:  vi.fn(() => ({ data: null, loading: false, error: null })),
}))

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div data-testid="chart">{children}</div>,
  AreaChart:   ({ children }) => <svg>{children}</svg>,
  Area:        () => null,
  XAxis:       () => null,
  YAxis:       () => null,
  CartesianGrid: () => null,
  Tooltip:     () => null,
  ReferenceLine: () => null,
}))

// ── Sub-component mocks (avoid deep render trees) ────────────────────────────

vi.mock('./MasteryPanel',          () => ({ default: () => null }))
vi.mock('./StudyPrescriptionPanel', () => ({ default: () => null }))
vi.mock('./ProgressPanel',          () => ({ default: () => null }))
vi.mock('./ProgressTrendPanel',     () => ({ default: () => null }))

import { buildAnalyticsData } from '../../lib/analyticsEngine'
import { getQuestionReportAnalytics } from '../../lib/storage'

// ── Fixture ───────────────────────────────────────────────────────────────────

function makeData(sessionCount, subjectName = 'Pathology') {
  return {
    empty: false,
    rangeEmpty: false,
    overview: {
      totalSessions: sessionCount,
      totalQuestions: sessionCount * 10,
      totalCorrect:   sessionCount * 7,
      overallAccuracy: 70,
      latestMedicaScore: 200,
      latestReadiness: 'Good',
      practiceCount: sessionCount,
      coachCount: 0,
      examCount: 0,
      practiceAccuracy: 70,
      coachAccuracy: null,
      examAccuracy: null,
      avgMedicaScore: 200,
      flashcardsDue: 0,
      studyStreak: 0,
    },
    subjectBreakdown: [
      { name: subjectName, correct: sessionCount * 7, total: sessionCount * 10, percentage: 70 },
    ],
    systemBreakdown: [],
    usmleContentBreakdown: [],
    physicianTaskBreakdown: [],
    topicBreakdown: [],
    weaknesses: { critical: [], moderate: [], mild: [], byTopic: [] },
    mistakeDiagnosis: {
      topCategory: null, topCategoryCount: 0, totalMissed: 0, totalAttempted: sessionCount * 10,
      riskLevel: 'low', dataConfidence: 'low', concentrationType: 'distributed',
      hiddenMistakeCount: 0, primaryFailureMode: { type: 'low-exposure', label: 'Low Exposure', description: '' },
      mistakeMix: [], topSubjects: [], topSystems: [], diagnosticInsights: [], recommendedFixes: [], patterns: [],
    },
    studyPrescription: [],
    trends: Array.from({ length: Math.min(sessionCount, 2) }, (_, i) => ({
      index: i + 1, accuracy: 70, medicaScore: 200, mode: 'practice',
    })),
    repeatedMistakes: [],
    sessionComparison: { available: false },
    flashcardSummary: { topics: [], totalMissed: 0 },
    repeatedPatterns: [],
    improvingTopics: [],
    nextSession: { mode: 'practice', area: null, difficulty: 'Balanced', reasoning: '' },
    flashcardsData: { total: 0, due: 0, mastered: 0 },
  }
}

const EMPTY_RANGE = { empty: true, rangeEmpty: true }
const EMPTY_ALL   = { empty: true, rangeEmpty: false }

const NOOP = vi.fn()

// ── Test 11: Clicking Week changes visible analytics data ─────────────────────

describe('AnalyticsDashboard — Test 11: Week filter changes data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls buildAnalyticsData with "week" when Week is clicked', () => {
    buildAnalyticsData.mockReturnValue(makeData(5))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(buildAnalyticsData).toHaveBeenCalledWith(expect.any(Object), 'week')
  })

  it('score trajectory subtitle updates to session count for week', () => {
    buildAnalyticsData
      .mockReturnValueOnce(makeData(10))  // all-time initial render
      .mockReturnValueOnce(makeData(2))   // week render
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(screen.getByTestId('trajectory-sub')).toHaveTextContent('2 sessions')
  })
})

// ── Test 12: Clicking Month changes visible analytics data ────────────────────

describe('AnalyticsDashboard — Test 12: Month filter changes data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls buildAnalyticsData with "month" when Month is clicked', () => {
    buildAnalyticsData.mockReturnValue(makeData(5))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^month$/i }))
    expect(buildAnalyticsData).toHaveBeenCalledWith(expect.any(Object), 'month')
  })
})

// ── Test 13: Clicking All time restores all-time analytics ───────────────────

describe('AnalyticsDashboard — Test 13: All time filter restores data', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls buildAnalyticsData with "all" when All time is clicked after Week', () => {
    buildAnalyticsData.mockReturnValue(makeData(5))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    fireEvent.click(screen.getByRole('button', { name: /all time/i }))
    const calls = buildAnalyticsData.mock.calls.map(c => c[1])
    expect(calls).toContain('all')
    expect(calls[calls.length - 1]).toBe('all')
  })
})

// ── Test 14: Empty range message appears when no sessions in range ────────────

describe('AnalyticsDashboard — Test 14: empty range message', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "No sessions in this range" when week range is empty', () => {
    buildAnalyticsData.mockReturnValue(EMPTY_RANGE)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(screen.getByText(/No sessions in this range/i)).toBeInTheDocument()
  })

  it('empty range state still renders filter buttons (allows switching back)', () => {
    buildAnalyticsData.mockReturnValue(EMPTY_RANGE)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(screen.getByRole('group', { name: /time filter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /all time/i })).toBeInTheDocument()
  })
})

// ── Test 15: Stale all-time data not shown in empty Week/Month ────────────────

describe('AnalyticsDashboard — Test 15: no stale data in empty range', () => {
  beforeEach(() => vi.clearAllMocks())

  it('subject table is absent when week range is empty', () => {
    buildAnalyticsData
      .mockReturnValueOnce(makeData(5, 'Pathology'))  // initial all-time
      .mockReturnValueOnce(EMPTY_RANGE)               // week
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    // Subject Performance table should not appear
    expect(screen.queryByText('Subject Performance')).toBeNull()
    // All-time subject name should not leak through
    expect(screen.queryByText('Pathology')).toBeNull()
  })

  it('global empty state does not show rangeEmpty message', () => {
    buildAnalyticsData.mockReturnValue(EMPTY_ALL)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByText(/No Session Data Yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/No sessions in this range/i)).toBeNull()
  })
})

// ── Test 16: Score trajectory subtitle reflects filtered session count ─────────

describe('AnalyticsDashboard — Test 16: trajectory subtitle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows correct session count for all-time', () => {
    buildAnalyticsData.mockReturnValue(makeData(8))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('trajectory-sub')).toHaveTextContent('8 sessions')
  })

  it('shows range note "Showing last 7 days" when Week is active', () => {
    buildAnalyticsData.mockReturnValue(makeData(2))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(screen.getByTestId('range-note')).toHaveTextContent('Showing last 7 days')
  })

  it('shows range note "Showing last 30 days" when Month is active', () => {
    buildAnalyticsData.mockReturnValue(makeData(3))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^month$/i }))
    expect(screen.getByTestId('range-note')).toHaveTextContent('Showing last 30 days')
  })

  it('no range note shown for All time', () => {
    buildAnalyticsData.mockReturnValue(makeData(10))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.queryByTestId('range-note')).toBeNull()
  })
})

// ── Test 17: Backend mastery panels are labeled as all-time ───────────────────

describe('AnalyticsDashboard — Test 17: backend panels labeled all-time', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the all-time backend note regardless of active filter', () => {
    buildAnalyticsData.mockReturnValue(makeData(5))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('backend-all-time-note')).toBeInTheDocument()
  })

  it('all-time label is still present when Week is selected', () => {
    buildAnalyticsData.mockReturnValue(makeData(2))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(screen.getByTestId('backend-all-time-note')).toBeInTheDocument()
  })
})

// ── Test 18: Report analytics filters by range ───────────────────────────────

describe('AnalyticsDashboard — Test 18: report analytics range filtering', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls getQuestionReportAnalytics with "week" when Week is active', () => {
    buildAnalyticsData.mockReturnValue(makeData(2))
    getQuestionReportAnalytics.mockReturnValue({ total: 1, reasons: [{ reason: 'wrong_answer', label: 'Wrong answer', count: 1 }], topConcepts: [] })
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^week$/i }))
    expect(getQuestionReportAnalytics).toHaveBeenCalledWith('week')
  })

  it('calls getQuestionReportAnalytics with "all" for all-time filter', () => {
    buildAnalyticsData.mockReturnValue(makeData(5))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(getQuestionReportAnalytics).toHaveBeenCalledWith('all')
  })
})

// ── Test 19: Report timestamp fallback behavior ───────────────────────────────

describe('AnalyticsDashboard — Test 19: report timestamp fallback (documented)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reports with no reportedAt are excluded from week/month (per storage contract)', () => {
    // This is tested at the storage layer — we just verify the dashboard passes the range
    buildAnalyticsData.mockReturnValue(makeData(3))
    getQuestionReportAnalytics.mockReturnValue({ total: 0, reasons: [], topConcepts: [] })
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /^month$/i }))
    expect(getQuestionReportAnalytics).toHaveBeenCalledWith('month')
    // When total is 0, shows "No reported questions yet" (documented fallback behavior)
    expect(screen.getByText(/No reported questions yet/i)).toBeInTheDocument()
  })
})
