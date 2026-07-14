import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App, { shouldEnterLocalFallback, shouldUseValidatedLocalFallback } from './App.jsx'
import { useSessionHistory } from './hooks/useSessionHistory'
import { generateAIQuestions } from './lib/ai/generateAIQuestions'
import { saveSession as persistSession } from './lib/dataProvider'
import { exams, isBackendSyncEnabled } from './lib/apiClient'

vi.mock('./hooks/useSessionHistory', () => ({
  useSessionHistory: vi.fn(() => ({
    sessions: [],
    loading: false,
    error: null,
    source: 'localStorage',
    refresh: vi.fn(),
  })),
}))

vi.mock('./components/Header', () => ({
  default: ({ pageTitle, readinessStatus }) => (
    <header data-testid="header">
      {pageTitle}
      {readinessStatus && <span data-testid="readiness-label">{readinessStatus.label}</span>}
    </header>
  ),
}))

vi.mock('./components/Sidebar', () => ({
  default: ({ onNav }) => (
    <nav>
      <button type="button" onClick={() => onNav('qbank')}>QBank</button>
      <button type="button" onClick={() => onNav('ai-tutor')}>AI Coach</button>
    </nav>
  ),
}))

vi.mock('./components/Dashboard', () => ({
  default: ({ onNavigate }) => (
    <div>
      <div>Dashboard Mock</div>
      <button type="button" onClick={() => onNavigate('create-quiz')}>Build First Block</button>
    </div>
  ),
}))

vi.mock('./components/quiz-builder/QuizBuilder', () => ({
  default: ({ onStart, generationError, initialMode }) => (
    <div>
      <div>Quiz Builder Mock</div>
      <div>Initial mode: {initialMode || 'saved'}</div>
      {generationError && <div>{generationError}</div>}
      <button type="button" onClick={() => onStart(makeConfig('exam'))}>Start Exam Flow</button>
      <button type="button" onClick={() => onStart(makeConfig('practice'))}>Start Practice Flow</button>
      <button type="button" onClick={() => onStart(makeConfig('coach'))}>Start Coach Flow</button>
    </div>
  ),
}))

vi.mock('./components/qbank/QBankPage', () => ({
  default: ({ onStartSelected }) => (
    <div>
      <div>QBank Mock</div>
      <button
        type="button"
        onClick={() => onStartSelected({ mode: 'practice', questions: makeQuestions('qbank') })}
      >
        Start QBank Selection
      </button>
      <button
        type="button"
        onClick={() => onStartSelected({ mode: 'practice', questions: makeQuestions('qbank'), backendDriven: true })}
      >
        Start Backend QBank Selection
      </button>
      <button
        type="button"
        onClick={() => {
          const questions = makeQuestions('resume')
          onStartSelected({
            mode: 'practice',
            questions,
            resumeSession: {
              id: 'saved-qbank-session',
              clientSessionId: '00000000-0000-4000-8000-000000000099',
              mode: 'practice',
              config: { mode: 'practice', source: 'validated-qbank' },
              questions,
              answers: { [questions[0].id]: 'B' },
              currentIndex: 0,
              source: 'validated-qbank',
            },
          })
        }}
      >
        Resume QBank Selection
      </button>
      <button
        type="button"
        onClick={() => {
          onStartSelected({
            mode: 'practice',
            questions: BACKEND_RESUME_SESSION.questions,
            resumeSession: BACKEND_RESUME_SESSION,
          }).catch(() => {})
        }}
      >
        Resume Backend QBank Selection
      </button>
    </div>
  ),
}))

const BACKEND_RESUME_SESSION = {
  id: 'saved-backend-qbank-session',
  clientSessionId: '00000000-0000-4000-8000-000000000098',
  mode: 'practice',
  config: { mode: 'practice', source: 'validated-qbank' },
  questions: [{
    id: 'backend-q1',
    subject: 'Cardiology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    stem: 'Stale saved stem for backend-q1',
    options: [
      { letter: 'A', text: 'Shuffled Option A' },
      { letter: 'B', text: 'Shuffled Option B' },
    ],
    correct: 'B',
    optionExplanations: { A: 'exp A', B: 'exp B' },
  }],
  answers: { 'backend-q1': 'B' },
  currentIndex: 0,
  secondsLeft: 42,
  marked: { 'backend-q1': true },
  confidences: { 'backend-q1': 'Confident' },
  notes: { 'backend-q1': 'my note' },
  highlights: { 'backend-q1': [{ start: 0, end: 3, color: 'yellow' }] },
  source: 'validated-qbank',
  backendDriven: true,
  catalogSource: 'backend',
}

vi.mock('./components/loading/ExamLoadingScreen', () => ({
  default: ({ session, onComplete }) => (
    <div>
      <div>Loading Mock {session ? 'ready' : 'waiting'}</div>
      <button type="button" onClick={onComplete}>Complete Loading</button>
    </div>
  ),
}))

vi.mock('./components/session/QuizSession', () => ({
  default: ({ session, onComplete, onExit }) => (
    <div>
      <div>Exam Session Mock</div>
      <button type="button" onClick={() => onComplete(makeResults(), withAnswer(session))}>Submit Exam Mock</button>
      <button type="button" onClick={onExit}>Exit Session Mock</button>
    </div>
  ),
}))

vi.mock('./components/practice/PracticeInterface', () => ({
  default: ({ session, onComplete }) => (
    <div>
      <div>Practice Session Mock</div>
      <div data-testid="practice-session-state">
        {session.id}:{session.currentIndex}:{session.answers?.[session.questions[0].id] || 'empty'}
      </div>
      <div data-testid="practice-session-full">
        {JSON.stringify({
          answers: session.answers,
          currentIndex: session.currentIndex,
          secondsLeft: session.secondsLeft,
          marked: session.marked,
          confidences: session.confidences,
          notes: session.notes,
          highlights: session.highlights,
          question0: session.questions[0],
        })}
      </div>
      <button type="button" onClick={() => onComplete(makeResults(), withAnswer(session))}>Finish Practice Mock</button>
    </div>
  ),
}))

vi.mock('./components/coach/CoachInterface', () => ({
  default: ({ session, onComplete }) => (
    <div>
      <div>Coach Session Mock</div>
      <button type="button" onClick={() => onComplete(makeResults(), withAnswer(session))}>Finish Coach Mock</button>
    </div>
  ),
}))

vi.mock('./components/exam/ExamResults', () => ({
  default: ({ results, onReview, onNewQuiz }) => (
    <div>
      <div>Exam Results Mock</div>
      <div data-testid="exam-results-score">{results.correct}/{results.total}</div>
      <button type="button" onClick={() => onReview('all')}>Review Exam Mock</button>
      <button type="button" onClick={onNewQuiz}>New Exam Mock</button>
    </div>
  ),
}))

vi.mock('./components/exam/ExamReview', () => ({
  default: ({ initialFilter, onBack, onNewQuiz }) => (
    <div>
      <div>Exam Review Mock {initialFilter}</div>
      <button type="button" onClick={onBack}>Back To Exam Results Mock</button>
      <button type="button" onClick={onNewQuiz}>New From Exam Review Mock</button>
    </div>
  ),
}))

vi.mock('./components/practice/PracticeResults', () => ({
  default: ({ onReview, onNewQuiz }) => (
    <div>
      <div>Practice Results Mock</div>
      <button type="button" onClick={onReview}>Review Practice Mock</button>
      <button type="button" onClick={onNewQuiz}>New Practice Mock</button>
    </div>
  ),
}))

vi.mock('./components/practice/PracticeReview', () => ({
  default: ({ onBack, onNewQuiz }) => (
    <div>
      <div>Practice Review Mock</div>
      <button type="button" onClick={onBack}>Back To Practice Results Mock</button>
      <button type="button" onClick={onNewQuiz}>New From Practice Review Mock</button>
    </div>
  ),
}))

vi.mock('./components/coach/CoachResults', () => ({
  default: ({ onNewQuiz }) => (
    <div>
      <div>Coach Results Mock</div>
      <button type="button" onClick={onNewQuiz}>New Coach Mock</button>
    </div>
  ),
}))

vi.mock('./components/analytics/AnalyticsDashboard', () => ({ default: () => <div>Analytics Mock</div> }))
vi.mock('./components/flashcards/FlashcardsPage', () => ({ default: () => <div>Flashcards Mock</div> }))
vi.mock('./components/settings/SettingsPage', () => ({ default: () => <div>Settings Mock</div> }))
vi.mock('./components/SkillsPlatform', () => ({ default: () => <div>Skills Mock</div> }))
vi.mock('./components/Workspace', () => ({ default: () => <div>Workspace Mock</div> }))

vi.mock('./lib/storage', () => ({
  savePracticeResults: vi.fn(),
  saveCoachResults: vi.fn(),
  getSessionHistory: vi.fn(() => []),
  getFlashcards: vi.fn(() => []),
  getFlashcardReviewEvents: vi.fn(() => []),
}))

vi.mock('./lib/dataProvider', () => ({
  saveSession: vi.fn(() => Promise.resolve({ backendSynced: false, syncState: 'local-only' })),
}))

vi.mock('./lib/apiClient', () => ({
  isAuthenticated: vi.fn(() => false),
  isBackendSyncEnabled: vi.fn(() => false),
  setAuthenticated: vi.fn(),
  setCurrentUserId: vi.fn(),
  setAuthRestoring: vi.fn(),
  setAuthSession: vi.fn(),
  getAuthStateSnapshot: vi.fn(() => 'anonymous:'),
  subscribeAuthState: vi.fn(() => () => {}),
  auth: {
    me: vi.fn(() => Promise.reject(new Error('no session'))),
    logout: vi.fn(() => Promise.resolve(null)),
  },
  qbank: {
    createSession: vi.fn(ids => Promise.resolve({
      questions: ids.map(id => ({ id, body: { ...makeQuestions('qbank')[0], id } })),
    })),
  },
  exams: {
    reserve: vi.fn(() => Promise.resolve({ reserved: false, clientSessionId: '00000000-0000-4000-8000-000000000001' })),
  },
}))

vi.mock('./lib/ai/generateAIQuestions', () => ({
  generateAIQuestions: vi.fn(async (config) => makeQuestions(config.mode)),
  formatGenerationErrorMessage: vi.fn(() => 'generation failed'),
}))

vi.mock('./lib/mockQuestions', () => ({
  createSelectedQuestionSession: vi.fn((config, questions) => ({
    id: 'qbank-session',
    clientSessionId: '00000000-0000-4000-8000-000000000001',
    mode: config.mode,
    config,
    questions,
    answers: {},
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    source: 'validated-qbank',
  })),
  createQuizSession: vi.fn(config => ({
    id: 'fallback-session', mode: config.mode, config,
    questions: makeQuestions(config.mode), answers: {}, currentIndex: 0,
    startedAt: new Date().toISOString(),
  })),
  createSessionFromResolvedQuestions: vi.fn((config, resolvedQuestions) => ({
    id: 'qbank-backend-session',
    clientSessionId: '00000000-0000-4000-8000-000000000002',
    mode: config.mode,
    config,
    questions: resolvedQuestions,
    answers: {},
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    source: 'validated-qbank',
  })),
}))

function makeConfig(mode) {
  return {
    mode,
    subject: 'All Subjects',
    system: 'All Systems',
    topic: '',
    questionCount: 1,
    difficulty: 'Balanced',
    clinicalFocus: '',
  }
}

function makeQuestions(mode = 'exam') {
  return [{
    id: `${mode}-q1`,
    subject: 'Pathology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    stem: 'Mock stem',
    options: [
      { letter: 'A', text: 'A' },
      { letter: 'B', text: 'B' },
      { letter: 'C', text: 'C' },
      { letter: 'D', text: 'D' },
    ],
    correct: 'A',
    explanation: 'Mock explanation',
  }]
}

function makeResults() {
  return { total: 1, correct: 1, percentage: 100, completedAt: new Date().toISOString() }
}

function withAnswer(session) {
  return { ...session, answers: { [session.questions[0].id]: 'A' } }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
})

describe('App quiz phase routing', () => {
  it('provides a keyboard skip link to the focusable main content landmark', async () => {
    render(<App />)
    await screen.findByText('Dashboard Mock')

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  })

  it('opens the validated question library instead of QuizBuilder from QBank navigation', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'QBank' }))

    expect(await screen.findByText('QBank Mock')).toBeInTheDocument()
    expect(screen.queryByText('Quiz Builder Mock')).not.toBeInTheDocument()
    expect(screen.queryByText(/will be available in a future phase/i)).not.toBeInTheDocument()
  })

  it('starts a selected QBank set directly without opening generation loading', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start QBank Selection' }))

    expect(await screen.findByText('Practice Session Mock')).toBeInTheDocument()
    expect(screen.queryByText(/Loading Mock/)).not.toBeInTheDocument()
    expect(generateAIQuestions).not.toHaveBeenCalled()
  })

  it('resolves full question bodies via the backend before starting a backend-driven QBank session', async () => {
    const { qbank } = await import('./lib/apiClient')
    const { createSessionFromResolvedQuestions } = await import('./lib/mockQuestions')

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Backend QBank Selection' }))

    expect(await screen.findByText('Practice Session Mock')).toBeInTheDocument()
    expect(qbank.createSession).toHaveBeenCalledWith(['qbank-q1'])
    expect(createSessionFromResolvedQuestions).toHaveBeenCalledOnce()
    expect(createSessionFromResolvedQuestions.mock.calls[0][1]).toEqual([{ ...makeQuestions('qbank')[0], id: 'qbank-q1' }])
  })

  it('resumes a saved QBank session without resetting answers or position', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Resume QBank Selection' }))

    expect(await screen.findByText('Practice Session Mock')).toBeInTheDocument()
    expect(screen.getByTestId('practice-session-state')).toHaveTextContent('saved-qbank-session:0:B')
    expect(generateAIQuestions).not.toHaveBeenCalled()
  })

  describe('backend-driven QBank resume safety', () => {
    it('re-resolves every saved question id via POST /api/qbank/sessions on resume', async () => {
      const { qbank } = await import('./lib/apiClient')
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Resume Backend QBank Selection' }))

      await screen.findByText('Practice Session Mock')
      expect(qbank.createSession).toHaveBeenCalledWith(['backend-q1'])
    })

    it('resumes with the entire saved question object exactly unchanged, and preserves all session state', async () => {
      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Resume Backend QBank Selection' }))

      await screen.findByText('Practice Session Mock')
      const state = JSON.parse(screen.getByTestId('practice-session-full').textContent)

      // Progress state survives untouched.
      expect(state.answers).toEqual({ 'backend-q1': 'B' })
      expect(state.currentIndex).toBe(0)
      expect(state.secondsLeft).toBe(42)
      expect(state.marked).toEqual({ 'backend-q1': true })
      expect(state.confidences).toEqual({ 'backend-q1': 'Confident' })
      expect(state.notes).toEqual({ 'backend-q1': 'my note' })
      expect(state.highlights).toEqual({ 'backend-q1': [{ start: 0, end: 3, color: 'yellow' }] })

      // The resumed question is byte-for-byte the saved question — createSession's
      // response was used only to prove availability, never to rebuild content.
      expect(state.question0).toEqual(BACKEND_RESUME_SESSION.questions[0])
    })

    it('never produces a hybrid fresh/old question, even when the resolved body differs entirely from the saved one', async () => {
      const { qbank } = await import('./lib/apiClient')
      // The resolved body is deliberately a completely different question shape —
      // if any of it leaked into the resumed question, this test would catch it.
      qbank.createSession.mockResolvedValueOnce({
        questions: [{
          id: 'backend-q1',
          body: {
            id: 'backend-q1',
            subject: 'Completely Different Subject',
            system: 'Completely Different System',
            difficulty: 'Hard',
            stem: 'HYBRID-CONTENT-SHOULD-NOT-APPEAR',
            options: [
              { letter: 'A', text: 'Fresh Option One' },
              { letter: 'B', text: 'Fresh Option Two' },
              { letter: 'C', text: 'Fresh Option Three' },
            ],
            correct: 'C',
            explanation: 'HYBRID-EXPLANATION-SHOULD-NOT-APPEAR',
          },
        }],
      })

      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Resume Backend QBank Selection' }))

      await screen.findByText('Practice Session Mock')
      const state = JSON.parse(screen.getByTestId('practice-session-full').textContent)

      expect(state.question0).toEqual(BACKEND_RESUME_SESSION.questions[0])
      expect(JSON.stringify(state.question0)).not.toMatch(/HYBRID/)
      expect(qbank.createSession).toHaveBeenCalledWith(['backend-q1'])
    })

    it('fails atomically with no partial resume when the backend rejects (e.g. cross-user quarantine)', async () => {
      const { qbank } = await import('./lib/apiClient')
      qbank.createSession.mockRejectedValueOnce(
        Object.assign(new Error('One or more selected questions are no longer available.'), { status: 409 }),
      )

      render(<App />)
      fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Resume Backend QBank Selection' }))

      await waitFor(() => expect(qbank.createSession).toHaveBeenCalledWith(['backend-q1']))
      // No session was started — no partial resume, still on the QBank page.
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(screen.queryByText('Practice Session Mock')).not.toBeInTheDocument()
      expect(screen.getByText('QBank Mock')).toBeInTheDocument()
    })
  })

  it('refreshes session history after a completed QBank practice session is persisted', async () => {
    const refresh = vi.fn()
    vi.mocked(useSessionHistory).mockReturnValue({
      sessions: [], loading: false, error: null, source: 'localStorage', refresh,
    })
    vi.mocked(persistSession).mockResolvedValue({ backendSynced: false, syncState: 'local-only' })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'QBank' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start QBank Selection' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish Practice Mock' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it.each([
    ['exam', 'Start Exam Flow', 'Submit Exam Mock'],
    ['practice', 'Start Practice Flow', 'Finish Practice Mock'],
    ['coach', 'Start Coach Flow', 'Finish Coach Mock'],
  ])('refreshes session history after %s completion', async (_mode, startLabel, finishLabel) => {
    const refresh = vi.fn()
    vi.mocked(useSessionHistory).mockReturnValue({
      sessions: [], loading: false, error: null, source: 'localStorage', refresh,
    })
    vi.mocked(persistSession).mockResolvedValue({ backendSynced: false, syncState: 'local-only' })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: startLabel }))
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Loading' }))
    fireEvent.click(await screen.findByRole('button', { name: finishLabel }))

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it('updates exam results from the backend canonical score after a synced save', async () => {
    vi.mocked(persistSession).mockResolvedValue({
      backendSynced: true,
      syncState: 'synced',
      backendResults: {
        ...makeResults(),
        correct: 0,
        percentage: 0,
        medicaScore: 0,
        readinessLabel: 'Needs Foundation',
        subjectBreakdown: [],
        systemBreakdown: [],
      },
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Exam Flow' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Loading' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Submit Exam Mock' }))

    await waitFor(() => expect(screen.getByTestId('exam-results-score')).toHaveTextContent('0/1'))
  })

  it('opens the working quiz builder in Coach mode from AI Coach navigation', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'AI Coach' }))

    expect(await screen.findByText('Quiz Builder Mock')).toBeInTheDocument()
    expect(screen.getByText('Initial mode: coach')).toBeInTheDocument()
  })

  it('passes exam flow through builder, loading, session, results, review, and back', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    expect(await screen.findByText('Quiz Builder Mock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Start Exam Flow' }))
    expect(await screen.findByText(/Loading Mock ready/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Complete Loading' }))
    expect(await screen.findByText('Exam Session Mock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Submit Exam Mock' }))
    expect(await screen.findByText('Exam Results Mock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Review Exam Mock' }))
    expect(await screen.findByText('Exam Review Mock all')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Back To Exam Results Mock' }))
    expect(await screen.findByText('Exam Results Mock')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New Exam Mock' }))
    expect(await screen.findByText('Quiz Builder Mock')).toBeInTheDocument()
  })

  it('passes practice flow through builder, loading, session, results, review, and back', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Practice Flow' }))

    expect(await screen.findByText(/Loading Mock ready/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Loading' }))

    expect(await screen.findByText('Practice Session Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish Practice Mock' }))

    expect(await screen.findByText('Practice Results Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Review Practice Mock' }))

    expect(await screen.findByText('Practice Review Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back To Practice Results Mock' }))

    expect(await screen.findByText('Practice Results Mock')).toBeInTheDocument()
  })

  it('passes coach flow through builder, loading, session, results, and new session', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Coach Flow' }))

    expect(await screen.findByText(/Loading Mock ready/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Loading' }))

    expect(await screen.findByText('Coach Session Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Finish Coach Mock' }))

    expect(await screen.findByText('Coach Results Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New Coach Mock' }))

    expect(await screen.findByText('Quiz Builder Mock')).toBeInTheDocument()
  })

  it('returns from an active session to the builder on exit', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Exam Flow' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Loading' }))

    expect(await screen.findByText('Exam Session Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exit Session Mock' }))

    await waitFor(() => expect(screen.getByText('Quiz Builder Mock')).toBeInTheDocument())
  })
})

describe('App — Phase 2 server-side session reservation', () => {
  afterEach(() => {
    vi.mocked(isBackendSyncEnabled).mockReturnValue(false)
    vi.mocked(exams.reserve).mockResolvedValue({ reserved: false, clientSessionId: '00000000-0000-4000-8000-000000000001' })
  })

  it('does not attempt a reservation for anonymous/offline sessions', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Practice Flow' }))

    expect(await screen.findByText(/Loading Mock ready/)).toBeInTheDocument()
    expect(exams.reserve).not.toHaveBeenCalled()
  })

  it('awaits a reservation before starting an authenticated backend-connected quiz', async () => {
    vi.mocked(isBackendSyncEnabled).mockReturnValue(true)
    vi.mocked(exams.reserve).mockResolvedValue({ reserved: true, clientSessionId: '00000000-0000-4000-8000-000000000001' })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Practice Flow' }))

    expect(await screen.findByText(/Loading Mock ready/)).toBeInTheDocument()
    expect(exams.reserve).toHaveBeenCalledTimes(1)
    const [payload] = vi.mocked(exams.reserve).mock.calls[0]
    expect(payload).toEqual(expect.objectContaining({
      clientSessionId: expect.any(String),
      questionIds: expect.any(Array),
    }))
  })

  it('continues into the quiz unblocked when the reservation call fails', async () => {
    vi.mocked(isBackendSyncEnabled).mockReturnValue(true)
    vi.mocked(exams.reserve).mockRejectedValue(new Error('network error'))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Build First Block' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Practice Flow' }))

    expect(await screen.findByText(/Loading Mock ready/)).toBeInTheDocument()
  })
})

describe('shouldUseValidatedLocalFallback', () => {
  it('allows hard-mode timeout fallback when the validated local bank has enough questions', () => {
    const result = shouldUseValidatedLocalFallback(
      { code: 'GENERATION_TIMEOUT' },
      { mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 },
    )

    expect(result).toBe(true)
  })

  it('allows hard-mode insufficient-count fallback when the validated local bank has enough questions', () => {
    const result = shouldUseValidatedLocalFallback(
      { code: 'AI_INSUFFICIENT_COUNT', returned: 24, requested: 40 },
      { mode: 'exam', difficulty: 'NBME Difficult', questionCount: 40 },
    )

    expect(result).toBe(true)
  })

  it('does not use hard-bank fallback for Balanced generation', () => {
    const result = shouldUseValidatedLocalFallback(
      { code: 'GENERATION_TIMEOUT' },
      { mode: 'exam', difficulty: 'Balanced', questionCount: 40 },
    )

    expect(result).toBe(false)
  })

  it('does not hide non-recoverable generation errors', () => {
    const result = shouldUseValidatedLocalFallback(
      { message: 'Invalid API key' },
      { mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 },
    )

    expect(result).toBe(false)
  })
})

describe('shouldEnterLocalFallback', () => {
  it('enters fallback when dev/mock fallback is allowed', () => {
    expect(shouldEnterLocalFallback(true, false)).toBe(true)
  })

  it('enters fallback when validated hard-bank fallback is allowed', () => {
    expect(shouldEnterLocalFallback(false, true)).toBe(true)
  })

  it('does not enter fallback when both fallback gates are false', () => {
    expect(shouldEnterLocalFallback(false, false)).toBe(false)
  })
})

describe('readinessStatus header label', () => {
  it('shows Getting Started when useSessionHistory returns no sessions', async () => {
    vi.mocked(useSessionHistory).mockReturnValueOnce({
      sessions: [], loading: false, error: null, source: 'localStorage', refresh: vi.fn(),
    })
    render(<App />)
    expect(await screen.findByTestId('readiness-label')).toHaveTextContent('Getting Started')
  })

  it('shows Active when useSessionHistory returns 1 session', async () => {
    vi.mocked(useSessionHistory).mockReturnValueOnce({
      sessions: [{ id: 's1' }], loading: false, error: null, source: 'backend', refresh: vi.fn(),
    })
    render(<App />)
    expect(await screen.findByTestId('readiness-label')).toHaveTextContent('Active')
  })

  it('shows Active when useSessionHistory returns 2 sessions', async () => {
    vi.mocked(useSessionHistory).mockReturnValueOnce({
      sessions: [{ id: 's1' }, { id: 's2' }], loading: false, error: null, source: 'backend', refresh: vi.fn(),
    })
    render(<App />)
    expect(await screen.findByTestId('readiness-label')).toHaveTextContent('Active')
  })

  it('shows Improving when useSessionHistory returns 3 or more sessions', async () => {
    vi.mocked(useSessionHistory).mockReturnValueOnce({
      sessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], loading: false, error: null, source: 'backend', refresh: vi.fn(),
    })
    render(<App />)
    expect(await screen.findByTestId('readiness-label')).toHaveTextContent('Improving')
  })

  it('uses hook sessions not direct storage: label is Improving even when storage returns empty', async () => {
    // storage mock returns [] throughout; hook mock returns 3 sessions → label must be Improving
    vi.mocked(useSessionHistory).mockReturnValueOnce({
      sessions: [{ id: 's1' }, { id: 's2' }, { id: 's3' }], loading: false, error: null, source: 'backend', refresh: vi.fn(),
    })
    render(<App />)
    expect(await screen.findByTestId('readiness-label')).toHaveTextContent('Improving')
    expect(vi.mocked(useSessionHistory)).toHaveBeenCalled()
  })
})
