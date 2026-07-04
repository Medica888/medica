import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CoachInterface from './CoachInterface'

vi.mock('../../lib/storage', () => ({ saveQuizSession: vi.fn() }))
vi.mock('../../lib/mockQuestions', () => ({ normalizeQuestion: (q) => q }))
vi.mock('../../lib/coachScoring', () => ({ calculateCoachResults: vi.fn(() => ({})) }))

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
  id: 'coach-test',
  mode: 'coach',
  questions: [makeQ('q1'), makeQ('q2'), makeQ('q3')],
  answers: {},
  currentIndex: 0,
}

const NOOP = vi.fn()

describe('CoachInterface — Question Navigator wiring', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders one navigator tile per question', () => {
    const { container } = render(<CoachInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    expect(container.querySelectorAll('.qn-tile').length).toBe(3)
  })

  it('clicking navigator tile Q3 jumps to question 3', () => {
    render(<CoachInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    expect(screen.getByText('Stem q1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Question 3, unanswered' }))
    expect(screen.getByText('Stem q3')).toBeInTheDocument()
  })

  it('can freely jump to any question without requiring reveal first', () => {
    render(<CoachInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    expect(screen.getByText('Stem q2')).toBeInTheDocument()
  })

  it('selected-but-unexplained answer shows "selected" state', () => {
    const { container } = render(<CoachInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    // Jump away so Q1 tile is no longer 'current'
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    expect(container.querySelector('.qn-tile.selected')).toBeTruthy()
  })

  it('explained question shows "revealed" state on navigator tile', () => {
    const { container } = render(<CoachInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    // Answer and reveal Q1
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    // Navigate away so Q1 tile is visible as non-current
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    expect(container.querySelector('.qn-tile.revealed')).toBeTruthy()
  })

  it('Previous and Next buttons remain after navigator added', () => {
    render(<CoachInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    expect(screen.getByRole('button', { name: /previous question/i })).toBeInTheDocument()
  })

  it('restores the saved question position and answer', () => {
    const resumed = {
      ...session,
      currentIndex: 2,
      answers: { q3: 'B' },
    }
    const { container } = render(<CoachInterface session={resumed} onComplete={NOOP} onExit={NOOP} />)

    expect(screen.getByText('Stem q3')).toBeInTheDocument()
    expect(container.querySelector('.ci-option--selected')).toHaveTextContent('Option B')
  })
})
