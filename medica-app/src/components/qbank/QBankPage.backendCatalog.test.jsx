import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import QBankPage from './QBankPage'
import { useQBankCatalog } from '../../hooks/useQBankCatalog'
import { getLastQuizSession } from '../../lib/storage'

vi.mock('../../lib/storage', () => ({
  subscribeQuestionReports: vi.fn(() => () => {}),
  getLastQuizSession: vi.fn(() => null),
  getQBankProgressLedger: vi.fn(() => []),
  clearLastQuizSession: vi.fn(),
  filterReportedQuestions: vi.fn(questions => questions),
}))

vi.mock('../../hooks/useQBankCatalog', () => ({
  useQBankCatalog: vi.fn(),
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
    options: [{ letter: 'A', text: `Option A ${id}` }],
    ...overrides,
  }
}

function mockCatalog(overrides = {}) {
  vi.mocked(useQBankCatalog).mockReturnValue({
    questions: [makeQuestion('q1')],
    loading: false,
    error: null,
    source: 'backend',
    refresh: vi.fn(),
    ...overrides,
  })
}

describe('QBankPage — backend-driven catalog', () => {
  it('renders questions supplied by the backend catalog', () => {
    mockCatalog({ questions: [makeQuestion('q1'), makeQuestion('q2')] })
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.getByLabelText('2 validated questions available')).toBeInTheDocument()
  })

  it('shows a loading state while the catalog is being fetched', () => {
    mockCatalog({ questions: [], loading: true })
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/loading validated questions/i)
  })

  it('shows a fallback banner when the backend fetch failed and local data is shown instead', () => {
    mockCatalog({ source: 'fallback', error: 'Network error' })
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/showing the locally bundled set instead/i)
  })

  it('does not show the fallback banner when the catalog loaded from the backend', () => {
    mockCatalog({ source: 'backend', error: null })
    render(<QBankPage onStartSelected={vi.fn()} />)
    expect(screen.queryByText(/showing the locally bundled set instead/i)).not.toBeInTheDocument()
  })

  it('starts a session with backendDriven=true when the catalog came from the backend', async () => {
    mockCatalog({ source: 'backend' })
    const onStartSelected = vi.fn().mockResolvedValue(undefined)
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Select question 1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))

    await waitFor(() => expect(onStartSelected).toHaveBeenCalledTimes(1))
    expect(onStartSelected).toHaveBeenCalledWith({
      mode: 'practice',
      questions: [makeQuestion('q1')],
      backendDriven: true,
    })
  })

  it('shows an error and re-enables the button when starting the session fails', async () => {
    mockCatalog({ source: 'backend' })
    const onStartSelected = vi.fn().mockRejectedValue(new Error('One or more selected questions are no longer available.'))
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Select question 1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('One or more selected questions are no longer available.'))
    expect(screen.getByRole('button', { name: 'Start Selected Questions' })).not.toBeDisabled()
  })

  // ─── Selection preservation across a server-narrowed search ────────────────
  // useQBankCatalog fetches a narrower `questions` set from the server as the
  // search term changes; a selection made before that narrowing must survive it.

  it('preserves a selection made before a server search narrows the fetched catalog', async () => {
    const q1 = makeQuestion('q1')
    const q2 = makeQuestion('q2')
    vi.mocked(useQBankCatalog).mockImplementation(search => ({
      questions: search ? [q2] : [q1, q2],
      loading: false,
      error: null,
      source: 'backend',
      refresh: vi.fn(),
    }))

    const onStartSelected = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('checkbox', { name: /Select question 1/ }))
    expect(screen.getByText('1', { selector: '.qbk-selection-count strong' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: 'q2 only' } })
    rerender(<QBankPage onStartSelected={onStartSelected} />)

    // q1 no longer appears in the server-narrowed set, but it's still selected.
    expect(screen.getByText('1', { selector: '.qbk-selection-count strong' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))
    await waitFor(() => expect(onStartSelected).toHaveBeenCalledTimes(1))
    expect(onStartSelected.mock.calls[0][0].questions).toEqual([q1])
  })

  // ─── Backend-driven resume safety ──────────────────────────────────────────
  // A backend-driven session's resume validity must be decided by the server
  // (POST /api/qbank/sessions), never by whatever this browser's catalog/search
  // state happens to hold — that state can be stale, narrowed, or still loading.

  function makeBackendSession(overrides = {}) {
    return {
      id: 'saved-backend-session',
      mode: 'practice',
      questions: [makeQuestion('backend-q1')],
      answers: { 'backend-q1': 'A' },
      currentIndex: 0,
      completed: false,
      source: 'validated-qbank',
      backendDriven: true,
      catalogSource: 'backend',
      ...overrides,
    }
  }

  it('disables Resume while the catalog is loading', () => {
    vi.mocked(getLastQuizSession).mockReturnValue(makeBackendSession())
    mockCatalog({ loading: true })
    render(<QBankPage onStartSelected={vi.fn()} />)

    expect(screen.getByRole('button', { name: /resume session/i })).toBeDisabled()
  })

  it('re-enables Resume once the catalog finishes loading', () => {
    vi.mocked(getLastQuizSession).mockReturnValue(makeBackendSession())
    mockCatalog({ loading: false })
    render(<QBankPage onStartSelected={vi.fn()} />)

    expect(screen.getByRole('button', { name: /resume session/i })).not.toBeDisabled()
  })

  it('delegates a backend-driven resume straight to onStartSelected without filtering against the local catalog', async () => {
    const savedSession = makeBackendSession()
    vi.mocked(getLastQuizSession).mockReturnValue(savedSession)
    // The locally fetched catalog doesn't even contain the saved question — proving
    // resume validity isn't decided by inventory/knownInventory membership here.
    mockCatalog({ questions: [makeQuestion('unrelated-question')] })

    const onStartSelected = vi.fn().mockResolvedValue(undefined)
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))

    await waitFor(() => expect(onStartSelected).toHaveBeenCalledTimes(1))
    expect(onStartSelected).toHaveBeenCalledWith({
      mode: 'practice',
      questions: savedSession.questions,
      resumeSession: savedSession,
    })
  })

  it('shows a visible error and does not retry silently when a backend-driven resume fails', async () => {
    vi.mocked(getLastQuizSession).mockReturnValue(makeBackendSession())
    mockCatalog({})
    const onStartSelected = vi.fn().mockRejectedValue(new Error('One or more saved questions are no longer available.'))
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('button', { name: /resume session/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('One or more saved questions are no longer available.'))
    expect(screen.getByRole('button', { name: /resume session/i })).not.toBeDisabled()
  })
})
