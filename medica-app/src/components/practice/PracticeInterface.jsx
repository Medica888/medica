import { useState, useEffect } from 'react'
import PracticeQuestion from './PracticeQuestion'
import { saveQuizSession } from '../../lib/storage'
import { normalizeQuestion } from '../../lib/mockQuestions'
import { calculatePracticeResults } from '../../lib/practiceScoring'

/**
 * @param {{
 *   session: import('../../lib/quizTypes').QuizSession
 *   onComplete: (results: import('../../lib/practiceScoring').PracticeResults) => void
 *   onExit: () => void
 * }} props
 */
export default function PracticeInterface({ session: initialSession, onComplete, onExit }) {
  // Normalize all questions to A-D on mount
  const normalizedQuestions = initialSession.questions.map(normalizeQuestion)
  const [session] = useState({ ...initialSession, questions: normalizedQuestions })

  const [currentIndex, setCurrentIndex] = useState(0)
  // answers: Record<questionId, OptionLetter>
  const [answers, setAnswers] = useState({})
  // revealed: Record<questionId, boolean> — explanation shown
  const [revealed, setRevealed] = useState({})

  const questions  = session.questions
  const totalQ     = questions.length
  const question   = questions[currentIndex]
  const answered   = answers[question?.id] ?? null
  const isRevealed = revealed[question?.id] ?? false
  const isLastQ    = currentIndex === totalQ - 1

  // Persist session progress
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
          {/* No timer in practice mode */}
          <span className="pi-no-timer-label">No time limit</span>
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
          />
        </div>
      </div>

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

        {/* Question dot navigator */}
        <div className="pi-nav-dots" aria-label="Question navigation">
          {questions.map((q, i) => (
            <button
              key={i}
              type="button"
              className={`pi-dot${i === currentIndex ? ' active' : ''}${revealed[q.id] ? ' answered' : ''}`}
              onClick={() => setCurrentIndex(i)}
              aria-label={`Question ${i + 1}${answers[q.id] ? ', answered' : ''}`}
            />
          ))}
        </div>

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
    </div>
  )
}
