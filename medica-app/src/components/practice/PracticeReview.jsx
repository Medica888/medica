import { useState } from 'react'
import PracticeReviewCard from './PracticeReviewCard'

/**
 * @param {{
 *   session: import('../../lib/quizTypes').QuizSession
 *   onBack: () => void
 *   onNewQuiz: () => void
 * }} props
 */
export default function PracticeReview({ session, onBack, onNewQuiz }) {
  const [filter, setFilter] = useState('all') // 'all' | 'incorrect'

  const questions = session.questions
  const answers = session.answers

  const filtered = filter === 'incorrect'
    ? questions.filter(q => answers[q.id] !== q.correct)
    : questions

  const incorrectCount = questions.filter(q => answers[q.id] !== q.correct).length

  return (
    <div className="prv-page">
      {/* Header */}
      <div className="prv-hdr">
        <div className="prv-hdr-left">
          <button type="button" className="prv-back-btn" onClick={onBack} aria-label="Back to results">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Results
          </button>
        </div>

        <div className="prv-hdr-center">
          <span className="prv-hdr-title">Answer Review</span>
          <span className="prv-hdr-sub">{questions.length} questions</span>
        </div>

        <div className="prv-hdr-right">
          <button type="button" className="prv-new-btn" onClick={onNewQuiz}>
            New Quiz
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="prv-filters">
        <button
          type="button"
          className={`prv-filter-btn${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          Review All
          <span className="prv-filter-count">{questions.length}</span>
        </button>
        <button
          type="button"
          className={`prv-filter-btn${filter === 'incorrect' ? ' active' : ''}`}
          onClick={() => setFilter('incorrect')}
        >
          Review Incorrect
          <span className="prv-filter-count wrong">{incorrectCount}</span>
        </button>
      </div>

      {/* Cards */}
      <div className="prv-list">
        {filtered.length === 0 ? (
          <div className="prv-empty">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="var(--green)" strokeWidth="1.5" opacity=".4" />
              <path d="M9 16L13 20L23 11" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p>No incorrect answers. Perfect score!</p>
          </div>
        ) : (
          filtered.map((q) => (
            <PracticeReviewCard
              key={q.id}
              question={q}
              userAnswer={answers[q.id] ?? null}
              questionNumber={questions.indexOf(q) + 1}
            />
          ))
        )}
      </div>
    </div>
  )
}
