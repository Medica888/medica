import { useState, useEffect } from 'react'
import PracticeQuestion from './PracticeQuestion'
import { saveQuizSession } from '../../lib/storage'
import { normalizeQuestion } from '../../lib/mockQuestions'
import { calculatePracticeResults } from '../../lib/practiceScoring'
import QuestionNavigator from '../session/QuestionNavigator'
import LabDrawer from '../session/LabDrawer'
import NotesDrawer from '../session/NotesDrawer'
import CalculatorDrawer from '../session/CalculatorDrawer'

/**
 * @param {{
 *   session: import('../../lib/quizTypes').QuizSession
 *   onComplete: (results: import('../../lib/practiceScoring').PracticeResults) => void
 *   onExit: () => void
 * }} props
 */
export default function PracticeInterface({ session: initialSession, onComplete, onExit }) {
  const normalizedQuestions = initialSession.questions.map(normalizeQuestion)
  const [session] = useState({ ...initialSession, questions: normalizedQuestions })

  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers]           = useState({})
  const [revealed, setRevealed]         = useState({})
  const [openDrawer, setOpenDrawer]     = useState(null)
  const [notes, setNotes]               = useState({})
  const [highlights, setHighlights]     = useState({})
  const [activeHighlightColor, setActiveHighlightColor] = useState('yellow')

  const questions  = session.questions
  const totalQ     = questions.length
  const question   = questions[currentIndex]
  const answered   = answers[question?.id] ?? null
  const isRevealed = revealed[question?.id] ?? false
  const isLastQ    = currentIndex === totalQ - 1

  useEffect(() => {
    saveQuizSession({ ...session, answers, currentIndex })
  }, [answers, currentIndex, session])

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
    const sessionWithAnswers = { ...session, answers }
    const results = calculatePracticeResults(sessionWithAnswers)
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
      <div className="pi-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center' }}>
          No questions available for this configuration.
        </div>
        <button type="button" className="pi-exit-btn" onClick={onExit} style={{ marginTop: 12 }}>
          Back to Builder
        </button>
      </div>
    )
  }

  const progressPct = Math.round(((currentIndex + 1) / totalQ) * 100)

  return (
    <div className="pi-page">
      {/* Header */}
      <div className="pi-hdr">
        <div className="pi-hdr-left">
          <button type="button" className="pi-exit-btn" onClick={onExit} aria-label="Exit practice">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exit
          </button>
          <div className="pi-hdr-sep" />
          <div className="pi-mode-badge">Practice Mode</div>
        </div>

        <div className="pi-progress-wrap">
          <div className="pi-progress-bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`Question ${currentIndex + 1} of ${totalQ}`}>
            <div className="pi-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="pi-progress-lbl">Q {currentIndex + 1} of {totalQ}</span>
        </div>

        <div className="pi-hdr-right">
          <div className="exam-utility-row" role="toolbar" aria-label="Study tools">
            <button
              type="button"
              className={`exam-util-btn${openDrawer === 'labs' ? ' active' : ''}`}
              onClick={() => setOpenDrawer(d => d === 'labs' ? null : 'labs')}
              aria-expanded={openDrawer === 'labs'}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M5 1.5v5L2 12h10L9 6.5V1.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 1.5h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
                <path d="M3.5 8.5h7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
              Lab Values
            </button>
            <button
              type="button"
              className={`exam-util-btn${openDrawer === 'calc' ? ' active' : ''}`}
              onClick={() => setOpenDrawer(d => d === 'calc' ? null : 'calc')}
              aria-expanded={openDrawer === 'calc'}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.35"/>
                <rect x="3" y="2.5" width="8" height="2.5" rx=".75" fill="currentColor" opacity=".3"/>
                <circle cx="4" cy="8" r=".9" fill="currentColor"/>
                <circle cx="7" cy="8" r=".9" fill="currentColor"/>
                <circle cx="10" cy="8" r=".9" fill="currentColor"/>
                <circle cx="4" cy="11" r=".9" fill="currentColor"/>
                <circle cx="7" cy="11" r=".9" fill="currentColor"/>
                <circle cx="10" cy="11" r=".9" fill="currentColor"/>
              </svg>
              Calculator
            </button>
            <button
              type="button"
              className={`exam-util-btn${notes[question.id] ? ' has-notes' : ''}${openDrawer === 'notes' ? ' active' : ''}`}
              onClick={() => setOpenDrawer(d => d === 'notes' ? null : 'notes')}
              aria-expanded={openDrawer === 'notes'}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.35"/>
                <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Notes
              {notes[question.id] && <span className="exam-util-dot" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="pi-body">
        <div className="pi-content">
          <PracticeQuestion
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
          if (answers[q.id])   return 'selected'
          return 'unanswered'
        }}
        mode="practice"
      />

      {/* Navigation footer */}
      <div className="pi-nav">
        <button
          type="button"
          className="pi-nav-btn secondary"
          onClick={handlePrev}
          disabled={currentIndex === 0}
          aria-label="Previous question"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M8.5 2.5L4 7L8.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Previous
        </button>

        {isLastQ && isRevealed ? (
          <button
            type="button"
            className="pi-nav-btn finish"
            onClick={handleFinish}
          >
            Finish Practice
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 7L5.5 10L11.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="pi-nav-btn primary"
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
