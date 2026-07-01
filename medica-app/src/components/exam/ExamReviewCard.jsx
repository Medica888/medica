import { useState } from 'react'
import {
  normalizeOptions, getCorrectLetter, getUserLetter,
  isQuestionAnswered, isQuestionCorrect,
} from '../../lib/examReviewHelpers'
import HighlightedText from '../session/HighlightedText'
import QuestionReportControl from '../session/QuestionReportControl'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   userAnswer: string | null
 *   questionNumber: number
 *   isMarked: boolean
 *   sessionConfig?: object
 * }} props
 */
export default function ExamReviewCard({ question, userAnswer, questionNumber, isMarked, sessionConfig, highlights = [], defaultExpanded = true }) {
  const [detailsExpanded, setDetailsExpanded] = useState(defaultExpanded)
  const correctLetter = getCorrectLetter(question)
  const userLetter    = getUserLetter(userAnswer)
  const answered      = isQuestionAnswered(userAnswer)
  const isCorrect     = isQuestionCorrect(question, userAnswer)
  const isWrong       = answered && !isCorrect
  const isSkipped     = !answered

  const options   = normalizeOptions(question.options)
  const cardClass = isCorrect ? 'erv-card correct' : isWrong ? 'erv-card wrong' : 'erv-card skipped'

  const getOptState = (opt) => {
    if (opt.letter === correctLetter) return 'correct'
    if (opt.letter === userLetter && !isCorrect) return 'wrong'
    return 'neutral'
  }

  const pearl = question.highYieldPearl || question.pearl
  const hasTeachingDetails = Boolean(
    question.explanation
    || (question.optionExplanations && Object.keys(question.optionExplanations).length > 0)
    || pearl
    || question.memoryAnchor
    || question.commonTrap
  )

  return (
    <div className={cardClass}>
      {/* Card header */}
      <div className="erv-card-hdr">
        <div className="erv-card-hdr-left">
          <span className="erv-card-num">Q{questionNumber}</span>
          {isMarked && (
            <span className="erv-marked-chip" aria-label="Marked for review">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" aria-hidden="true">
                <path d="M2 1.5C2 1.22 2.22 1 2.5 1h6C8.78 1 9 1.22 9 1.5v7.72a.5.5 0 0 1-.78.41L5.5 7.6 2.78 9.63A.5.5 0 0 1 2 9.22V1.5z" />
              </svg>
              Marked
            </span>
          )}
        </div>

        <div className="erv-card-tags">
          {question.subject    && <span className="erv-tag">{question.subject}</span>}
          {question.system     && <span className="erv-tag">{question.system}</span>}
          {question.topic      && <span className="erv-tag">{question.topic}</span>}
          {question.difficulty && <span className="erv-tag diff">{question.difficulty}</span>}
        </div>

        <span className={`erv-result-badge ${isCorrect ? 'correct' : isWrong ? 'wrong' : 'skipped'}`}>
          {isCorrect ? 'Correct' : isWrong ? 'Incorrect' : 'Unanswered'}
        </span>
      </div>

      {/* Metadata row */}
      {(question.testedConcept || question.weakSpotCategory) && (
        <div className="erv-meta-row">
          {question.testedConcept && (
            <div className="erv-meta-item">
              <span className="erv-meta-label">Tested Concept</span>
              <span className="erv-meta-val">{question.testedConcept}</span>
            </div>
          )}
          {question.weakSpotCategory && (
            <div className="erv-meta-item">
              <span className="erv-meta-label">Instability Signal</span>
              <span className="erv-meta-val">{question.weakSpotCategory}</span>
            </div>
          )}
        </div>
      )}

      {/* Stem */}
      <HighlightedText text={question.stem} highlights={highlights} enabled={false} className="erv-stem" />

      {/* Options */}
      <div className="erv-options">
        {options.map(opt => {
          const state = getOptState(opt)
          return (
            <div key={opt.letter} className={`erv-opt ${state}`}>
              <span className="erv-opt-letter">{opt.letter}</span>
              <span className="erv-opt-text">{opt.text}</span>
              {state === 'correct' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2.5 7L5.5 10L11.5 4" stroke="var(--green)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {state === 'wrong' && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="var(--red)" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              )}
            </div>
          )
        })}
      </div>

      {/* Answer summary */}
      <div className="erv-answer-summary">
        {isSkipped ? (
          <span className="erv-ans-skipped">Not answered - Correct answer: <strong>{correctLetter}</strong></span>
        ) : isCorrect ? (
          <span className="erv-ans-correct">You chose <strong>{userLetter}</strong> - Correct</span>
        ) : (
          <span className="erv-ans-wrong">You chose <strong>{userLetter}</strong> - Correct answer: <strong>{correctLetter}</strong></span>
        )}
      </div>

      {hasTeachingDetails && (
        <button
          type="button"
          className="erv-details-toggle"
          onClick={() => setDetailsExpanded(value => !value)}
          aria-expanded={detailsExpanded}
        >
          {detailsExpanded ? 'Hide teaching details' : 'Show teaching details'}
        </button>
      )}

      {/* Explanation */}
      {detailsExpanded && question.explanation && (
        <div className="erv-explanation">
          <p>{question.explanation}</p>
        </div>
      )}

      {/* Option explanations */}
      {detailsExpanded && question.optionExplanations && Object.keys(question.optionExplanations).length > 0 && (
        <div className="erv-opt-exps">
          <div className="erv-opt-exps-label">Option Dissection</div>
          {['A', 'B', 'C', 'D'].map(letter => {
            const exp = question.optionExplanations[letter]
            if (!exp) return null
            return (
              <div key={letter} className="erv-opt-exp-row">
                <span className="erv-opt-exp-letter">{letter}</span>
                <span className="erv-opt-exp-text">{exp}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* High-yield pearl */}
      {detailsExpanded && pearl && (
        <div className="erv-pearl">
          <span className="erv-pearl-label">High-Yield Pearl</span>
          <p>{pearl}</p>
        </div>
      )}

      {/* Memory anchor */}
      {detailsExpanded && question.memoryAnchor && (
        <div className="erv-anchor">
          <span className="erv-anchor-label">Memory Anchor</span>
          <p>{question.memoryAnchor}</p>
        </div>
      )}

      {/* Common trap */}
      {detailsExpanded && question.commonTrap && (
        <div className="erv-trap">
          <span className="erv-trap-label">Common Trap</span>
          <p>{question.commonTrap}</p>
        </div>
      )}

      <QuestionReportControl
        question={question}
        context={{
          mode: 'exam',
          source: sessionConfig?.source,
          subject: sessionConfig?.subject,
          system: sessionConfig?.system,
          topic: sessionConfig?.topic || sessionConfig?.clinicalFocus,
        }}
      />
    </div>
  )
}
