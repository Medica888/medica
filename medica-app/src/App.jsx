import { lazy, Suspense, useState, useCallback, useMemo, useEffect } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Workspace from './components/Workspace'
import { savePracticeResults, saveCoachResults, getSessionHistory, getFlashcards } from './lib/storage'
import { saveSession as persistSession } from './lib/dataProvider'
import { shuffleQuestionOptions } from './lib/questionNormalizer'
import { enrichSessionWithTopicMetadata } from './lib/topicIntelligence'
import { normalizeGenerationConfig } from './lib/generationScope'
import { buildSeenState, validateUniqueQuestions } from './lib/questionDedup'
import { restoreToken, setAuthToken, clearToken, auth } from './lib/apiClient'

const Dashboard = lazy(() => import('./components/Dashboard'))
const QuizBuilder = lazy(() => import('./components/quiz-builder/QuizBuilder'))
const ExamLoadingScreen = lazy(() => import('./components/loading/ExamLoadingScreen'))
const SkillsPlatform = lazy(() => import('./components/SkillsPlatform'))
const QuizSession = lazy(() => import('./components/session/QuizSession'))
const PracticeInterface = lazy(() => import('./components/practice/PracticeInterface'))
const PracticeResults = lazy(() => import('./components/practice/PracticeResults'))
const PracticeReview = lazy(() => import('./components/practice/PracticeReview'))
const CoachInterface = lazy(() => import('./components/coach/CoachInterface'))
const CoachResults = lazy(() => import('./components/coach/CoachResults'))
const ExamResults = lazy(() => import('./components/exam/ExamResults'))
const ExamReview = lazy(() => import('./components/exam/ExamReview'))
const AnalyticsDashboard = lazy(() => import('./components/analytics/AnalyticsDashboard'))
const FlashcardsPage = lazy(() => import('./components/flashcards/FlashcardsPage'))
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'))
const AdminReviewQueue = lazy(() => import('./components/admin/AdminReviewQueue'))
const AdminReviewDetail = lazy(() => import('./components/admin/AdminReviewDetail'))
const AdminGovernanceDashboard = lazy(() => import('./components/admin/AdminGovernanceDashboard'))

const MOCK_FALLBACK_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_ALLOW_MOCK_FALLBACK === 'true'
const LOCAL_HARD_BANK_COUNTS = {
  'NBME Difficult': 80,
  'UWorld Challenge': 40,
}

function isHardMedicalReviewConfig(config) {
  return ['NBME Difficult', 'UWorld Challenge'].includes(config?.difficulty)
}

export function shouldUseValidatedLocalFallback(aiErr, config) {
  if (!isHardMedicalReviewConfig(config)) return false

  const recoverable = aiErr?.code === 'GENERATION_TIMEOUT'
    || aiErr?.code === 'AI_INSUFFICIENT_COUNT'
    || /connection error/i.test(aiErr?.message || '')
    || /server returned empty question array/i.test(aiErr?.message || '')

  if (!recoverable) return false

  const available = LOCAL_HARD_BANK_COUNTS[config?.difficulty] || 0
  return available >= (config?.questionCount || 0)
}

export function shouldEnterLocalFallback(mockFallbackAllowed, useValidatedLocalFallback) {
  return Boolean(mockFallbackAllowed || useValidatedLocalFallback)
}

function getValidatedLocalFallbackReason(aiErr) {
  if (aiErr?.code === 'GENERATION_TIMEOUT') return 'live_ai_timeout'
  if (aiErr?.code === 'AI_INSUFFICIENT_COUNT') return 'live_ai_low_yield'
  if (/connection error/i.test(aiErr?.message || '')) return 'live_ai_connection_error'
  if (/server returned empty question array/i.test(aiErr?.message || '')) return 'live_ai_empty_result'
  return 'live_ai_unavailable'
}

function buildAISession(config, questions, seenState) {
  const validation = validateUniqueQuestions(questions)
  const telemetry  = questions.generationTelemetry ?? null
  const qSource    = telemetry?.source ?? 'ai'
  const session = {
    id:    `session_${Date.now()}`,
    mode:  config.mode,
    config,
    questions: questions.map(shuffleQuestionOptions),
    answers:   {},
    currentIndex: 0,
    startedAt:    new Date().toISOString(),
    source:               qSource,
    questionSource:       qSource,
    generatedAt:          new Date().toISOString(),
    requestedQuestionCount:        config.questionCount,
    uniqueQuestionCount:           validation.uniqueCount,
    hasDuplicateQuestions:         !validation.valid,
    hasClonedQuestions:            false,
    hasReusedQuestions:            false,
    generationTelemetry:           telemetry,
    generationConfigSnapshot:      config,
    excludedPreviousQuestionCount: seenState ? seenState.seenIds.size : 0,
  }
  return enrichSessionWithTopicMetadata(session, config)
}

export default function App() {
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [activeNav, setActiveNav]         = useState('dashboard')
  const [authUser, setAuthUser]           = useState(null)
  const [adminDetailId, setAdminDetailId] = useState(null)

  // Restore saved JWT on mount — call /me to get isAdmin flag
  useEffect(() => {
    const token = restoreToken()
    if (!token) return
    setAuthUser({ restored: true })
    auth.me()
      .then(({ user, isAdmin }) => setAuthUser({ ...user, isAdmin: !!isAdmin }))
      .catch(() => { clearToken(); setAuthUser(null) })
  }, [])

  const handleLogin = useCallback(async (token, user) => {
    setAuthToken(token)
    try { localStorage.setItem('medica_jwt', token) } catch { /* ignore */ }
    setAuthUser(user)
    try {
      const { user: fullUser, isAdmin } = await auth.me()
      setAuthUser({ ...fullUser, isAdmin: !!isAdmin })
    } catch { /* fallback to login user without isAdmin */ }
  }, [])

  const handleLogout = useCallback(() => {
    clearToken()
    setAuthUser(null)
  }, [])

  const pageTitle = useMemo(() => {
    const map = {
      dashboard:          'Mission Control',
      'create-quiz':      'New Session',
      qbank:              'QBank',
      flashcards:         'Flashcards',
      analytics:          'Analytics',
      'ai-tutor':         'AI Coach',
      settings:           'Settings',
      'admin-review':     'Review Queue',
      'admin-governance': 'Governance',
    }
    return map[activeNav] || 'Medica'
  }, [activeNav])

  const readinessStatus = useMemo(() => {
    const sessions = getSessionHistory()
    if (sessions.length === 0) return { label: 'Getting Started', active: false }
    if (sessions.length < 3)  return { label: 'Active',           active: true }
    return                           { label: 'Improving',         active: true }
  }, [])

  const flashcardsDue = useMemo(() => {
    const cards = getFlashcards()
    return cards.filter(c => {
      if (c.reviewStatus === 'mastered') {
        if (!c.nextReview) return false
        const d = new Date(c.nextReview)
        return !isNaN(d.getTime()) && d <= new Date()
      }
      return true
    }).length
  }, [])
  // 'builder' | 'loading' | 'session' | 'practice-results' | 'practice-review' | 'coach-results' | 'exam-results' | 'exam-review'
  const [quizPhase, setQuizPhase]         = useState('builder')
  const [quizConfig, setQuizConfig]       = useState(null)
  const [quizSession, setQuizSession]     = useState(null)
  const [practiceResults, setPracticeResults] = useState(null)
  const [coachResults, setCoachResults]   = useState(null)
  const [examResults, setExamResults]     = useState(null)
  const [examReviewFilter, setExamReviewFilter] = useState('all')
  const [generationError, setGenerationError]   = useState(null)

  const handleHome = () => {
    setSelectedSkill(null)
    setActiveNav('dashboard')
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setPracticeResults(null)
    setCoachResults(null)
    setExamResults(null)
  }

  const handleNav = (id) => {
    setSelectedSkill(null)
    setActiveNav(id)
    setAdminDetailId(null)
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setPracticeResults(null)
    setCoachResults(null)
    setExamResults(null)
  }

  const handleQuizStart = useCallback(async (rawConfig) => {
    const config         = normalizeGenerationConfig(rawConfig)
    const IS_40Q_BLOCK   = config.questionCount === 40 && config.mode === 'exam'
    const seenState      = buildSeenState(getSessionHistory())
    const aiModule       = await import('./lib/ai/generateAIQuestions')

    setQuizConfig(config)
    setQuizSession(null)
    setGenerationError(null)
    setQuizPhase('loading')

    let aiGenerationError = null
    let useValidatedLocalFallback = false

    try {
      const questions = await aiModule.generateAIQuestions(config, seenState)
      setQuizSession(buildAISession(config, questions, seenState))
      return
    } catch (aiErr) {
      aiGenerationError = aiErr
      useValidatedLocalFallback = shouldUseValidatedLocalFallback(aiErr, config)
      // In local/dev mode, allow the validated mock bank to keep quizzes usable
      // when the backend generator is unavailable.
      if (aiErr.code !== 'BACKEND_DISABLED' && !MOCK_FALLBACK_ALLOWED && !useValidatedLocalFallback) {
        if (IS_40Q_BLOCK) {
          setGenerationError(aiModule.formatGenerationErrorMessage(aiErr, config))
        } else {
          setGenerationError(aiModule.formatGenerationErrorMessage(aiErr, config))
        }
        setQuizPhase('builder')
        return
      }
      // BACKEND_DISABLED or allowed local fallback - fall through to mock questions below
    }

    // Mock fallback - used when backend API is disabled or local fallback is allowed.
    if (shouldEnterLocalFallback(MOCK_FALLBACK_ALLOWED, useValidatedLocalFallback)) {
      try {
        const { createQuizSession } = await import('./lib/mockQuestions')
        const fallbackConfig = useValidatedLocalFallback
          ? { ...config, fallbackReason: getValidatedLocalFallbackReason(aiGenerationError) }
          : config
        const session = createQuizSession(fallbackConfig)
        setQuizSession(enrichSessionWithTopicMetadata(session, config))
      } catch (mockErr) {
        setGenerationError(mockErr.message)
        setQuizPhase('builder')
      }
    } else {
      setGenerationError('Question generation service is unavailable. Please ensure the backend is running.')
      setQuizPhase('builder')
    }
  }, [])

  const handleLoadingComplete = useCallback(() => {
    setQuizPhase('session')
  }, [])

  const handleSessionExit = useCallback(() => {
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setPracticeResults(null)
    setCoachResults(null)
    setExamResults(null)
  }, [])

  const handleLoadingError = useCallback(() => {
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setExamResults(null)
  }, [])

  // Called by QuizSession when exam is submitted - receives (results, sessionWithAnswers)
  const handleExamComplete = useCallback((results, sessionWithAnswers) => {
    persistSession(results, sessionWithAnswers).catch(err => console.warn('[App] save failed:', err.message))
    setExamResults(results)
    if (sessionWithAnswers) setQuizSession(sessionWithAnswers)
    setQuizPhase('exam-results')
  }, [])

  // Called by PracticeInterface when user clicks "Finish Practice"
  const handlePracticeComplete = useCallback((results, sessionWithAnswers) => {
    savePracticeResults(results)
    persistSession(results, sessionWithAnswers).catch(err => console.warn('[App] save failed:', err.message))
    setPracticeResults(results)
    if (sessionWithAnswers) setQuizSession(sessionWithAnswers)
    setQuizPhase('practice-results')
  }, [])

  // Called by CoachInterface when user clicks "Finish Session"
  const handleCoachComplete = useCallback((results, sessionWithAnswers) => {
    saveCoachResults(results)
    persistSession(results, sessionWithAnswers).catch(err => console.warn('[App] save failed:', err.message))
    setCoachResults(results)
    if (sessionWithAnswers) setQuizSession(sessionWithAnswers)
    setQuizPhase('coach-results')
  }, [])

  const handleNavigateToFlashcards = useCallback(() => {
    setActiveNav('flashcards')
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setPracticeResults(null)
    setCoachResults(null)
    setExamResults(null)
  }, [])

  const handleViewAnalytics = useCallback(() => {
    setActiveNav('analytics')
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setPracticeResults(null)
    setCoachResults(null)
    setExamResults(null)
  }, [])

  // Results to Review
  const handleGoToReview = useCallback(() => {
    setQuizPhase('practice-review')
  }, [])

  // Review to Results
  const handleBackToResults = useCallback(() => {
    setQuizPhase('practice-results')
  }, [])

  const handleGoToExamReview = useCallback((filter = 'all') => {
    setExamReviewFilter(filter)
    setQuizPhase('exam-review')
  }, [])

  const handleBackToExamResults = useCallback(() => {
    setQuizPhase('exam-results')
  }, [])

  // Any results/review to fresh builder
  const handleNewQuiz = useCallback(() => {
    setQuizPhase('builder')
    setQuizConfig(null)
    setQuizSession(null)
    setPracticeResults(null)
    setCoachResults(null)
    setExamResults(null)
  }, [])

  const showQuizBuilder = !selectedSkill && activeNav === 'create-quiz'

  const renderMain = () => {
    if (selectedSkill) {
      return <Workspace key={selectedSkill.id} skill={selectedSkill} onBack={handleHome} />
    }

    if (activeNav === 'dashboard') {
      return <Dashboard onNavigate={handleNav} />
    }

    if (activeNav === 'skills') {
      return <SkillsPlatform skills={[]} onSelect={setSelectedSkill} />
    }

    if (activeNav === 'analytics') {
      return <AnalyticsDashboard onNavigate={handleNav} />
    }

    if (activeNav === 'flashcards') {
      return <FlashcardsPage onNavigate={handleNav} />
    }

    if (activeNav === 'settings') {
      return <SettingsPage authUser={authUser} onLogin={handleLogin} onLogout={handleLogout} />
    }

    if (activeNav === 'admin-review' || activeNav === 'admin-governance') {
      if (!authUser?.isAdmin) {
        return <Phase1Placeholder activeNav="dashboard" />
      }
      if (activeNav === 'admin-governance') {
        return <AdminGovernanceDashboard />
      }
      if (adminDetailId) {
        return (
          <AdminReviewDetail
            questionId={adminDetailId}
            onBack={() => setAdminDetailId(null)}
          />
        )
      }
      return (
        <AdminReviewQueue
          onSelectDetail={(id) => setAdminDetailId(id)}
        />
      )
    }

    if (showQuizBuilder) {
      if (quizPhase === 'loading' && quizConfig) {
        return (
          <ExamLoadingScreen
            config={quizConfig}
            session={quizSession}
            onComplete={handleLoadingComplete}
            onError={handleLoadingError}
          />
        )
      }

      if (quizPhase === 'session' && quizSession) {
        if (quizSession.mode === 'practice') {
          return (
            <PracticeInterface
              session={quizSession}
              onComplete={handlePracticeComplete}
              onExit={handleSessionExit}
            />
          )
        }
        if (quizSession.mode === 'coach') {
          return (
            <CoachInterface
              session={quizSession}
              onComplete={handleCoachComplete}
              onExit={handleSessionExit}
            />
          )
        }
        // Exam mode to QuizSession
        return (
          <QuizSession
            session={quizSession}
            onExit={handleSessionExit}
            onComplete={handleExamComplete}
          />
        )
      }

      if (quizPhase === 'practice-results' && practiceResults) {
        return (
          <PracticeResults
            results={practiceResults}
            session={quizSession}
            onReview={handleGoToReview}
            onNewQuiz={handleNewQuiz}
            onBackToBuilder={handleNewQuiz}
            onViewAnalytics={handleViewAnalytics}
            onNavigateToFlashcards={handleNavigateToFlashcards}
          />
        )
      }

      if (quizPhase === 'practice-review' && quizSession) {
        return (
          <PracticeReview
            session={quizSession}
            onBack={handleBackToResults}
            onNewQuiz={handleNewQuiz}
          />
        )
      }

      if (quizPhase === 'coach-results' && coachResults) {
        return (
          <CoachResults
            results={coachResults}
            session={quizSession}
            onNewQuiz={handleNewQuiz}
            onBackToBuilder={handleNewQuiz}
            onViewAnalytics={handleViewAnalytics}
            onNavigateToFlashcards={handleNavigateToFlashcards}
          />
        )
      }

      if (quizPhase === 'exam-results' && examResults) {
        return (
          <ExamResults
            results={examResults}
            session={quizSession}
            onReview={handleGoToExamReview}
            onNewQuiz={handleNewQuiz}
            onBackToBuilder={handleNewQuiz}
            onViewAnalytics={handleViewAnalytics}
          />
        )
      }

      if (quizPhase === 'exam-review' && quizSession) {
        return (
          <ExamReview
            session={quizSession}
            initialFilter={examReviewFilter}
            onBack={handleBackToExamResults}
            onNewQuiz={handleNewQuiz}
          />
        )
      }

      return <QuizBuilder onStart={handleQuizStart} generationError={generationError} />
    }

    return <Phase1Placeholder activeNav={activeNav} />
  }

  return (
    <div className="app">
      <Header
        onHome={handleHome}
        pageTitle={pageTitle}
        readinessStatus={readinessStatus}
      />
      <Sidebar
        activeNav={selectedSkill ? null : activeNav}
        onNav={handleNav}
        onHome={handleHome}
        flashcardsDue={flashcardsDue}
        authUser={authUser}
      />
      <main className="main" id="main-content">
        <Suspense fallback={<MainLoading />}>
          {renderMain()}
        </Suspense>
      </main>
    </div>
  )
}

function MainLoading() {
  return (
    <div className="main-loading" role="status" aria-live="polite">
      Loading...
    </div>
  )
}

const NAV_LABELS = {
  qbank:          'QBank',
  flashcards:     'Flashcards',
  'ai-tutor':     'AI Tutor',
  analytics:      'Analytics',
  notes:          'Notes',
  bookmarks:      'Bookmarks',
  performance:    'Performance',
  'exam-history': 'Exam History',
  settings:       'Settings',
}

function Phase1Placeholder({ activeNav }) {
  const label = NAV_LABELS[activeNav] || activeNav
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      textAlign: 'center',
      padding: '0 32px',
    }}>
      <div style={{ fontSize: 40, marginBottom: 8, opacity: .3 }}>*</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-.3px' }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', maxWidth: 340, lineHeight: 1.65 }}>
        {label} will be available in a future phase.
      </div>
    </div>
  )
}
