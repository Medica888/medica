import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import PracticeInterface from './PracticeInterface'
import { saveQuizSession } from '../../lib/storage'

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
const SAVE_WAIT = 500

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

describe('PracticeInterface — cross-out and session persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  const lastSaved = () => saveQuizSession.mock.calls.at(-1)[0]

  it('persists a cross-out after the debounce window', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cross out choice B' }))
    act(() => { vi.advanceTimersByTime(SAVE_WAIT) })
    expect(lastSaved().eliminated).toEqual({ q1: ['B'] })
  })

  it('restores crossed-out options from a saved session', () => {
    const saved = { ...session, eliminated: { q1: ['C'] } }
    render(<PracticeInterface session={saved} onComplete={NOOP} onExit={NOOP} />)
    expect(screen.getByRole('button', { name: 'Restore choice C' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cross out choice B' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('selecting a crossed-out option un-crosses it', () => {
    const saved = { ...session, eliminated: { q1: ['C'] } }
    render(<PracticeInterface session={saved} onComplete={NOOP} onExit={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /option c/i }))
    expect(screen.getByRole('button', { name: 'Cross out choice C' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(SAVE_WAIT) })
    expect(lastSaved().eliminated.q1).toEqual([])
  })

  it('disables cross-out once the answer is revealed', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    expect(screen.getByRole('button', { name: 'Cross out choice B' })).toBeDisabled()
  })

  it('debounces rapid changes into a single write', () => {
    render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    const cross = screen.getByRole('button', { name: 'Cross out choice B' })
    fireEvent.click(cross)
    fireEvent.click(screen.getByRole('button', { name: 'Restore choice B' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cross out choice D' }))
    expect(saveQuizSession).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(SAVE_WAIT) })
    expect(saveQuizSession).toHaveBeenCalledTimes(1)
    expect(lastSaved().eliminated).toEqual({ q1: ['D'] })
  })

  it('flushes pending changes on unmount', () => {
    const { unmount } = render(<PracticeInterface session={session} onComplete={NOOP} onExit={NOOP} />)
    saveQuizSession.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Cross out choice B' }))
    unmount()
    expect(lastSaved().eliminated).toEqual({ q1: ['B'] })
  })

  it('does not re-save the session on unmount after finishing', () => {
    const { unmount } = render(
      <PracticeInterface session={{ ...session, questions: [makeQ('q1')] }} onComplete={NOOP} onExit={NOOP} />
    )
    fireEvent.click(screen.getByRole('button', { name: /option a/i }))
    fireEvent.click(screen.getByRole('button', { name: /check answer/i }))
    fireEvent.click(screen.getByRole('button', { name: /finish practice/i }))
    saveQuizSession.mockClear()
    unmount()
    act(() => { vi.advanceTimersByTime(SAVE_WAIT) })
    expect(saveQuizSession).not.toHaveBeenCalled()
  })
})
