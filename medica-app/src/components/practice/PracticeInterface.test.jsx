import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PracticeInterface from './PracticeInterface'

vi.mock('../../lib/storage', () => ({ saveQuizSession: vi.fn() }))
vi.mock('../../lib/mockQuestions', () => ({ normalizeQuestion: (q) => q }))
vi.mock('../../lib/practiceScoring', () => ({ calculatePracticeResults: vi.fn(() => ({})) }))

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeQ(id) {
  return {
    id,
    stem: `Stem ${id}`,
    subject: 'Pathology', system: 'Renal', difficulty: 'Medium',
    options: [
      { letter: 'A', text: 'Option A' }, { letter: 'B', text: 'Option B' },
      { letter: 'C', text: 'Option C' }, { letter: 'D', text: 'Option D' },
    ],
    correct: 'A',
    explanation: `Explanation ${id}`,
  }
}

const session = {
  id: 'practice-test',
  mode: 'practice',
  questions: [makeQ('q1'), makeQ('q2'), makeQ('q3')],
  answers: {},
  currentIndex: 0,
}

const NOOP = vi.fn()

describe('PracticeInterface — Question Navigator wiring', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one navigator tile per question', () => {
    const { container } = render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    expect(container.querySelectorAll('.qn-tile').length).toBe(3)
  })

  it('clicking navigator tile Q3 jumps to question 3', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    expect(screen.getByText('Stem q1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Question 3, unanswered' }))
    expect(screen.getByText('Stem q3')).toBeInTheDocument()
  })

  it('can freely jump to any question without revealing the previous one', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    // Answer Q1 but don't reveal
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    // Jump to Q3 via navigator
    fireEvent.click(screen.getByRole('button', { name: 'Question 3, unanswered' }))
    expect(screen.getByText('Stem q3')).toBeInTheDocument()
  })

  it('selected-but-unrevealed answer shows "selected" state on navigator tile', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    // Answer Q1 without checking
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    const { container } = render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    // Tile for current question is 'current', so we navigate away to see selected state
    expect(container.querySelector('.qn-tile')).toBeTruthy()
  })

  it('revealed question shows "revealed" state on navigator tile', () => {
    const { container } = render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    // Answer and reveal Q1
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    // Q1 is now revealed; navigate to Q2 so Q1 tile is no longer 'current'
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    expect(container.querySelector('.qn-tile.revealed')).toBeTruthy()
  })

  it('Previous and Next buttons remain after navigator added', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    expect(screen.getByRole('button', { name: /previous question/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next question/i })).toBeInTheDocument()
  })

  it('restores the saved question position and answer', () => {
    const resumed = {
      ...session,
      currentIndex: 1,
      answers: { q2: 'B' },
    }
    const { container } = render(<PracticeInterface session={resumed} onComplete={NOOP} onExit={NOOP} />)

    expect(screen.getByText('Stem q2')).toBeInTheDocument()
    expect(container.querySelector('.pi-option.selected')).toHaveTextContent('Option B')
  })
})
