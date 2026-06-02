import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuizSession from './QuizSession.jsx'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(() => ({ id: 'report-1' })),
  saveQuizSession: vi.fn(),
}))

const baseSession = {
  id: 'session-test',
  mode: 'exam',
  answers: {},
  currentIndex: 0,
  questions: [
    {
      id: 'q1',
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      difficulty: 'Balanced',
      stem: 'A patient develops a medication adverse effect.',
      options: [
        { letter: 'A', text: 'ACE inhibitor' },
        { letter: 'B', text: 'Beta blocker' },
        { letter: 'C', text: 'Loop diuretic' },
        { letter: 'D', text: 'Thiazide' },
      ],
      correctAnswer: 'b',
      explanation: 'Beta blocker is the supported answer.',
      pearl: 'Normalize answer aliases before comparing.',
    },
  ],
}

describe('QuizSession exam answer display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses normalized correctAnswer fallback when showing submitted exam results', () => {
    render(<QuizSession session={baseSession} onExit={vi.fn()} onComplete={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /beta blocker/i }))
    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }))

    expect(screen.getByText('1/1 correct')).toBeInTheDocument()
    expect(screen.getByText('Correct - B is right')).toBeInTheDocument()
  })

  it('normalizes lowercase stored answers when scoring the exam badge', () => {
    render(
      <QuizSession
        session={{
          ...baseSession,
          answers: { q1: 'b' },
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /submit exam/i }))

    expect(screen.getByText('1/1 correct')).toBeInTheDocument()
  })

  it('labels mock-fallback sessions as validated local bank', () => {
    render(
      <QuizSession
        session={{
          ...baseSession,
          source: 'mock-fallback',
          config: { difficulty: 'UWorld Challenge', fallbackReason: 'live_ai_low_yield' },
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('Validated Local Bank')).toBeInTheDocument()
  })

  it('labels AI sessions as live AI', () => {
    render(
      <QuizSession
        session={{
          ...baseSession,
          source: 'ai',
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('Live AI')).toBeInTheDocument()
  })

  it('shows medical-review telemetry for live AI sessions', () => {
    render(
      <QuizSession
        session={{
          ...baseSession,
          source: 'ai',
          generationTelemetry: {
            medicalReviewRequested: 12,
            medicalReviewPassed: 8,
            stoppedReason: 'requested_count_reached',
          },
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('8/12 medically reviewed')).toBeInTheDocument()
    expect(screen.getByText('target reached')).toBeInTheDocument()
  })

  it('shows the fallback reason for validated local bank sessions', () => {
    render(
      <QuizSession
        session={{
          ...baseSession,
          source: 'mock-fallback',
          config: { difficulty: 'UWorld Challenge', fallbackReason: 'live_ai_low_yield' },
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('Fallback: live AI low yield')).toBeInTheDocument()
  })
})
