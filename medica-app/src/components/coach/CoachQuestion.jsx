import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'
import CoachAnswerOption from './CoachAnswerOption'
import CoachExplanationPanel from './CoachExplanationPanel'
import HighlightedText from '../session/HighlightedText'
import QuizUtilityBar from '../session/QuizUtilityBar'
import QuizHighlightToolbar from '../session/QuizHighlightToolbar'
import QuestionReportControl from '../session/QuestionReportControl'

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

  const getOptionState = (letter) => {
    if (!normalizedAnswered) return 'default'
    if (!revealed) return letter === normalizedAnswered ? 'selected' : 'default'
    if (letter === normalizedCorrect) return 'correct'
    if (letter === normalizedAnswered && letter !== normalizedCorrect) return 'wrong'
    return 'neutral'
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

      <QuestionReportControl question={question} context={{ mode: 'coach' }} />

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
