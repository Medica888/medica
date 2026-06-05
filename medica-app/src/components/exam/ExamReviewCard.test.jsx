import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ExamReviewCard from './ExamReviewCard'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(),
}))

import { saveQuestionReport } from '../../lib/storage'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OPTIONS = [
  { letter: 'A', text: 'Prerenal azotemia' },
  { letter: 'B', text: 'Acute tubular necrosis' },
  { letter: 'C', text: 'Renal vein thrombosis' },
  { letter: 'D', text: 'Glomerulonephritis' },
]

const makeQ = (overrides = {}) => ({
  id: 'q1',
  stem: 'A 28-year-old woman presents with fever and right flank pain.',
  subject: 'Pathology',
  system: 'Renal',
  topic: 'AKI',
  difficulty: 'Medium',
  options: OPTIONS,
  correct: 'A',
  explanation: 'Prerenal azotemia from dehydration is the most common cause.',
  pearl: 'BUN:Cr ratio > 20:1 suggests prerenal.',
  memoryAnchor: 'No fluid → no flow → prerenal.',
  commonTrap: 'Do not pick intrinsic renal injury just because the kidney is infected.',
  ...overrides,
})

const SESSION_CONFIG = {
  subject: 'Pathology',
  system: 'Renal',
  topic: 'AKI',
  source: 'ai',
}

function setup(props = {}) {
  const userAnswer = 'userAnswer' in props ? props.userAnswer : 'A'
  return render(
    <ExamReviewCard
      question={makeQ(props.question)}
      userAnswer={userAnswer}
      questionNumber={props.questionNumber ?? 1}
      isMarked={props.isMarked ?? false}
      sessionConfig={props.sessionConfig ?? SESSION_CONFIG}
    />
  )
}

// ── Test 2: ExamReviewCard renders full question content ──────────────────────

describe('ExamReviewCard — renders full question content', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the question stem', () => {
    setup()
    expect(screen.getByText(/28-year-old woman/)).toBeInTheDocument()
  })

  it('renders all answer options', () => {
    setup()
    expect(screen.getByText('Prerenal azotemia')).toBeInTheDocument()
    expect(screen.getByText('Acute tubular necrosis')).toBeInTheDocument()
    expect(screen.getByText('Renal vein thrombosis')).toBeInTheDocument()
    expect(screen.getByText('Glomerulonephritis')).toBeInTheDocument()
  })

  it('shows the user selected answer in the answer summary', () => {
    setup({ userAnswer: 'A' })
    expect(screen.getByText(/You chose/)).toBeInTheDocument()
  })

  it('shows the correct answer letter when unanswered', () => {
    const { container } = setup({ userAnswer: null })
    const summary = container.querySelector('.erv-answer-summary')
    expect(summary.textContent).toMatch(/Not answered/)
    expect(summary.textContent).toMatch(/Correct answer/)
  })

  it('renders the explanation', () => {
    setup()
    expect(screen.getByText(/Prerenal azotemia from dehydration/)).toBeInTheDocument()
  })

  it('renders the high-yield pearl', () => {
    setup()
    expect(screen.getByText(/BUN:Cr ratio/)).toBeInTheDocument()
  })

  it('renders the memory anchor', () => {
    setup()
    expect(screen.getByText(/No fluid → no flow/)).toBeInTheDocument()
  })

  it('renders the common trap', () => {
    setup()
    expect(screen.getByText(/intrinsic renal injury/)).toBeInTheDocument()
  })

  it('does not crash when optional fields are absent', () => {
    setup({ question: makeQ({ explanation: undefined, pearl: undefined, memoryAnchor: undefined, commonTrap: undefined }) })
    expect(screen.getByText(/28-year-old woman/)).toBeInTheDocument()
  })

  it('shows Correct badge when user answer is right', () => {
    setup({ userAnswer: 'A' })
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('shows Incorrect badge when user answer is wrong', () => {
    setup({ userAnswer: 'B' })
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
  })

  it('shows Unanswered badge when no answer', () => {
    const { container } = setup({ userAnswer: null })
    const badge = container.querySelector('.erv-result-badge.skipped')
    expect(badge).toBeTruthy()
    expect(badge.textContent).toBe('Unanswered')
  })
})

// ── Tests 1 & 2: Selected answers never appear as Unanswered ─────────────────

describe('ExamReviewCard — answered questions never show as Unanswered', () => {
  beforeEach(() => vi.clearAllMocks())

  it('correct answer → Correct badge, never Unanswered', () => {
    const { container } = setup({ userAnswer: 'A', question: makeQ({ correct: 'A' }) })
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Correct')
    expect(badge.textContent).not.toBe('Unanswered')
  })

  it('wrong answer → Incorrect badge, never Unanswered', () => {
    const { container } = setup({ userAnswer: 'B', question: makeQ({ correct: 'A' }) })
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Incorrect')
    expect(badge.textContent).not.toBe('Unanswered')
  })

  it('truly unanswered → Unanswered badge', () => {
    const { container } = setup({ userAnswer: null })
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Unanswered')
  })

  it('lowercase letter answer treated as answered (normalisation)', () => {
    const { container } = setup({ userAnswer: 'a', question: makeQ({ correct: 'A' }) })
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Correct')
    expect(badge.textContent).not.toBe('Unanswered')
  })

  it('option-D correct answer handled', () => {
    const { container } = setup({ userAnswer: 'D', question: makeQ({ correct: 'D' }) })
    const badge = container.querySelector('.erv-result-badge')
    expect(badge.textContent).toBe('Correct')
  })

  it('option-state: correct option highlighted green when user answered correctly', () => {
    const { container } = setup({ userAnswer: 'A', question: makeQ({ correct: 'A' }) })
    const correctOpt = container.querySelector('.erv-opt.correct')
    expect(correctOpt).toBeTruthy()
    expect(container.querySelector('.erv-opt.wrong')).toBeNull()
  })

  it('option-state: wrong option highlighted red and correct option green when wrong answer', () => {
    const { container } = setup({ userAnswer: 'B', question: makeQ({ correct: 'A' }) })
    expect(container.querySelector('.erv-opt.correct')).toBeTruthy()
    expect(container.querySelector('.erv-opt.wrong')).toBeTruthy()
  })

  it('option-state: only correct option highlighted when question is unanswered', () => {
    const { container } = setup({ userAnswer: null })
    expect(container.querySelector('.erv-opt.correct')).toBeTruthy()
    expect(container.querySelector('.erv-opt.wrong')).toBeNull()
  })
})

// ── Test 6: User can report a question from post-exam review ──────────────────

describe('ExamReviewCard — report action', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the Report button', () => {
    setup()
    expect(screen.getByRole('button', { name: /report/i })).toBeInTheDocument()
  })

  it('renders the reason select with all four reasons', () => {
    setup()
    const select = screen.getByRole('combobox', { name: /report question reason/i })
    expect(select).toBeInTheDocument()
    expect(select.querySelector('option[value="wrong_answer"]')).toBeTruthy()
    expect(select.querySelector('option[value="bad_explanation"]')).toBeTruthy()
    expect(select.querySelector('option[value="off_topic"]')).toBeTruthy()
    expect(select.querySelector('option[value="ambiguous_or_insufficient_clues"]')).toBeTruthy()
  })

  it('calls saveQuestionReport with mode=exam context when Report is clicked', () => {
    saveQuestionReport.mockReturnValue({ id: 'q1:wrong_answer' })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(saveQuestionReport).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q1' }),
      'wrong_answer',
      expect.objectContaining({ mode: 'exam' }),
    )
  })

  it('includes requested subject and system from sessionConfig in context', () => {
    saveQuestionReport.mockReturnValue({ id: 'q1:wrong_answer' })
    setup({ sessionConfig: { subject: 'Pathology', system: 'Renal', source: 'ai' } })
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(saveQuestionReport).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ subject: 'Pathology', system: 'Renal', source: 'ai' }),
    )
  })
})

// ── Test 7: Report includes exam context ─────────────────────────────────────

describe('ExamReviewCard — report context', () => {
  beforeEach(() => vi.clearAllMocks())

  it('mode is always exam', () => {
    saveQuestionReport.mockReturnValue({ id: 'q1:off_topic' })
    setup()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'off_topic' } })
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(saveQuestionReport.mock.calls[0][2]).toMatchObject({ mode: 'exam' })
  })
})

// ── Test 8: ambiguous_or_insufficient_clues reason works ─────────────────────

describe('ExamReviewCard — ambiguous_or_insufficient_clues reason', () => {
  beforeEach(() => vi.clearAllMocks())

  it('can select and submit ambiguous_or_insufficient_clues', () => {
    saveQuestionReport.mockReturnValue({ id: 'q1:ambiguous_or_insufficient_clues' })
    setup()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ambiguous_or_insufficient_clues' } })
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(saveQuestionReport).toHaveBeenCalledWith(
      expect.anything(),
      'ambiguous_or_insufficient_clues',
      expect.objectContaining({ mode: 'exam' }),
    )
  })
})

// ── Test 9: UI shows confirmation after report ────────────────────────────────

describe('ExamReviewCard — confirmation after report', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows Saved confirmation after successful report', () => {
    saveQuestionReport.mockReturnValue({ id: 'q1:wrong_answer' })
    setup()
    expect(screen.queryByText('Saved')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('clears confirmation when reason is changed after reporting', () => {
    saveQuestionReport.mockReturnValue({ id: 'q1:wrong_answer' })
    setup()
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bad_explanation' } })
    expect(screen.queryByText('Saved')).toBeNull()
  })
})

// ── Test 10: Review page does not crash if report save fails ─────────────────

describe('ExamReviewCard — graceful report failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not show confirmation when saveQuestionReport returns null', () => {
    saveQuestionReport.mockReturnValue(null)
    setup()
    fireEvent.click(screen.getByRole('button', { name: /report/i }))
    expect(screen.queryByText('Saved')).toBeNull()
  })

  it('does not throw when saveQuestionReport throws', () => {
    saveQuestionReport.mockImplementation(() => { throw new Error('storage full') })
    setup()
    expect(() => fireEvent.click(screen.getByRole('button', { name: /report/i }))).not.toThrow()
  })
})
