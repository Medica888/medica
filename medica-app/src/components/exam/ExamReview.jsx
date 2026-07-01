import { useState, useEffect, useMemo } from 'react'
import ExamReviewCard from './ExamReviewCard'
import { isQuestionAnswered, isQuestionCorrect } from '../../lib/examReviewHelpers'
import QuestionNavigator from '../session/QuestionNavigator'

/**
 * @param {{
 *   session: import('../../lib/quizTypes').QuizSession & { marked?: object }
 *   initialFilter?: string
 *   onBack: () => void
 *   onNewQuiz: () => void
 * }} props
 */
export default function ExamReview({ session, initialFilter = 'all', onBack, onNewQuiz }) {
  const [filter, setFilter]           = useState(initialFilter)
  const [focusedIdx, setFocusedIdx]   = useState(null)
  // pendingScrollId: set when the target card isn't in the current filter;
  // cleared by the effect once the filter changes and the card is in the DOM.
  const [pendingScrollId, setPendingScrollId] = useState(null)

  const questions = session.questions
  const answers   = session.answers
  const marked    = session.marked ?? {}

  // Scroll to a pending card after filter change makes it visible
  useEffect(() => {
    if (!pendingScrollId) return
    const el = document.getElementById(`qnav-${pendingScrollId}`)
    if (!el) return
    el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    const frameId = window.requestAnimationFrame(() => setPendingScrollId(null))
    return () => window.cancelAnimationFrame(frameId)
  }, [pendingScrollId, filter])

  const incorrectQs  = questions.filter(q => isQuestionAnswered(answers[q.id]) && !isQuestionCorrect(q, answers[q.id]))
  const markedQs     = questions.filter(q => marked[q.id])
  const unansweredQs = questions.filter(q => !isQuestionAnswered(answers[q.id]))

  const questionIndexMap = useMemo(() => {
    const map = {}
    questions.forEach((q, i) => { map[q.id] = i + 1 })
    return map
  }, [questions])

  const filtered = filter === 'incorrect'  ? incorrectQs
                 : filter === 'marked'     ? markedQs
                 : filter === 'unanswered' ? unansweredQs
                 : questions

  const emptyMsg = filter === 'incorrect'  ? 'No incorrect answers - well done!'
                 : filter === 'marked'     ? 'No questions were marked for review.'
                 : filter === 'unanswered' ? 'All questions were answered.'
                 : 'No questions in this session.'

  return (
    <div className="erv-page">
      {/* Header */}
      <div className="erv-hdr">
        <div className="erv-hdr-left">
          <button type="button" className="erv-back-btn" onClick={onBack} aria-label="Back to results">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Results
          </button>
        </div>

        <div className="erv-hdr-center">
          <span className="erv-hdr-title">Exam Review</span>
          <span className="erv-hdr-sub">{questions.length} questions</span>
        </div>

        <div className="erv-hdr-right">
          <button type="button" className="erv-new-btn" onClick={onNewQuiz}>
            New Quiz
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="erv-filters">
        <button
          type="button"
          className={`erv-filter-btn${filter === 'all' ? ' active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
          <span className="erv-filter-count">{questions.length}</span>
        </button>
        <button
          type="button"
          className={`erv-filter-btn${filter === 'incorrect' ? ' active' : ''}`}
          onClick={() => setFilter('incorrect')}
        >
          Incorrect
          <span className="erv-filter-count wrong">{incorrectQs.length}</span>
        </button>
        <button
          type="button"
          className={`erv-filter-btn${filter === 'marked' ? ' active' : ''}`}
          onClick={() => setFilter('marked')}
        >
          Marked
          <span className="erv-filter-count marked">{markedQs.length}</span>
        </button>
        <button
          type="button"
          className={`erv-filter-btn${filter === 'unanswered' ? ' active' : ''}`}
          onClick={() => setFilter('unanswered')}
        >
          Unanswered
          <span className="erv-filter-count skipped">{unansweredQs.length}</span>
        </button>
      </div>

      {/* Question Navigator outside the scrollable list */}
      <QuestionNavigator
        questions={questions}
        currentIndex={focusedIdx}
        onSelect={(i) => {
          const q = questions[i]
          setFocusedIdx(i)
          const el = document.getElementById(`qnav-${q.id}`)
          if (el) {
            el.scrollIntoView({ block: 'start', behavior: 'smooth' })
          } else {
            // Card is filtered out - switch to 'all' then scroll once it renders.
            setFilter('all')
            setPendingScrollId(q.id)
          }
        }}
        getStatus={(q, i) => {
          if (i === focusedIdx) return 'current'
          const ua = answers[q.id]
          if (!isQuestionAnswered(ua)) return marked[q.id] ? 'marked' : 'unanswered'
          return isQuestionCorrect(q, ua) ? 'correct' : 'incorrect'
        }}
        mode="review"
      />

      {/* Cards list scrolls independently */}
      <div className="erv-list">
        {filtered.length === 0 ? (
          <div className="erv-empty">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
              <circle cx="16" cy="16" r="14" stroke="var(--green)" strokeWidth="1.5" opacity=".4" />
              <path d="M9 16L13 20L23 11" stroke="var(--green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p>{emptyMsg}</p>
          </div>
        ) : (
          filtered.map((q) => (
            <div key={`${filter}-${q.id}`} id={`qnav-${q.id}`}>
              <ExamReviewCard
                question={q}
                userAnswer={answers[q.id] ?? null}
                questionNumber={questionIndexMap[q.id]}
                isMarked={!!marked[q.id]}
                sessionConfig={session.config}
                highlights={session.highlights?.[q.id] ?? []}
                defaultExpanded={filtered.length <= 5}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
