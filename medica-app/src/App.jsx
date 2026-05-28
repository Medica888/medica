import { useState, useCallback } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Workspace from './components/Workspace'
import Dashboard from './components/Dashboard'
import SkillsPlatform from './components/SkillsPlatform'
import QuizBuilder from './components/quiz-builder/QuizBuilder'
import ExamLoadingScreen from './components/loading/ExamLoadingScreen'
import QuizSession from './components/session/QuizSession'
import PracticeInterface from './components/practice/PracticeInterface'
import PracticeResults from './components/practice/PracticeResults'
import PracticeReview from './components/practice/PracticeReview'
import CoachInterface from './components/coach/CoachInterface'
import CoachResults from './components/coach/CoachResults'
import ExamResults from './components/exam/ExamResults'
import ExamReview from './components/exam/ExamReview'
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard'
import FlashcardsPage from './components/flashcards/FlashcardsPage'
import { createQuizSession } from './lib/mockQuestions'
import { generateAIQuestions } from './lib/ai/generateAIQuestions'
import { savePracticeResults, saveCoachResults, getSessionHistory } from './lib/storage'
import { saveSession as persistSession } from './lib/dataProvider'
import { shuffleQuestionOptions } from './lib/questionNormalizer'
import { enrichSessionWithTopicMetadata } from './lib/topicIntelligence'
import { normalizeGenerationConfig } from './lib/generationScope'
import { buildSeenState, validateUniqueQuestions } from './lib/questionDedup'

const MOCK_FALLBACK_ALLOWED = import.meta.env.VITE_ALLOW_MOCK_FALLBACK === 'true'

function buildAISession(config, questions, seenState) {
  const validation = validateUniqueQuestions(questions)
  const session = {
    id:    `session_${Date.now()}`,
    mode:  config.mode,
    config,
    questions: questions.map(shuffleQuestionOptions),
    answers:   {},
    currentIndex: 0,
    startedAt:    new Date().toISOString(),
    source:               'ai',
    questionSource:       'ai',
    generatedAt:          new Date().toISOString(),
    requestedQuestionCount:        config.questionCount,
    uniqueQuestionCount:           validation.uniqueCount,
    hasDuplicateQuestions:         !validation.valid,
    hasClonedQuestions:            false,
    hasReusedQuestions:            false,
    generationConfigSnapshot:      config,
    excludedPreviousQuestionCount: seenState ? seenState.seenIds.size : 0,
  }
  return enrichSessionWithTopicMetadata(session, config)
}

export default function App() {
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [activeNav, setActiveNav]         = useState('dashboard')
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

    setQuizConfig(config)
    setQuizSession(null)
    setGenerationError(null)
    setQuizPhase('loading')

    try {
      const questions = await generateAIQuestions(config, seenState)
      setQuizSession(buildAISession(config, questions, seenState))
      return
    } catch (aiErr) {
      // AI backend is configured — surface every error directly.
      // The mock bank is not a valid fallback when AI is the primary source.
      if (aiErr.code !== 'BACKEND_DISABLED') {
        if (IS_40Q_BLOCK) {
          setGenerationError('A standardized 40 Question Block requires AI question generation. Please ensure the generation service is running.')
        } else {
          setGenerationError(`Question generation failed: ${aiErr.message}`)
        }
        setQuizPhase('builder')
        return
      }
      // BACKEND_DISABLED only — fall through to mock questions below
    }

    // Mock fallback — only reached when VITE_USE_BACKEND_API is not 'true'
    if (MOCK_FALLBACK_ALLOWED) {
      try {
        const session = createQuizSession(config)
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

  // Called by QuizSession when exam is submitted — receives (results, sessionWithAnswers)
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

  // Results → Review
  const handleGoToReview = useCallback(() => {
    setQuizPhase('practice-review')
  }, [])

  // Review → Results
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

  // Any results/review → fresh builder
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
        // Exam mode → QuizSession
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
      <Header onHome={handleHome} />
      <Sidebar
        activeNav={selectedSkill ? null : activeNav}
        onNav={handleNav}
        onHome={handleHome}
      />
      <main className="main" id="main-content">
        {renderMain()}
      </main>
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
      <div style={{ fontSize: 40, marginBottom: 8, opacity: .3 }}>🔧</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t1)', letterSpacing: '-.3px' }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--t3)', maxWidth: 340, lineHeight: 1.65 }}>
        {label} will be available in a future phase.
      </div>
    </div>
  )
}
