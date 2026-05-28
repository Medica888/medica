import { normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'
import PracticeAnswerOption from './PracticeAnswerOption'
import PracticeExplanationPanel from './PracticeExplanationPanel'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   questionNumber: number
 *   answered: import('../../lib/quizTypes').OptionLetter | null
 *   revealed: boolean
 *   onAnswer: (letter: import('../../lib/quizTypes').OptionLetter) => void
 *   onCheckAnswer: () => void
 * }} props
 */
export default function PracticeQuestion({ question, questionNumber, answered, revealed, onAnswer, onCheckAnswer }) {
  const options = normalizeOptions(question.options)
  const normalizedCorrect = normalizeAnswerLetter(question.correct)
  const isCorrect = answered === normalizedCorrect

  const getOptionState = (opt) => {
    if (!answered) return 'default'
    if (!revealed) return opt.letter === answered ? 'selected' : 'default'
    if (opt.letter === normalizedCorrect) return 'correct'
    if (opt.letter === answered && !isCorrect) return 'wrong'
    return 'neutral'
  }

  return (
    <div className="pi-question">
      <div className="pi-q-meta">
        <span className="pi-q-num">Q{questionNumber}</span>
        {question.subject && <span className="pi-q-tag">{question.subject}</span>}
        {question.system  && <span className="pi-q-tag">{question.system}</span>}
        {question.difficulty && <span className="pi-q-tag diff">{question.difficulty}</span>}
      </div>

      <div className="pi-stem">
        <p>{question.stem}</p>
      </div>

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
