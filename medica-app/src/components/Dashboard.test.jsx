import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Dashboard from './Dashboard'
import { buildAnalyticsData } from '../lib/analyticsEngine'
import { saveLastQuizConfig, clearLastQuizConfig } from '../lib/storage'

vi.mock('../lib/analyticsEngine', () => ({
  buildAnalyticsData: vi.fn(),
}))

vi.mock('../lib/storage', () => ({
  getSessionHistory: vi.fn(() => [{ completedAt: '2026-06-14T08:00:00.000Z', total: 10 }]),
  getLastQuizSession: vi.fn(() => null),
  getFlashcards: vi.fn(() => []),
  getFlashcardReviewEvents: vi.fn(() => []),
  getLastPracticeResults: vi.fn(() => null),
  getLastCoachResults: vi.fn(() => null),
  saveLastQuizConfig: vi.fn(),
  clearLastQuizConfig: vi.fn(),
}))

function makeAnalytics(nextSession = {}) {
  return {
    empty: false,
    overview: {
      latestMedicaScore: 72,
      overallAccuracy: 80,
    },
    nextSession: {
      mode: 'coach',
      area: 'Loop diuretics',
      topic: 'Loop diuretic potassium wasting',
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      difficulty: 'Balanced',
      questionCount: 20,
      reasoning: 'Flashcard review is unstable.',
      ...nextSession,
    },
    weaknesses: {
      critical: [],
      moderate: [],
    },
  }
}

describe('Dashboard recommended quiz handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    buildAnalyticsData.mockReturnValue(makeAnalytics())
  })

  it('saves flashcard weakness topic, subject, system, and count for recommended sessions', () => {
    const onNavigate = vi.fn()
    render(<Dashboard onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole('button', { name: /start recommended session/i }))

    expect(saveLastQuizConfig).toHaveBeenCalledOnce()
    expect(saveLastQuizConfig.mock.calls[0][0]).toMatchObject({
      mode: 'coach',
      topic: 'Loop diuretic potassium wasting',
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      difficulty: 'Balanced',
      questionCount: 20,
    })
    expect(onNavigate).toHaveBeenCalledWith('create-quiz')
  })

  it('shows the recommended question count from nextSession', () => {
    render(<Dashboard onNavigate={vi.fn()} />)

    expect(screen.getByText('20 questions')).toBeTruthy()
    expect(screen.getByText(/Coach: Loop diuretics \(20 questions\)/i)).toBeTruthy()
  })

  it('clears stale saved config before opening a custom quiz', () => {
    const onNavigate = vi.fn()
    render(<Dashboard onNavigate={onNavigate} />)

    fireEvent.click(screen.getByRole('button', { name: /^Build Custom Set$/i }))

    expect(clearLastQuizConfig).toHaveBeenCalledOnce()
    expect(saveLastQuizConfig).not.toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('create-quiz')
  })

  it('keeps the first-time dashboard focused on one block-building CTA', () => {
    buildAnalyticsData.mockReturnValue({
      empty: true,
      overview: {},
      nextSession: null,
      weaknesses: { critical: [], moderate: [] },
    })

    render(<Dashboard onNavigate={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^Start First Session$/i })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Quick Actions' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Build Custom Set$/i })).toBeNull()
  })
})

