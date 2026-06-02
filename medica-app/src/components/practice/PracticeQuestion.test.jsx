import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PracticeQuestion from './PracticeQuestion'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(),
}))

// ── Fixture ───────────────────────────────────────────────────────────────────

const OPTIONS = [
  { letter: 'A', text: 'ACE inhibitor' },
  { letter: 'B', text: 'Beta blocker' },
  { letter: 'C', text: 'Loop diuretic' },
  { letter: 'D', text: 'Thiazide' },
]

const makeQ = (overrides = {}) => ({
  id: 'q1',
  stem: 'A patient with hypertension develops a dry cough. Which drug class is most responsible?',
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  options: OPTIONS,
  correct: 'A',
  explanation: 'ACE inhibitors cause bradykinin accumulation leading to a dry cough.',
  pearl: 'Switch to ARB — no cough.',
  ...overrides,
})

function setup(props) {
  return render(<PracticeQuestion {...props} />)
}

const NOOP = vi.fn()

// ── Answer normalization — verdict display ────────────────────────────────────

describe('PracticeQuestion — normalized answer comparison (verdict)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "Correct" verdict when answered is lowercase letter matching uppercase correct', () => {
    // This test was RED before the normalizeAnswerLetter fix:
    // 'a' === 'A' → false → "Not quite" was shown even though answer is correct.
    setup({
      question: makeQ({ correct: 'A' }),
      questionNumber: 1,
      answered: 'a',       // lowercase — legacy/restored session value
      revealed: true,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    expect(screen.getByText('Correct — well done')).toBeInTheDocument()
    expect(screen.queryByText('Not quite')).toBeNull()
  })

  it('shows "Not quite" when lowercase answered does not match correct', () => {
    setup({
      question: makeQ({ correct: 'A' }),
      questionNumber: 1,
      answered: 'c',       // lowercase C — wrong answer
      revealed: true,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    expect(screen.getByText('Not quite')).toBeInTheDocument()
    expect(screen.queryByText('Correct — well done')).toBeNull()
  })

  it('shows "Correct" when correct field absent but correctAnswer exists (fallback)', () => {
    setup({
      question: makeQ({ correct: undefined, correctAnswer: 'A' }),
      questionNumber: 1,
      answered: 'A',
      revealed: true,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    expect(screen.getByText('Correct — well done')).toBeInTheDocument()
  })

  it('shows "Correct" when correctAnswer is lowercase and answered is uppercase', () => {
    setup({
      question: makeQ({ correct: undefined, correctAnswer: 'a' }),
      questionNumber: 1,
      answered: 'A',
      revealed: true,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    expect(screen.getByText('Correct — well done')).toBeInTheDocument()
  })
})

// ── Option state coloring ─────────────────────────────────────────────────────

describe('PracticeQuestion — normalized option state (coloring)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks option B as selected pre-reveal when answered is lowercase b', () => {
    // Before fix: 'B' === 'b' → false → no 'selected' class.
    // After fix:  normalizedAnswered='B', 'B' === 'B' → 'selected'.
    const { container } = setup({
      question: makeQ({ correct: 'A' }),
      questionNumber: 1,
      answered: 'b',
      revealed: false,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    // PracticeAnswerOption renders class "pi-option selected" for the selected option
    expect(container.querySelector('.pi-option.selected')).toBeTruthy()
  })

  it('marks wrong option as wrong post-reveal when answered is lowercase c (not correct)', () => {
    const { container } = setup({
      question: makeQ({ correct: 'A' }),
      questionNumber: 1,
      answered: 'c',
      revealed: true,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    expect(container.querySelector('.pi-option.wrong')).toBeTruthy()
    expect(container.querySelector('.pi-option.correct')).toBeTruthy()
  })

  it('no wrong option highlighted when answered matches correct (lowercase)', () => {
    const { container } = setup({
      question: makeQ({ correct: 'A' }),
      questionNumber: 1,
      answered: 'a',
      revealed: true,
      onAnswer: NOOP,
      onCheckAnswer: NOOP,
    })
    expect(container.querySelector('.pi-option.wrong')).toBeNull()
    expect(container.querySelector('.pi-option.correct')).toBeTruthy()
  })
})
