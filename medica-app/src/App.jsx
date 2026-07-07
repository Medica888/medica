import { lazy, Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Workspace from './components/Workspace'
import { savePracticeResults, saveCoachResults, getSessionHistory, getFlashcards } from './lib/storage'
import { isFlashcardDue } from './components/flashcards/flashcardDisplay'
import { saveSession as persistSession } from './lib/dataProvider'
import { shuffleQuestionOptions } from './lib/questionNormalizer'
import { enrichSessionWithTopicMetadata } from './lib/topicIntelligence'
import { normalizeGenerationConfig } from './lib/generationScope'
import { buildSeenState, validateUniqueQuestions } from './lib/questionDedup'
import { qbank } from './lib/apiClient'
import { useSessionHistory } from './hooks/useSessionHistory'
import { useAuth } from './context/AuthContext'
import {
  drainSessionSyncOutbox,
  getSessionSyncOutbox,
  subscribeSessionSyncOutbox,
} from './lib/sessionSyncOutbox'

const Dashboard = lazy(() => import('./components/Dashboard'))
const QuizBuilder = lazy(() => import('./components/quiz-builder/QuizBuilder'))
const QBankPage = lazy(() => import('./components/qbank/QBankPage'))
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
const AdminTaxonomyReview      = lazy(() => import('./components/admin/AdminTaxonomyReview'))

const MOCK_FALLBACK_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_ALLOW_MOCK_FALLBACK === 'true'
const LOCAL_HARD_BANK_COUNTS = {
  'NBME Difficult': 80,
  'UWorld Challenge': 40,
}

function isHardMedicalReviewConfig(config) {
  return ['NBME Difficult', 'UWorld Challenge'].includes(config?.difficulty)
}

// eslint-disable-next-line react-refresh/only-export-components
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

// eslint-disable-next-line react-refresh/only-export-components
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
    id:             `session_${Date.now()}`,
    clientSessionId: crypto.randomUUID(),  // stable UUID for idempotent backend retry
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
  const [adminDetailId, setAdminDetailId] = useState(null)
  const [, setStorageRevision] = useState(0)
  const { authStatus, authUser, login: handleLogin, logout: handleLogout } = useAuth()

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
      'admin-taxonomy':   'Taxonomy Candidates',
    }
    return map[activeNav] || 'Medica'
  }, [activeNav])

  const { sessions: historySessions, refresh: refreshHistory } = useSessionHistory()

  const readinessStatus = useMemo(() => {
    if (historySessions.length === 0) return { label: 'Getting Started', active: false }
    if (historySessions.length < 3)  return { label: 'Active',           active: true }
    return                                   { label: 'Improving',         active: true }
  }, [historySessions])

  const flashcardsDue = authStatus === 'restoring'
    ? 0
    : getFlashcards().filter(isFlashcardDue).length
  // 'builder' | 'loading' | 'session' | 'practice-results' | 'practice-review' | 'coach-results' | 'exam-results' | 'exam-review'
  const [quizPhase, setQuizPhase]         = useState('builder')
  const [quizConfig, setQuizConfig]       = useState(null)
  const [quizSession, setQuizSession]     = useState(null)
  const [practiceResults, setPracticeResults] = useState(null)
  const [coachResults, setCoachResults]   = useState(null)
  const [examResults, setExamResults]     = useState(null)
  const [examReviewFilter, setExamReviewFilter] = useState('all')
  const [generationError, setGenerationError]   = useState(null)

  // Session backend-sync indicator ('idle' | 'saving' | 'synced' | 'pending' | 'failed' | 'local-only')
  const [sessionSyncStatus, setSessionSyncStatus] = useState('idle')
  const syncTimerRef = useRef(null)
  const showSyncStatus = useCallback((status) => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    setSessionSyncStatus(status)
    if (status === 'synced' || status === 'local-only') {
      syncTimerRef.current = setTimeout(() => setSessionSyncStatus('idle'), 4_000)
    } else if (status === 'failed') {
      syncTimerRef.current = setTimeout(() => setSessionSyncStatus('idle'), 8_000)
    } else if (status === 'pending') {
      syncTimerRef.current = setTimeout(() => setSessionSyncStatus('idle'), 30_000)
    }
    // 'saving' stays until the operation resolves
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !authUser?.id) return undefined

    let retryTimer = null
    const scheduleNextDrain = () => {
      if (retryTimer) clearTimeout(retryTimer)
      const next = getSessionSyncOutbox(authUser.id)
        .filter(entry => entry.status === 'pending')
        .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)[0]
      if (!next) return
      const delay = Math.max(next.nextAttemptAt - Date.now(), 250)
      retryTimer = setTimeout(() => { void drain() }, delay)
    }
    const drain = async () => {
      const result = await drainSessionSyncOutbox(authUser.id)
      if (result.failed > 0) showSyncStatus('failed')
      else if (result.pending > 0 || result.paused) showSyncStatus('pending')
      else if (result.localOnly > 0) showSyncStatus('local-only')
      else if (result.synced > 0) showSyncStatus('synced')
      scheduleNextDrain()
    }
    const onOnline = () => { void drain() }
    const unsubscribe = subscribeSessionSyncOutbox(({ userId } = {}) => {
      if (userId === authUser.id) scheduleNextDrain()
    })
    void drain()
    window.addEventListener('online', onOnline)
    return () => {
      unsubscribe()
      if (retryTimer) clearTimeout(retryTimer)
      window.removeEventListener('online', onOnline)
    }
  }, [authStatus, authUser?.id, showSyncStatus])

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
  }, [])

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

    let aiGenerationError
    let useValidatedLocalFallback

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

  const handleQBankStart = useCallback(async ({ mode, questions, resumeSession = null, backendDriven = false }) => {
    if (resumeSession) {
      if (resumeSession.backendDriven) {
        // Backend-driven resume: never trust the local snapshot's availability — re-resolve
        // every saved id against the server so cross-user quarantine/edits since the session
        // was saved are caught. qbank.createSession is atomic (throws SELECTION_STALE if any
        // id no longer resolves) and used purely as a validity gate here: on success, the
        // saved question objects resume completely unchanged. They must never be rebuilt
        // from the freshly resolved body — the saved options/correct were already shuffled
        // once at session start (shuffleQuestionOptions must never run twice), and a hybrid
        // fresh-content/old-options question would let a saved answer letter silently point
        // at a different option than the one the student actually chose.
        const savedQuestions = resumeSession.questions || []
        await qbank.createSession(savedQuestions.map(question => String(question.id)))

        const resumedConfig = {
          ...(resumeSession.config || {}),
          mode,
          questionCount: savedQuestions.length,
          blockType: 'qbank-selection',
          source: 'validated-qbank',
        }
        // Every saved question id and all session state (answers, position, timer, marks,
        // confidence, notes, highlights, reveal state) carry over untouched via this spread.
        const resumed = {
          ...resumeSession,
          mode,
          config: resumedConfig,
          questions: savedQuestions,
          completed: false,
          source: 'validated-qbank',
          questionSource: 'validated-qbank',
        }
        setQuizConfig(resumedConfig)
        setQuizSession(enrichSessionWithTopicMetadata(resumed, resumedConfig))
        setGenerationError(null)
        setQuizPhase('session')
        return
      }

      const resumedConfig = {
        ...(resumeSession.config || {}),
        mode,
        questionCount: questions.length,
        blockType: 'qbank-selection',
        source: 'validated-qbank',
      }
      const resumed = {
        ...resumeSession,
        mode,
        config: resumedConfig,
        questions,
        completed: false,
        source: 'validated-qbank',
        questionSource: 'validated-qbank',
      }
      setQuizConfig(resumedConfig)
      setQuizSession(enrichSessionWithTopicMetadata(resumed, resumedConfig))
      setGenerationError(null)
      setQuizPhase('session')
      return
    }

    const uniqueValues = (items, key) => [...new Set(items.map(item => item?.[key]).filter(Boolean))]
    const subjects = uniqueValues(questions, 'subject')
    const systems = uniqueValues(questions, 'system')
    const difficulties = uniqueValues(questions, 'difficulty')
    const config = {
      mode,
      questionCount: questions.length,
      subject: subjects.length === 1 ? subjects[0] : 'All Subjects',
      system: systems.length === 1 ? systems[0] : 'All Systems',
      topic: '',
      clinicalFocus: '',
      difficulty: difficulties.length === 1 ? difficulties[0] : 'Mixed',
      blockType: 'qbank-selection',
      source: 'validated-qbank',
    }
    const { createSelectedQuestionSession, createSessionFromResolvedQuestions } = await import('./lib/mockQuestions')
    let session
    if (backendDriven) {
      const resolved = await qbank.createSession(questions.map(question => String(question.id)))
      session = createSessionFromResolvedQuestions(config, resolved.questions.map(question => question.body))
    } else {
      session = createSelectedQuestionSession(config, questions)
    }
    // Tagged so a later resume knows whether to re-resolve against the backend
    // (cross-user quarantine safety) or fall back to the local knownInventory check.
    session = { ...session, backendDriven, catalogSource: backendDriven ? 'backend' : 'local' }
    setQuizConfig(session.config)
    setQuizSession(enrichSessionWithTopicMetadata(session, session.config))
    setGenerationError(null)
    setQuizPhase('session')
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
    showSyncStatus('saving')
    persistSession(results, sessionWithAnswers)
      .then(({ backendSynced, syncState }) => showSyncStatus(syncState || (backendSynced ? 'synced' : 'local-only')))
      .catch(() => showSyncStatus('failed'))
      .finally(refreshHistory)
    setExamResults(results)
    if (sessionWithAnswers) setQuizSession(sessionWithAnswers)
    setQuizPhase('exam-results')
  }, [showSyncStatus, refreshHistory])

  // Called by PracticeInterface when user clicks "Finish Practice"
  const handlePracticeComplete = useCallback((results, sessionWithAnswers) => {
    savePracticeResults(results)
    showSyncStatus('saving')
    persistSession(results, sessionWithAnswers)
      .then(({ backendSynced, syncState }) => showSyncStatus(syncState || (backendSynced ? 'synced' : 'local-only')))
      .catch(() => showSyncStatus('failed'))
      .finally(refreshHistory)
    setPracticeResults(results)
    if (sessionWithAnswers) setQuizSession(sessionWithAnswers)
    setQuizPhase('practice-results')
  }, [showSyncStatus, refreshHistory])

  // Called by CoachInterface when user clicks "Finish Session"
  const handleCoachComplete = useCallback((results, sessionWithAnswers) => {
    saveCoachResults(results)
    showSyncStatus('saving')
    persistSession(results, sessionWithAnswers)
      .then(({ backendSynced, syncState }) => showSyncStatus(syncState || (backendSynced ? 'synced' : 'local-only')))
      .catch(() => showSyncStatus('failed'))
      .finally(refreshHistory)
    setCoachResults(results)
    if (sessionWithAnswers) setQuizSession(sessionWithAnswers)
    setQuizPhase('coach-results')
  }, [showSyncStatus, refreshHistory])

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

  const showQuizExperience = !selectedSkill && ['create-quiz', 'qbank', 'ai-tutor'].includes(activeNav)

  if (authStatus === 'restoring') {
    return <MainLoading />
  }

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
      return (
        <SettingsPage
          authUser={authUser}
          onLogin={handleLogin}
          onLogout={handleLogout}
          onDataMigration={() => setStorageRevision(value => value + 1)}
        />
      )
    }

    if (activeNav === 'admin-review' || activeNav === 'admin-governance' || activeNav === 'admin-taxonomy') {
      if (!authUser?.isAdmin) {
        return <Phase1Placeholder activeNav="dashboard" />
      }
      if (activeNav === 'admin-governance') {
        return <AdminGovernanceDashboard />
      }
      if (activeNav === 'admin-taxonomy') {
        return <AdminTaxonomyReview />
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

    if (showQuizExperience) {
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

      if (activeNav === 'qbank') {
        return <QBankPage onStartSelected={handleQBankStart} sessions={historySessions} />
      }

      return (
        <QuizBuilder
          key={activeNav}
          onStart={handleQuizStart}
          generationError={generationError}
          initialMode={activeNav === 'ai-tutor' ? 'coach' : null}
        />
      )
    }

    return <Phase1Placeholder activeNav={activeNav} />
  }

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      {sessionSyncStatus !== 'idle' && (
        <div
          className={`sync-toast sync-toast--${sessionSyncStatus}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {sessionSyncStatus === 'saving'     && 'Saving session…'}
          {sessionSyncStatus === 'synced'     && 'Session synced'}
          {sessionSyncStatus === 'pending'    && 'Saved locally · pending synchronization'}
          {sessionSyncStatus === 'failed'     && 'Synchronization failed · session remains on this device'}
          {sessionSyncStatus === 'local-only' && 'Saved on this device'}
        </div>
      )}
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
      <main className="main" id="main-content" tabIndex={-1}>
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
