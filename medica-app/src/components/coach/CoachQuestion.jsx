import { normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'
import CoachAnswerOption from './CoachAnswerOption'
import CoachExplanationPanel from './CoachExplanationPanel'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   questionNumber: number
 *   answered: string | null
 *   revealed: boolean
 *   onAnswer: (letter: string) => void
 *   onCheckAnswer: () => void
 * }} props
 */
export default function CoachQuestion({ question, questionNumber, answered, revealed, onAnswer, onCheckAnswer }) {
  const options = normalizeOptions(question.options)
  const normalizedCorrect = normalizeAnswerLetter(question.correct)

  const getOptionState = (letter) => {
    if (!answered) return 'default'
    if (!revealed) return letter === answered ? 'selected' : 'default'
    if (letter === normalizedCorrect) return 'correct'
    if (letter === answered && letter !== normalizedCorrect) return 'wrong'
    return 'neutral'
  }

  return (
    <div className="ci-question">
      <div className="ci-q-meta">
        <span className="ci-q-num">Q{questionNumber}</span>
        {question.subject && <span className="ci-q-tag">{question.subject}</span>}
        {question.system && <span className="ci-q-tag">{question.system}</span>}
        {question.topicGroup && <span className="ci-q-tag">{question.topicGroup}</span>}
        {question.difficulty && <span className="ci-q-tag ci-q-tag--diff">{question.difficulty}</span>}
      </div>

      <div className="ci-question-card">
        <p className="ci-stem">{question.stem}</p>
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
