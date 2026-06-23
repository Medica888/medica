import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'
import PracticeAnswerOption from './PracticeAnswerOption'
import PracticeExplanationPanel from './PracticeExplanationPanel'
import HighlightedText from '../session/HighlightedText'
import QuizUtilityBar from '../session/QuizUtilityBar'
import QuizHighlightToolbar from '../session/QuizHighlightToolbar'
import QuestionReportControl from '../session/QuestionReportControl'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   questionNumber: number
 *   answered: import('../../lib/quizTypes').OptionLetter | null
 *   revealed: boolean
 *   onAnswer: (letter: import('../../lib/quizTypes').OptionLetter) => void
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
export default function PracticeQuestion({ question, questionNumber, answered, revealed, onAnswer, onCheckAnswer, highlights = [], activeHighlightColor = 'yellow', onHighlight, onChangeHighlightColor, onClearHighlights, openDrawer = null, onToggle, hasNotes = false }) {
  const options = normalizeOptions(question.options)
  const normalizedCorrect  = getQuestionCorrectLetter(question)
  const normalizedAnswered = normalizeAnswerLetter(answered)
  const isCorrect = normalizedAnswered === normalizedCorrect

  const getOptionState = (opt) => {
    if (!normalizedAnswered) return 'default'
    if (!revealed) return opt.letter === normalizedAnswered ? 'selected' : 'default'
    if (opt.letter === normalizedCorrect) return 'correct'
    if (opt.letter === normalizedAnswered && !isCorrect) return 'wrong'
    return 'neutral'
  }

  return (
    <div className="pi-question">
      <div className="pi-q-meta">
        <div className="pi-q-meta-left">
          <span className="pi-q-num">Q{questionNumber}</span>
          {question.subject && <span className="pi-q-tag">{question.subject}</span>}
          {question.system  && <span className="pi-q-tag">{question.system}</span>}
          {question.difficulty && <span className="pi-q-tag diff">{question.difficulty}</span>}
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

      <div className="pi-stem">
        <HighlightedText
          text={question.stem}
          highlights={highlights}
          activeColor={activeHighlightColor}
          onHighlight={onHighlight}
          enabled={!!onHighlight}
        />
      </div>

      <QuestionReportControl question={question} context={{ mode: 'practice' }} />

      <div className="pi-options" role="group" aria-label="Answer options">
        {options.map(opt => (
          <PracticeAnswerOption
            key={opt.letter}
            option={opt}
            state={getOptionState(opt)}
            disabled={revealed}
            onClick={() => onAnswer(opt.letter)}
          />
        ))}
      </div>

      {answered && !revealed && (
        <button type="button" className="pi-check-btn" onClick={onCheckAnswer}>
          Check Answer
        </button>
      )}

      {revealed && answered && (
        <PracticeExplanationPanel
          question={question}
          answered={answered}
          isCorrect={isCorrect}
        />
      )}

      {!answered && (
        <div className="pi-select-hint">Select an answer to continue</div>
      )}
    </div>
  )
}
