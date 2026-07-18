import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
import { useReadiness } from '../../hooks/useMastery'

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

// ── Test 20: Medica Score unavailable state (Phase 1.1) ──────────────────────

describe('AnalyticsDashboard — Test 20: Medica Score unavailable, not zero', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "Medica Score not available yet" instead of a score badge when latestMedicaScore is null', () => {
    const data = makeData(2)
    data.overview.latestMedicaScore = null
    buildAnalyticsData.mockReturnValue(data)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('medica-score-unavailable')).toHaveTextContent(/not available yet/i)
    expect(screen.queryByText('200')).toBeNull()
  })

  it('shows the numeric score badge (not the unavailable message) when latestMedicaScore is a real value, including 0', () => {
    const data = makeData(2)
    data.overview.latestMedicaScore = 0
    buildAnalyticsData.mockReturnValue(data)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.queryByTestId('medica-score-unavailable')).toBeNull()
  })
})

// ── Test 21: Step 1 Readiness vs Concept Progress terminology (Phase 1.2) ────

describe('AnalyticsDashboard — Test 21: Step 1 Readiness vs Concept Progress', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => useReadiness.mockReturnValue({ data: null, loading: false, error: null }))

  it('labels the mastery-derived card "CONCEPT PROGRESS", never "Concept Readiness"', () => {
    buildAnalyticsData.mockReturnValue(makeData(3))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByText('CONCEPT PROGRESS')).toBeInTheDocument()
    expect(screen.queryByText(/concept readiness/i)).toBeNull()
  })

  it('shows the Concept Progress card\'s distinguishing note separating it from Step 1 Readiness', () => {
    buildAnalyticsData.mockReturnValue(makeData(3))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('concept-progress-distinction')).toHaveTextContent(/separate from standardized Step 1 Readiness/i)
  })

  it('displays Step 1 Readiness with its value when overview.latestReadiness is present', () => {
    const data = makeData(3)
    data.overview.latestReadiness = 'Strong'
    buildAnalyticsData.mockReturnValue(data)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('step1-readiness-value')).toHaveTextContent('Step 1 Readiness')
    expect(screen.getByTestId('step1-readiness-value')).toHaveTextContent('Strong')
    expect(screen.queryByTestId('step1-readiness-unavailable')).toBeNull()
  })

  it('shows "Step 1 Readiness not available yet" — not a false 0% or "Not ready" — when overview.latestReadiness is null', () => {
    const data = makeData(3)
    data.overview.latestReadiness = null
    buildAnalyticsData.mockReturnValue(data)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('step1-readiness-unavailable')).toHaveTextContent(/not available yet/i)
    expect(screen.queryByText(/not ready/i)).toBeNull()
    expect(screen.queryByTestId('step1-readiness-value')).toBeNull()
  })

  it('a genuine standardized readiness value still displays as-is (not suppressed) when present', () => {
    const data = makeData(3)
    data.overview.latestReadiness = 'Needs Foundation'
    buildAnalyticsData.mockReturnValue(data)
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    expect(screen.getByTestId('step1-readiness-value')).toHaveTextContent('Needs Foundation')
  })

  it('within the analytics dashboard, no component renders the bare, ambiguous label "Readiness" alone for either metric', () => {
    // Scoped to AnalyticsDashboard specifically. The per-session "READINESS"
    // KPI in ExamResults/CoachResults/PracticeResults (a different, pre-
    // existing metric — an immediate per-session grade from scoring, not
    // one of this phase's two aggregate metrics, and not gated by trust
    // eligibility) is intentionally out of scope — see Phase 1.2 report.
    buildAnalyticsData.mockReturnValue(makeData(3))
    render(<AnalyticsDashboard onNavigate={NOOP} />)
    // Every rendered "readiness" mention is qualified — "Step 1 Readiness" or
    // part of a specific status phrase — never the bare standalone word.
    const bareReadiness = screen.queryAllByText(/^readiness$/i)
    expect(bareReadiness).toHaveLength(0)
  })

  it('a user can simultaneously see Concept Progress with a value and Step 1 Readiness unavailable, without contradictory wording', () => {
    const data = makeData(3)
    data.overview.latestReadiness = null // no standardized evidence
    // Concept Progress falls back to the local accuracy-derived percentage
    // (rdHook.data is mocked null in this file) — it always renders a value.
    buildAnalyticsData.mockReturnValue(data)
    render(<AnalyticsDashboard onNavigate={NOOP} />)

    // Concept Progress: has a numeric value (readinessPct derived from overallAccuracy=70).
    expect(screen.getByText('CONCEPT PROGRESS')).toBeInTheDocument()
    expect(screen.getByTestId('concept-progress-pct')).toHaveTextContent('70')

    // Step 1 Readiness: explicitly unavailable, not a contradictory 0%/"Not ready".
    expect(screen.getByTestId('step1-readiness-unavailable')).toBeInTheDocument()
    expect(screen.queryByText(/not ready/i)).toBeNull()
  })

  it('does not render the raw "Exam Ready" backend status text inside the Concept Progress card when backend mastery data is populated', () => {
    // rdHook.data is mocked null in every other test in this file — that
    // blind spot would hide the exact conflation this phase targets: the
    // backend's ReadinessStatus enum includes 'Exam Ready', which reads as
    // standardized exam evidence if shown verbatim inside a card titled
    // "CONCEPT PROGRESS". Populate it here to prove the card never surfaces
    // that raw string, without changing the enum/thresholds themselves.
    useReadiness.mockReturnValue({
      loading: false,
      error: null,
      data: {
        overallReadiness: 88,
        status: 'Exam Ready',
        readinessMetric: 'Concept Progress',
        components: { mastery: 40, coverage: 18, diversity: 13, recentPerformance: 17 },
        distribution: { priority: 1, focus: 2, reinforced: 3, ontrack: 10 },
      },
    })
    buildAnalyticsData.mockReturnValue(makeData(3))
    render(<AnalyticsDashboard onNavigate={NOOP} />)

    expect(screen.getByText('CONCEPT PROGRESS')).toBeInTheDocument()
    expect(screen.queryByText('Exam Ready')).toBeNull()
    expect(screen.getByText('Strong Progress')).toBeInTheDocument()
  })
})
