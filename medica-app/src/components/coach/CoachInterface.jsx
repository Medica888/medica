import { useState, useEffect } from 'react'
import CoachQuestion from './CoachQuestion'
import { saveQuizSession } from '../../lib/storage'
import { normalizeQuestion } from '../../lib/mockQuestions'
import { calculateCoachResults } from '../../lib/coachScoring'
import QuestionNavigator from '../session/QuestionNavigator'
import LabDrawer from '../session/LabDrawer'
import NotesDrawer from '../session/NotesDrawer'
import CalculatorDrawer from '../session/CalculatorDrawer'

/**
 * @param {{
 *   session: import('../../lib/quizTypes').QuizSession
 *   onComplete: (results: import('../../lib/coachScoring').CoachResults, session: import('../../lib/quizTypes').QuizSession) => void
 *   onExit: () => void
 * }} props
 */
export default function CoachInterface({ session: initialSession, onComplete, onExit }) {
  const normalizedQuestions = initialSession.questions.map(normalizeQuestion)
  const [session] = useState({ ...initialSession, questions: normalizedQuestions })

  const [currentIndex, setCurrentIndex] = useState(() => {
    const saved = Number(initialSession.currentIndex) || 0
    return Math.max(0, Math.min(saved, Math.max(normalizedQuestions.length - 1, 0)))
  })
  const [answers, setAnswers]           = useState(() => ({ ...(initialSession.answers || {}) }))
  const [revealed, setRevealed]         = useState(() => ({ ...(initialSession.revealed || {}) }))
  const [openDrawer, setOpenDrawer]     = useState(null)
  const [notes, setNotes]               = useState(() => ({ ...(initialSession.notes || {}) }))
  const [highlights, setHighlights]     = useState(() => ({ ...(initialSession.highlights || {}) }))
  const [activeHighlightColor, setActiveHighlightColor] = useState('yellow')

  const questions  = session.questions
  const totalQ     = questions.length
  const question   = questions[currentIndex]
  const answered   = answers[question?.id] ?? null
  const isRevealed = revealed[question?.id] ?? false
  const isLastQ    = currentIndex === totalQ - 1

  useEffect(() => {
    saveQuizSession({ ...session, answers, currentIndex, revealed, notes, highlights })
  }, [answers, currentIndex, revealed, notes, highlights, session])

  const handleAnswer = (letter) => {
    if (revealed[question.id]) return
    setAnswers(prev => ({ ...prev, [question.id]: letter }))
  }

  const handleCheckAnswer = () => {
    if (!answers[question.id]) return
    setRevealed(prev => ({ ...prev, [question.id]: true }))
  }

  const handleNext = () => {
    if (currentIndex < totalQ - 1) setCurrentIndex(i => i + 1)
  }

  const handlePrev = () => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1)
  }

  const handleFinish = () => {
    const sessionWithAnswers = { ...session, answers, currentIndex, revealed, notes, highlights }
    const results = calculateCoachResults(sessionWithAnswers)
    onComplete(results, sessionWithAnswers)
  }

  const closeDrawer = () => setOpenDrawer(null)

  const handleHighlight = (start, end, color) => {
    setHighlights(h => ({
      ...h,
      [question.id]: [...(h[question.id] || []), { start, end, color }],
    }))
  }

  if (!question) {
    return (
      <div className="ci-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
          No enriched questions available for this configuration.
        </div>
        <button type="button" className="ci-exit-btn" onClick={onExit} style={{ marginTop: 12 }}>
          Back to Builder
        </button>
      </div>
    )
  }

  const revealedCount = Object.values(revealed).filter(Boolean).length
  const progressPct   = Math.round(((currentIndex + 1) / totalQ) * 100)

  return (
    <div className="ci-page">
      {/* Header */}
      <div className="ci-hdr">
        <div className="ci-hdr-left">
          <button type="button" className="ci-exit-btn" onClick={onExit} aria-label="Exit coach">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exit
          </button>
          <div className="ci-hdr-sep" />
          <div className="ci-mode-badge">Coach Mode</div>
        </div>

        <div className="ci-progress-wrap">
          <div
            className="ci-progress-bar"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Question ${currentIndex + 1} of ${totalQ}`}
          >
            <div className="ci-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="ci-progress-lbl">Q {currentIndex + 1} of {totalQ}</span>
        </div>

        <div className="ci-hdr-right">
          {revealedCount > 0 && (
            <span className="ci-explained-lbl">{revealedCount}/{totalQ} explained</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="ci-body">
        <div className="ci-content">
          <CoachQuestion
            question={question}
            questionNumber={currentIndex + 1}
            answered={answered}
            revealed={isRevealed}
            onAnswer={handleAnswer}
            onCheckAnswer={handleCheckAnswer}
            highlights={highlights[question.id] || []}
            activeHighlightColor={activeHighlightColor}
            onHighlight={handleHighlight}
            onChangeHighlightColor={setActiveHighlightColor}
            onClearHighlights={() => setHighlights(h => ({ ...h, [question.id]: [] }))}
            openDrawer={openDrawer}
            onToggle={(d) => setOpenDrawer(prev => prev === d ? null : d)}
            hasNotes={!!notes[question.id]}
          />
        </div>
      </div>

      {/* Question Navigator */}
      <QuestionNavigator
        questions={questions}
        currentIndex={currentIndex}
        onSelect={(i) => setCurrentIndex(i)}
        getStatus={(q, i) => {
          if (i === currentIndex) return 'current'
          if (revealed[q.id]) return 'revealed'
          if (answers[q.id])  return 'selected'
          return 'unanswered'
        }}
        mode="coach"
      />

      {/* Navigation footer */}
      <div className="ci-nav">
        <div className="ci-nav-left">
          <button
            type="button"
            className="ci-nav-btn secondary"
            onClick={handlePrev}
            disabled={currentIndex === 0}
            aria-label="Previous question"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 2.5L4 7L8.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Previous
          </button>
        </div>

        <div className="ci-nav-center">
          <span className="ci-nav-counter">{currentIndex + 1} of {totalQ}</span>
        </div>

        <div className="ci-nav-right">
          {isLastQ && isRevealed ? (
            <button
              type="button"
              className="ci-nav-btn finish"
              onClick={handleFinish}
            >
              Finish Session
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="ci-nav-btn primary"
              onClick={handleNext}
              disabled={currentIndex === totalQ - 1 || !isRevealed}
              aria-label="Next question"
            >
              Next Question
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5.5 2.5L10 7L5.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Non-blocking drawers */}
      <LabDrawer isOpen={openDrawer === 'labs'} onClose={closeDrawer} />
      <CalculatorDrawer isOpen={openDrawer === 'calc'} onClose={closeDrawer} />
      <NotesDrawer
        isOpen={openDrawer === 'notes'}
        onClose={closeDrawer}
        questionId={question.id}
        notes={notes}
        onNotesChange={(id, val) => setNotes(n => ({ ...n, [id]: val }))}
      />
    </div>
  )
}
