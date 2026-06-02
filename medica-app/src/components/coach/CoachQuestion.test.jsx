import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import CoachQuestion from './CoachQuestion'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(),
}))

// ── Fixture ───────────────────────────────────────────────────────────────────

const OPTIONS = [
  { letter: 'A', text: 'Furosemide' },
  { letter: 'B', text: 'Metoprolol' },
  { letter: 'C', text: 'Amlodipine' },
  { letter: 'D', text: 'Spironolactone' },
]

const makeQ = (overrides = {}) => ({
  id: 'cq1',
  stem: 'A 55-year-old man with HFrEF needs a drug proven to reduce mortality. Which agent is most appropriate?',
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  options: OPTIONS,
  correct: 'B',
  explanation: 'Beta blockers reduce mortality in HFrEF by blunting sympathetic activation.',
  commonTrap: 'Furosemide relieves symptoms but has no mortality benefit.',
  optionExplanations: {
    A: 'Loop diuretic — relieves congestion but no mortality benefit.',
    B: 'Beta blocker — reduces mortality in HFrEF via adrenergic blockade.',
    C: 'CCB — may worsen HFrEF; avoid in decompensated patients.',
    D: 'Mineralocorticoid antagonist — has mortality benefit but was not listed as correct here.',
  },
  ...overrides,
})

const NOOP = vi.fn()

// ── Verdict via CoachExplanationPanel ────────────────────────────────────────

describe('CoachQuestion — normalized verdict (via CoachExplanationPanel)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows "Correct" verdict when answered is lowercase matching correct', () => {
    // CoachExplanationPanel already normalized, but test confirms end-to-end.
    render(
      <CoachQuestion
        question={makeQ({ correct: 'B' })}
        questionNumber={1}
        answered="b"     // lowercase — regression test
        revealed={true}
        onAnswer={NOOP}
        onCheckAnswer={NOOP}
      />,
    )
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('shows "Incorrect" verdict when answered is wrong (lowercase)', () => {
    render(
      <CoachQuestion
        question={makeQ({ correct: 'B' })}
        questionNumber={1}
        answered="a"     // lowercase A — wrong
        revealed={true}
        onAnswer={NOOP}
        onCheckAnswer={NOOP}
      />,
    )
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })

  it('shows "Correct" when correct field absent but correctAnswer exists', () => {
    render(
      <CoachQuestion
        question={makeQ({ correct: undefined, correctAnswer: 'B' })}
        questionNumber={1}
        answered="B"
        revealed={true}
        onAnswer={NOOP}
        onCheckAnswer={NOOP}
      />,
    )
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })
})

// ── Option state coloring via getOptionState ──────────────────────────────────

describe('CoachQuestion — normalized option state (coloring)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks option B as selected pre-reveal when answered is lowercase b', () => {
    // Before fix: 'B' === 'b' → false → nothing selected.
    // After fix:  normalizedAnswered='B', 'B' === 'B' → selected.
    const { container } = render(
      <CoachQuestion
        question={makeQ({ correct: 'A' })}
        questionNumber={1}
        answered="b"
        revealed={false}
        onAnswer={NOOP}
        onCheckAnswer={NOOP}
      />,
    )
    expect(container.querySelector('.ci-option--selected')).toBeTruthy()
  })

  it('marks wrong option as wrong post-reveal when answered is lowercase a (not correct)', () => {
    // correct='B', answered='a' → option A should have --wrong class.
    const { container } = render(
      <CoachQuestion
        question={makeQ({ correct: 'B' })}
        questionNumber={1}
        answered="a"     // lowercase wrong answer
        revealed={true}
        onAnswer={NOOP}
        onCheckAnswer={NOOP}
      />,
    )
    expect(container.querySelector('.ci-option--wrong')).toBeTruthy()
    expect(container.querySelector('.ci-option--correct')).toBeTruthy()
  })

  it('no wrong option highlighted when answered matches correct (lowercase)', () => {
    const { container } = render(
      <CoachQuestion
        question={makeQ({ correct: 'B' })}
        questionNumber={1}
        answered="b"     // lowercase correct answer
        revealed={true}
        onAnswer={NOOP}
        onCheckAnswer={NOOP}
      />,
    )
    expect(container.querySelector('.ci-option--wrong')).toBeNull()
    expect(container.querySelector('.ci-option--correct')).toBeTruthy()
  })
})
