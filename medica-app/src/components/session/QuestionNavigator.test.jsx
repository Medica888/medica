import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import QuestionNavigator from './QuestionNavigator'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeQs(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `q${i + 1}` }))
}

const NOOP_STATUS = () => 'unanswered'

// ── Core: one tile per question ───────────────────────────────────────────────

describe('QuestionNavigator — renders one tile per question', () => {
  it('renders N tiles for N questions', () => {
    render(
      <QuestionNavigator
        questions={makeQs(10)}
        currentIndex={0}
        onSelect={vi.fn()}
        getStatus={NOOP_STATUS}
        mode="exam"
      />
    )
    const tiles = screen.getAllByRole('button')
    expect(tiles.length).toBe(10)
  })

  it('renders 40 tiles for a 40-question session', () => {
    render(
      <QuestionNavigator
        questions={makeQs(40)}
        currentIndex={0}
        onSelect={vi.fn()}
        getStatus={NOOP_STATUS}
        mode="exam"
      />
    )
    expect(screen.getAllByRole('button').length).toBe(40)
  })

  it('tiles show sequential question numbers', () => {
    render(
      <QuestionNavigator
        questions={makeQs(5)}
        currentIndex={0}
        onSelect={vi.fn()}
        getStatus={NOOP_STATUS}
        mode="exam"
      />
    )
    for (let n = 1; n <= 5; n++) {
      expect(screen.getByText(String(n))).toBeInTheDocument()
    }
  })
})

// ── Core: click calls onSelect with correct index ─────────────────────────────

describe('QuestionNavigator — clicking tile calls onSelect', () => {
  it('clicking Q1 calls onSelect(0)', () => {
    const onSelect = vi.fn()
    render(
      <QuestionNavigator
        questions={makeQs(5)}
        currentIndex={0}
        onSelect={onSelect}
        getStatus={NOOP_STATUS}
        mode="exam"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Question 1/i }))
    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('clicking Q5 calls onSelect(4)', () => {
    const onSelect = vi.fn()
    render(
      <QuestionNavigator
        questions={makeQs(5)}
        currentIndex={0}
        onSelect={onSelect}
        getStatus={NOOP_STATUS}
        mode="exam"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Question 5/i }))
    expect(onSelect).toHaveBeenCalledWith(4)
  })

  it('clicking Q10 in a 40-question session calls onSelect(9)', () => {
    const onSelect = vi.fn()
    render(
      <QuestionNavigator
        questions={makeQs(40)}
        currentIndex={0}
        onSelect={onSelect}
        getStatus={NOOP_STATUS}
        mode="exam"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Question 10, unanswered/i }))
    expect(onSelect).toHaveBeenCalledWith(9)
  })
})

// ── Core: status → CSS class and aria-label ───────────────────────────────────

describe('QuestionNavigator — status maps to class and aria-label', () => {
  const STATUSES = [
    { status: 'unanswered',      ariaSnippet: 'unanswered' },
    { status: 'current',         ariaSnippet: 'current' },
    { status: 'answered',        ariaSnippet: 'answered' },
    { status: 'marked',          ariaSnippet: 'marked for review' },
    { status: 'marked-answered', ariaSnippet: 'answered and marked for review' },
    { status: 'correct',         ariaSnippet: 'correct' },
    { status: 'incorrect',       ariaSnippet: 'incorrect' },
    { status: 'selected',        ariaSnippet: 'answer selected' },
    { status: 'revealed',        ariaSnippet: 'explained' },
  ]

  STATUSES.forEach(({ status, ariaSnippet }) => {
    it(`status "${status}" → .qn-tile.${status} and aria-label includes "${ariaSnippet}"`, () => {
      const { container } = render(
        <QuestionNavigator
          questions={[{ id: 'q1' }]}
          currentIndex={null}
          onSelect={vi.fn()}
          getStatus={() => status}
          mode="exam"
        />
      )
      const tile = container.querySelector(`.qn-tile.${status}`)
      expect(tile).toBeTruthy()
      expect(tile).toHaveAttribute('aria-label', `Question 1, ${ariaSnippet}`)
    })
  })

  it('current tile has aria-current="true"', () => {
    render(
      <QuestionNavigator
        questions={makeQs(3)}
        currentIndex={1}
        onSelect={vi.fn()}
        getStatus={(_, i) => i === 1 ? 'current' : 'unanswered'}
        mode="exam"
      />
    )
    const currentTile = screen.getByRole('button', { name: 'Question 2, current' })
    expect(currentTile).toHaveAttribute('aria-current', 'true')
  })

  it('non-current tiles do not have aria-current', () => {
    render(
      <QuestionNavigator
        questions={makeQs(3)}
        currentIndex={1}
        onSelect={vi.fn()}
        getStatus={(_, i) => i === 1 ? 'current' : 'unanswered'}
        mode="exam"
      />
    )
    const q1 = screen.getByRole('button', { name: 'Question 1, unanswered' })
    expect(q1).not.toHaveAttribute('aria-current')
  })
})

// ── Core: legend renders for each mode ───────────────────────────────────────

describe('QuestionNavigator — legend per mode', () => {
  it('exam mode legend contains "Answered" and "Marked"', () => {
    render(
      <QuestionNavigator questions={makeQs(3)} currentIndex={0}
        onSelect={vi.fn()} getStatus={NOOP_STATUS} mode="exam" />
    )
    expect(screen.getByText('Answered')).toBeInTheDocument()
    expect(screen.getByText('Marked')).toBeInTheDocument()
    expect(screen.getByText('Not answered')).toBeInTheDocument()
  })

  it('practice mode legend contains "Explained" and "Selected"', () => {
    render(
      <QuestionNavigator questions={makeQs(3)} currentIndex={0}
        onSelect={vi.fn()} getStatus={NOOP_STATUS} mode="practice" />
    )
    expect(screen.getByText('Explained')).toBeInTheDocument()
    expect(screen.getByText('Selected')).toBeInTheDocument()
  })

  it('coach mode legend contains "Explained" and "Selected"', () => {
    render(
      <QuestionNavigator questions={makeQs(3)} currentIndex={0}
        onSelect={vi.fn()} getStatus={NOOP_STATUS} mode="coach" />
    )
    expect(screen.getByText('Explained')).toBeInTheDocument()
    expect(screen.getByText('Selected')).toBeInTheDocument()
  })

  it('review mode legend contains "Correct", "Incorrect", "Marked"', () => {
    render(
      <QuestionNavigator questions={makeQs(3)} currentIndex={null}
        onSelect={vi.fn()} getStatus={NOOP_STATUS} mode="review" />
    )
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
    expect(screen.getByText('Marked')).toBeInTheDocument()
  })

  it('exam-submitted mode legend contains "Correct" and "Incorrect"', () => {
    render(
      <QuestionNavigator questions={makeQs(3)} currentIndex={0}
        onSelect={vi.fn()} getStatus={NOOP_STATUS} mode="exam-submitted" />
    )
    expect(screen.getByText('Correct')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })
})
