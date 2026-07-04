import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import QBankPage from './QBankPage'
import { getBrowsableQuestionBank } from '../../lib/mockQuestions'
import { clearLastQuizSession, getLastQuizSession } from '../../lib/storage'

vi.mock('../../lib/storage', () => ({
  subscribeQuestionReports: vi.fn(() => () => {}),
  getLastQuizSession: vi.fn(() => null),
  getQBankProgressLedger: vi.fn(() => []),
  clearLastQuizSession: vi.fn(),
  filterReportedQuestions: vi.fn(questions => questions),
}))

vi.mock('../../lib/mockQuestions', () => ({
  getBrowsableQuestionBank: vi.fn(),
}))

function makeQuestion(id, overrides = {}) {
  return {
    id,
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    topic: 'Hypertension',
    testedConcept: `Concept ${id}`,
    stem: `Clinical stem for ${id}`,
    options: [
      { letter: 'A', text: `Option A ${id}` },
      { letter: 'B', text: `Option B ${id}` },
      { letter: 'C', text: `Option C ${id}` },
      { letter: 'D', text: `Option D ${id}` },
    ],
    correct: 'A',
    explanation: `Hidden explanation for ${id}`,
    ...overrides,
  }
}

const BASE_BANK = [
  makeQuestion('q1', { testedConcept: 'ACE inhibitor cough' }),
  makeQuestion('q2', {
    subject: 'Pathology', system: 'Respiratory', difficulty: 'NBME Difficult',
    topic: 'Pleural disease', testedConcept: 'Spontaneous pneumothorax',
  }),
  makeQuestion('q3', {
    subject: 'Physiology', system: 'Renal / Urinary', difficulty: 'UWorld Challenge',
    topic: 'Acid-base', testedConcept: 'Winter formula',
  }),
  makeQuestion('q4', {
    subject: 'Biochemistry', system: 'Multisystem', difficulty: 'Balanced',
    topic: 'Metabolism', testedConcept: 'TCA cycle',
  }),
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getBrowsableQuestionBank).mockReturnValue(BASE_BANK)
  // clearAllMocks() only clears call history, not mockReturnValue — reset this
  // explicitly so a test that sets an active session doesn't leak it into the next.
  vi.mocked(getLastQuizSession).mockReturnValue(null)
  // Local-bank behavior is under test here; the backend-driven catalog path has
  // its own suite below. Real .env sets VITE_USE_BACKEND=true for the app build.
  vi.stubEnv('VITE_USE_BACKEND', 'false')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('QBankPage', () => {
  it('renders the validated inventory without exposing answers or explanations', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'QBank', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('4 validated questions available')).toBeInTheDocument()
    expect(screen.queryByText('Hidden explanation for q1')).not.toBeInTheDocument()
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument()
  })

  it('searches concepts and combines subject, system, and difficulty filters with AND logic', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: 'pneumothorax' } })
    expect(screen.getByText('Spontaneous pneumothorax')).toBeInTheDocument()
    expect(screen.queryByText('ACE inhibitor cough')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Subject' }), { target: { value: 'Pathology' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'System' }), { target: { value: 'Respiratory' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Difficulty' }), { target: { value: 'NBME Difficult' } })
    expect(screen.getByTestId('qbk-match-count')).toHaveTextContent('1 matching question')
  })

  it('does not expose Multisystem as a separate filter choice', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const systemFilter = screen.getByRole('combobox', { name: 'System' })
    expect(systemFilter.querySelector('option[value="Multisystem"]')).toBeNull()
  })

  it('keeps selected questions while filters change', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Select question 1: ACE inhibitor cough' })
    fireEvent.click(checkbox)
    expect(screen.getByText('1', { selector: '.qbk-selection-count strong' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: 'no match' } })
    expect(screen.getByText(/no questions match/i)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: '' } })
    expect(screen.getByRole('checkbox', { name: 'Select question 1: ACE inhibitor cough' })).toBeChecked()
  })

  it('starts exactly the selected questions in the chosen mode', () => {
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1: ACE inhibitor cough' }))
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))

    expect(onStartSelected).toHaveBeenCalledTimes(1)
    expect(onStartSelected).toHaveBeenCalledWith({ mode: 'coach', questions: [BASE_BANK[0]], backendDriven: false })
  })

  it('enforces the 40-question selection limit', () => {
    const largeBank = Array.from({ length: 45 }, (_, index) => makeQuestion(`large-${index + 1}`))
    vi.mocked(getBrowsableQuestionBank).mockReturnValue(largeBank)
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('button', { name: 'Select filtered (up to 40)' }))
    expect(screen.getByText('40', { selector: '.qbk-selection-count strong' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))
    expect(onStartSelected.mock.calls[0][0].questions).toHaveLength(40)
  })

  it('previews options without answer state and closes with Escape', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const previewButtons = screen.getAllByRole('button', { name: 'Preview' })
    fireEvent.click(previewButtons[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Option A q1')).toBeInTheDocument()
    expect(screen.getByText(/answers and explanations remain hidden/i)).toBeInTheDocument()
    expect(document.activeElement).toHaveClass('qbk-preview-panel')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(previewButtons[0]).toHaveFocus()
  })
})

describe('QBankPage — progress filter strip', () => {
  it('renders All, Unseen, In progress, Needs review, Correct, Repeated correct chips', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const nav = screen.getByRole('navigation', { name: 'Filter by progress' })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /All/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unseen/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /In progress/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Needs review/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Correct/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Repeated correct/ })).toBeInTheDocument()
  })

  it('shows All chip as active by default and switches on click', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const allChip = screen.getByRole('button', { name: /All/ })
    expect(allChip).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /Unseen/ }))
    expect(screen.getByRole('button', { name: /Unseen/ })).toHaveAttribute('aria-pressed', 'true')
    expect(allChip).toHaveAttribute('aria-pressed', 'false')
  })

  it('status filter narrows the list to questions with that state', () => {
    // With no sessions provided, all questions are unseen
    render(<QBankPage onStartSelected={vi.fn()} sessions={[]} />)

    fireEvent.click(screen.getByRole('button', { name: /Unseen/ }))
    expect(screen.getByTestId('qbk-match-count')).toHaveTextContent('4 matching questions')

    fireEvent.click(screen.getByRole('button', { name: /Needs review/ }))
    expect(screen.getByTestId('qbk-match-count')).toHaveTextContent('0 matching questions')
  })

  it('status filter resets page to 1 when changed', () => {
    const largeBank = Array.from({ length: 25 }, (_, i) => makeQuestion(`lq-${i}`))
    vi.mocked(getBrowsableQuestionBank).mockReturnValue(largeBank)
    render(<QBankPage onStartSelected={vi.fn()} sessions={[]} />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Page 2/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Needs review/ }))
    expect(screen.queryByText(/Page 2/)).not.toBeInTheDocument()
  })
})

describe('QBankPage — session progress badges', () => {
  function makeSession(id, questionId, result, completedAt) {
    return {
      id,
      mode: 'practice',
      completedAt,
      questionAttempts: [{ questionId, result, mode: 'practice', sessionId: id, completedAt }],
    }
  }

  it('shows Needs review badge for a question with a latest incorrect attempt', () => {
    const sessions = [makeSession('s1', 'q1', 'incorrect', '2026-01-01T10:00:00.000Z')]
    const { container } = render(<QBankPage onStartSelected={vi.fn()} sessions={sessions} />)
    expect(container.querySelector('.qbk-status-needs-review')).toBeInTheDocument()
  })

  it('shows Correct badge for a question correct exactly once', () => {
    const sessions = [makeSession('s1', 'q1', 'correct', '2026-01-01T10:00:00.000Z')]
    const { container } = render(<QBankPage onStartSelected={vi.fn()} sessions={sessions} />)
    expect(container.querySelector('.qbk-status-correct')).toBeInTheDocument()
  })

  it('shows attempt count for an attempted question', () => {
    const sessions = [
      makeSession('s1', 'q1', 'incorrect', '2026-01-01T10:00:00.000Z'),
      makeSession('s2', 'q1', 'correct',   '2026-01-05T10:00:00.000Z'),
    ]
    render(<QBankPage onStartSelected={vi.fn()} sessions={sessions} />)
    expect(screen.getByText(/2×/)).toBeInTheDocument()
  })

  it('does not show any row-level status badge for unseen questions', () => {
    const { container } = render(<QBankPage onStartSelected={vi.fn()} sessions={[]} />)
    expect(container.querySelector('.qbk-status')).not.toBeInTheDocument()
  })
})

describe('QBankPage — resume active session', () => {
  it('does not show resume banner when no active QBank session exists', () => {
    vi.mocked(getLastQuizSession).mockReturnValue(null)
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /resume session/i })).not.toBeInTheDocument()
  })

  it('shows resume banner when an active (uncompleted) QBank session exists', () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [makeQuestion('q1'), makeQuestion('q2')],
    })
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.getByRole('button', { name: /resume session/i })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('2 questions in progress')
  })

  it('discards the saved session and removes the resume banner', () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [makeQuestion('q1')],
    })
    vi.mocked(clearLastQuizSession).mockImplementation(() => {
      vi.mocked(getLastQuizSession).mockReturnValue(null)
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<QBankPage onStartSelected={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))

    expect(clearLastQuizSession).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: /resume session/i })).not.toBeInTheDocument()
  })

  it('does not show resume banner when the saved session is already completed', () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: true,
      questions: [makeQuestion('q1')],
    })
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /resume session/i })).not.toBeInTheDocument()
  })

  it('resumes with saved answers and position while skipping stale questions', () => {
    // q1 and q99 (not in inventory) are in the active session — only q1 should be resumed
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'exam',
      completed: false,
      questions: [makeQuestion('q1'), { id: 'q99-stale' }],
      answers: { q1: 'B', 'q99-stale': 'C' },
      currentIndex: 0,
    })
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)
    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))

    expect(onStartSelected).toHaveBeenCalledOnce()
    const call = onStartSelected.mock.calls[0][0]
    expect(call.mode).toBe('exam')
    expect(call.questions).toHaveLength(1)
    expect(call.questions[0].id).toBe('q1')
    expect(call.resumeSession.answers).toEqual({ q1: 'B' })
    expect(call.resumeSession.currentIndex).toBe(0)
    expect(call.resumeSession.questions[0].options).toEqual(BASE_BANK[0].options)
  })

  it('remaps the saved current position after an earlier stale question is removed', () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [{ id: 'q99-stale' }, makeQuestion('q2'), makeQuestion('q3')],
      answers: { q2: 'A' },
      currentIndex: 1,
    })
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)
    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))

    const resumed = onStartSelected.mock.calls[0][0].resumeSession
    expect(resumed.questions.map(q => q.id)).toEqual(['q2', 'q3'])
    expect(resumed.currentIndex).toBe(0)
  })

  it('does not call onStartSelected if no safe questions remain (fail-closed)', () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [{ id: 'q-stale-only' }],
    })
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)
    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))
    expect(onStartSelected).not.toHaveBeenCalled()
  })

  it('resumes successfully: awaits onStartSelected and shows no error', async () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [makeQuestion('q1')],
    })
    const onStartSelected = vi.fn().mockResolvedValue(undefined)
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))

    await waitFor(() => expect(onStartSelected).toHaveBeenCalledOnce())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the start error and re-enables the button when resuming fails', async () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [makeQuestion('q1')],
    })
    const onStartSelected = vi.fn().mockRejectedValue(new Error('Could not resume this session. Please try again.'))
    render(<QBankPage onStartSelected={onStartSelected} />)

    const resumeButton = screen.getByRole('button', { name: /resume session/i })
    fireEvent.click(resumeButton)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not resume this session. Please try again.'))
    expect(screen.getByRole('button', { name: /resume session/i })).not.toBeDisabled()
  })

  it('disables Resume and Discard while a resume is in flight', async () => {
    vi.mocked(getLastQuizSession).mockReturnValue({
      source: 'validated-qbank',
      mode: 'practice',
      completed: false,
      questions: [makeQuestion('q1')],
    })
    let resolveStart
    const onStartSelected = vi.fn(() => new Promise(resolve => { resolveStart = resolve }))
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))

    expect(screen.getByRole('button', { name: /resuming/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled()

    resolveStart()
    await waitFor(() => expect(onStartSelected).toHaveBeenCalledOnce())
  })
})

describe('QBankPage — retry needs-review', () => {
  function makeSession(id, questionId, result, completedAt) {
    return {
      id,
      mode: 'practice',
      completedAt,
      questionAttempts: [{ questionId, result, mode: 'practice', sessionId: id, completedAt }],
    }
  }

  it('shows Retry needs-review button only when there are needs-review questions', () => {
    const sessions = [makeSession('s1', 'q1', 'incorrect', '2026-01-01T10:00:00.000Z')]
    render(<QBankPage onStartSelected={vi.fn()} sessions={sessions} />)
    expect(screen.getByRole('button', { name: /retry needs-review/i })).toBeInTheDocument()
  })

  it('does not show Retry needs-review button when no questions need review', () => {
    render(<QBankPage onStartSelected={vi.fn()} sessions={[]} />)
    expect(screen.queryByRole('button', { name: /retry needs-review/i })).not.toBeInTheDocument()
  })

  it('calls onStartSelected with needs-review questions in current mode when clicked', () => {
    const sessions = [
      makeSession('s1', 'q1', 'incorrect', '2026-01-01T10:00:00.000Z'),
      makeSession('s1', 'q2', 'incorrect', '2026-01-01T10:00:00.000Z'),
    ]
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} sessions={sessions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    fireEvent.click(screen.getByRole('button', { name: /retry needs-review/i }))

    expect(onStartSelected).toHaveBeenCalledOnce()
    const call = onStartSelected.mock.calls[0][0]
    expect(call.mode).toBe('coach')
    expect(call.questions.map(q => q.id)).toContain('q1')
    expect(call.questions.map(q => q.id)).toContain('q2')
  })
})
