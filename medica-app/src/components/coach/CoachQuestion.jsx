import { useState } from 'react'
import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'
import CoachAnswerOption from './CoachAnswerOption'
import CoachExplanationPanel from './CoachExplanationPanel'
import { saveQuestionReport } from '../../lib/storage'
import HighlightedText from '../session/HighlightedText'
import QuizUtilityBar from '../session/QuizUtilityBar'
import QuizHighlightToolbar from '../session/QuizHighlightToolbar'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   questionNumber: number
 *   answered: string | null
 *   revealed: boolean
 *   onAnswer: (letter: string) => void
 *   onCheckAnswer: () => void
 *   highlights?: Array<{start:number,end:number,color:string}>
 *   activeHighlightColor?: string
 *   onHighlight?: (start:number,end:number,color:string) => void
 *   onChangeHighlightColor?: (color:string) => void
 *   onClearHighlights?: () => void
 *   openDrawer?: string | null
 *   onToggle?: (drawer: string) => void
 *   hasNotes?: boolean
 * }} props
 */
export default function CoachQuestion({ question, questionNumber, answered, revealed, onAnswer, onCheckAnswer, highlights = [], activeHighlightColor = 'yellow', onHighlight, onChangeHighlightColor, onClearHighlights, openDrawer = null, onToggle, hasNotes = false }) {
  const options = normalizeOptions(question.options)
  const normalizedCorrect  = getQuestionCorrectLetter(question)
  const normalizedAnswered = normalizeAnswerLetter(answered)
  const [reportReason, setReportReason] = useState('wrong_answer')
  const [reported, setReported] = useState(false)

  const getOptionState = (letter) => {
    if (!normalizedAnswered) return 'default'
    if (!revealed) return letter === normalizedAnswered ? 'selected' : 'default'
    if (letter === normalizedCorrect) return 'correct'
    if (letter === normalizedAnswered && letter !== normalizedCorrect) return 'wrong'
    return 'neutral'
  }

  const handleReport = () => {
    const saved = saveQuestionReport(question, reportReason, { mode: 'coach' })
    if (saved) setReported(true)
  }

  return (
    <div className="ci-question">
      <div className="ci-q-meta">
        <div className="ci-q-meta-left">
          <span className="ci-q-num">Q{questionNumber}</span>
          {question.subject && <span className="ci-q-tag">{question.subject}</span>}
          {question.system && <span className="ci-q-tag">{question.system}</span>}
          {question.topicGroup && <span className="ci-q-tag">{question.topicGroup}</span>}
          {question.difficulty && <span className="ci-q-tag ci-q-tag--diff">{question.difficulty}</span>}
        </div>
        {onToggle && <QuizUtilityBar openDrawer={openDrawer} onToggle={onToggle} hasNotes={hasNotes} />}
      </div>

      {/* Highlight toolbar */}
      {onHighlight && (
        <QuizHighlightToolbar
          highlights={highlights}
          activeColor={activeHighlightColor}
          onChangeColor={onChangeHighlightColor}
          onClear={onClearHighlights}
        />
      )}

      <div className="ci-question-card">
        <HighlightedText
          text={question.stem}
          highlights={highlights}
          activeColor={activeHighlightColor}
          onHighlight={onHighlight}
          enabled={!!onHighlight}
          className="ci-stem"
        />
      </div>

      <div className="question-report-row">
        <select
          className="question-report-select"
          value={reportReason}
          onChange={e => { setReportReason(e.target.value); setReported(false) }}
          aria-label="Report question reason"
        >
          <option value="wrong_answer">Wrong answer</option>
          <option value="bad_explanation">Bad explanation</option>
          <option value="off_topic">Off topic</option>
          <option value="ambiguous_or_insufficient_clues">Ambiguous / insufficient clinical clues</option>
        </select>
        <button type="button" className="question-report-btn" onClick={handleReport}>
          Report
        </button>
        {reported && <span className="question-report-status">Saved</span>}
      </div>

      {options.length > 0 ? (
        <div className="ci-options" role="group" aria-label="Answer options">
          {options.map(opt => (
            <CoachAnswerOption
              key={opt.letter}
              option={opt}
              state={getOptionState(opt.letter)}
              onClick={() => onAnswer(opt.letter)}
              disabled={revealed}
            />
          ))}
        </div>
      ) : (
        <p className="ci-select-hint">Options unavailable for this question.</p>
      )}

      {!revealed && (
        <div className="ci-check-area">
          <p className="ci-check-hint">
            {answered
              ? 'Check your reasoning.'
              : 'Select an answer to unlock the Coach explanation.'}
          </p>
          {answered && (
            <button type="button" className="ci-check-btn" onClick={onCheckAnswer}>
              Check Answer
            </button>
          )}
        </div>
      )}

      {revealed && answered && (
        <CoachExplanationPanel question={question} userAnswer={answered} />
      )}
    </div>
  )
}
