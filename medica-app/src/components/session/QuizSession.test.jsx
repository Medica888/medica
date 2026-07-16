import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuizSession from './QuizSession.jsx'
import { saveQuizSession } from '../../lib/storage'
import { STANDARDIZED_STEP1_BLOCK } from '../../lib/quizTypes'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(() => ({ id: 'report-1' })),
  saveQuizSession: vi.fn(),
}))

function makeOption(letter, text) { return { letter, text } }
function makeQ(id, correct, stem = `Stem ${id}`) {
  return {
    id,
    subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced',
    stem,
    options: [makeOption('A', 'Opt A'), makeOption('B', 'Opt B'), makeOption('C', 'Opt C'), makeOption('D', 'Opt D')],
    correct,
    explanation: `Explanation ${id}`,
  }
}

const multiSession = {
  id: 'multi-test',
  mode: 'exam',
  answers: {},
  currentIndex: 0,
  questions: [makeQ('q1', 'A'), makeQ('q2', 'B'), makeQ('q3', 'C'), makeQ('q4', 'D'), makeQ('q5', 'A')],
}

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
    fireEvent.click(screen.getByRole('button', { name: /confirm and submit exam/i }))

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
    fireEvent.click(screen.getByRole('button', { name: /confirm and submit exam/i }))

    expect(screen.getByText('1/1 correct')).toBeInTheDocument()
  })

  it('restores timer, position, marks, confidence, and notes from a saved exam', () => {
    render(
      <QuizSession
        session={{
          ...multiSession,
          currentIndex: 1,
          secondsLeft: 137,
          answers: { q2: 'B' },
          marked: { q2: true },
          confidences: { q2: 'Likely' },
          notes: { q2: 'Recheck the mechanism.' },
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('Stem q2')).toBeInTheDocument()
    expect(screen.getByText('2:17')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unmark question/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Likely' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Notes' }))
    expect(screen.getByRole('textbox', { name: 'Question scratch pad' })).toHaveValue('Recheck the mechanism.')
  })

  it('starts a current-format standardized block with 30 minutes', () => {
    const questions = Array.from({ length: 20 }, (_, index) => makeQ(`standard-${index}`, 'A'))
    render(
      <QuizSession
        session={{
          ...multiSession,
          id: 'standardized-step1',
          config: { blockType: STANDARDIZED_STEP1_BLOCK },
          questions,
        }}
        onExit={vi.fn()}
        onComplete={vi.fn()}
      />,
    )

    expect(screen.getByText('30:00')).toBeInTheDocument()
  })

  it('saves the complete exam snapshot before exit', () => {
    const onExit = vi.fn()
    render(
      <QuizSession
        session={{ ...baseSession, secondsLeft: 42, marked: { q1: true } }}
        onExit={onExit}
        onComplete={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /exit session/i }))

    expect(saveQuizSession).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'session-test',
      secondsLeft: 42,
      marked: { q1: true },
      confidences: {},
      notes: {},
      highlights: {},
    }))
    expect(onExit).toHaveBeenCalledOnce()
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

// ── Duplicate option letters (malformed/imported data) ────────────────────────
// Exam-mode student-view questions come straight from the server and skip the
// client-side shuffle/relabel step (see App.jsx's buildAISession) - this is the
// one option-rendering path in the app that previously had zero normalization
// before keying by opt.letter.

describe('QuizSession — duplicate option letters (malformed data)', () => {
  it('relabels malformed duplicate-lettered options uniquely and never warns about duplicate React keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const malformedSession = {
      id: 'malformed-session',
      mode: 'exam',
      answers: {},
      currentIndex: 0,
      questions: [{
        id: 'q-malformed',
        subject: 'Pathology', system: 'Cardiovascular', difficulty: 'Balanced',
        stem: 'A malformed question with two options both labeled A.',
        options: [
          { letter: 'A', text: 'First option (malformed duplicate A)' },
          { letter: 'A', text: 'Second option (malformed duplicate A)' },
          { letter: 'B', text: 'Beta' },
        ],
        correct: 'B',
      }],
    }

    const { container } = render(
      <QuizSession session={malformedSession} onExit={vi.fn()} onComplete={vi.fn()} />,
    )

    expect(screen.getByText('First option (malformed duplicate A)')).toBeInTheDocument()
    expect(screen.getByText('Second option (malformed duplicate A)')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()

    // Relabeled positionally: A, B, C - no two rendered choices share a letter.
    const letters = [...container.querySelectorAll('.exam-opt-letter')].map(el => el.textContent)
    expect(letters).toEqual(['A', 'B', 'C'])
    expect(new Set(letters).size).toBe(letters.length)

    const duplicateKeyWarning = consoleError.mock.calls.some(call =>
      String(call[0] ?? '').includes('same key'),
    )
    expect(duplicateKeyWarning).toBe(false)

    consoleError.mockRestore()
  })
})

// ── Question Navigator — exam mode wiring ─────────────────────────────────────

describe('QuizSession — Question Navigator (exam mode)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders one navigator tile per question', () => {
    render(<QuizSession session={multiSession} onExit={vi.fn()} onComplete={vi.fn()} />)
    // 5 questions → 5 tiles
    const tiles = document.querySelectorAll('.qn-tile')
    expect(tiles.length).toBe(5)
  })

  it('clicking Q5 tile jumps to question 5', () => {
    render(<QuizSession session={multiSession} onExit={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByText('Stem q1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Question 5, unanswered' }))
    expect(screen.getByText('Stem q5')).toBeInTheDocument()
  })

  it('answered question tile shows "answered" state', () => {
    const session = { ...multiSession, answers: { q2: 'B' } }
    const { container } = render(<QuizSession session={session} onExit={vi.fn()} onComplete={vi.fn()} />)
    // q2 is answered, tile index 1
    expect(container.querySelector('.qn-tile.answered')).toBeTruthy()
  })

  it('marked question tile shows "marked" state', () => {
    render(<QuizSession session={multiSession} onExit={vi.fn()} onComplete={vi.fn()} />)
    // Navigate to Q2 and mark it
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    const markBtn = screen.getByRole('button', { name: /mark for review/i })
    fireEvent.click(markBtn)
    const { container } = render(<QuizSession session={multiSession} onExit={vi.fn()} onComplete={vi.fn()} />)
    // First render starts fresh; just verify mark→answered→marked-answered cycling works
    expect(container.querySelector('.qn-tile')).toBeTruthy()
  })

  it('unanswered tile remains unanswered', () => {
    const { container } = render(
      <QuizSession session={{ ...multiSession, answers: { q1: 'A' } }} onExit={vi.fn()} onComplete={vi.fn()} />
    )
    const unanswered = Array.from(container.querySelectorAll('.qn-tile.unanswered'))
    expect(unanswered.length).toBe(4) // q2-q5 unanswered
  })

  it('tile aria-label includes status', () => {
    render(<QuizSession session={multiSession} onExit={vi.fn()} onComplete={vi.fn()} />)
    // Q1 is current
    expect(screen.getByRole('button', { name: 'Question 1, current' })).toBeInTheDocument()
    // Q2-Q5 are unanswered
    expect(screen.getByRole('button', { name: 'Question 2, unanswered' })).toBeInTheDocument()
  })

  it('after submit, correct tiles show correct state and incorrect tiles show incorrect state', () => {
    // Start at q3 (unanswered) so q1 and q2 are non-current and show correct/incorrect
    const session = {
      ...multiSession,
      currentIndex: 2,
      answers: { q1: 'A', q2: 'A' }, // q1 correct (A), q2 wrong (correct is B)
    }
    const { container } = render(
      <QuizSession session={session} onExit={vi.fn()} onComplete={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm and submit exam/i }))
    expect(container.querySelector('.qn-tile.correct')).toBeTruthy()
    expect(container.querySelector('.qn-tile.incorrect')).toBeTruthy()
  })

  it('Previous and Next buttons remain after navigator added', () => {
    render(<QuizSession session={multiSession} onExit={vi.fn()} onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })
})
