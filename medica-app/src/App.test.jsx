import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import App, { shouldEnterLocalFallback, shouldUseValidatedLocalFallback } from './App.jsx'

vi.mock('./components/Header', () => ({
  default: ({ pageTitle }) => <header data-testid="header">{pageTitle}</header>,
}))

vi.mock('./components/Sidebar', () => ({
  default: ({ onNav }) => (
    <nav>
      <button type="button" onClick={() => onNav('create-quiz')}>New Session</button>
    </nav>
  ),
}))

vi.mock('./components/Dashboard', () => ({
  default: () => <div>Dashboard Mock</div>,
}))

vi.mock('./components/quiz-builder/QuizBuilder', () => ({
  default: ({ onStart, generationError }) => (
    <div>
      <div>Quiz Builder Mock</div>
      {generationError && <div>{generationError}</div>}
      <button type="button" onClick={() => onStart(makeConfig('exam'))}>Start Exam Flow</button>
      <button type="button" onClick={() => onStart(makeConfig('practice'))}>Start Practice Flow</button>
      <button type="button" onClick={() => onStart(makeConfig('coach'))}>Start Coach Flow</button>
    </div>
  ),
}))

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
  default: ({ onReview, onNewQuiz }) => (
    <div>
      <div>Exam Results Mock</div>
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
  saveSession: vi.fn(() => Promise.resolve()),
}))

vi.mock('./lib/apiClient', () => ({
  restoreToken: vi.fn(() => null),
  setAuthToken: vi.fn(),
  clearToken: vi.fn(),
}))

vi.mock('./lib/ai/generateAIQuestions', () => ({
  generateAIQuestions: vi.fn(async (config) => makeQuestions(config.mode)),
  formatGenerationErrorMessage: vi.fn(() => 'generation failed'),
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
  it('passes exam flow through builder, loading, session, results, review, and back', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'New Session' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'New Session' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'New Session' }))
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

    fireEvent.click(screen.getByRole('button', { name: 'New Session' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Start Exam Flow' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Loading' }))

    expect(await screen.findByText('Exam Session Mock')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Exit Session Mock' }))

    await waitFor(() => expect(screen.getByText('Quiz Builder Mock')).toBeInTheDocument())
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
