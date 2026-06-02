import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   answered: import('../../lib/quizTypes').OptionLetter
 *   isCorrect: boolean
 * }} props
 */
export default function PracticeExplanationPanel({ question, answered, isCorrect }) {
  const options = normalizeOptions(question.options)
  const normalizedCorrect  = getQuestionCorrectLetter(question)
  const normalizedAnswered = normalizeAnswerLetter(answered)
  const answeredOption = options.find(o => o.letter === normalizedAnswered)
  const correctOption  = options.find(o => o.letter === normalizedCorrect)

  return (
    <div className={`pi-exp${isCorrect ? ' correct' : ' wrong'}`} role="region" aria-label="Explanation">
      {/* Verdict */}
      <div className="pi-exp-verdict">
        {isCorrect ? (
          <>
            <span className="pi-exp-icon correct" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="8" fill="var(--green)" opacity=".14" />
                <path d="M4.5 9L7.5 12L13.5 6" stroke="var(--green)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="pi-exp-verdict-text correct">Correct — well done</span>
          </>
        ) : (
          <>
            <span className="pi-exp-icon wrong" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="8" fill="var(--red)" opacity=".12" />
                <path d="M6 6L12 12M12 6L6 12" stroke="var(--red)" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            </span>
            <span className="pi-exp-verdict-text wrong">Not quite</span>
          </>
        )}
      </div>

      {/* Answer summary when wrong */}
      {!isCorrect && (
        <div className="pi-exp-answer-row">
          <div className="pi-exp-chosen">
            <span className="pi-exp-ans-lbl">You chose</span>
            <span className="pi-exp-ans-badge wrong">{normalizedAnswered} — {answeredOption?.text}</span>
          </div>
          <div className="pi-exp-correct-ans">
            <span className="pi-exp-ans-lbl">Correct answer</span>
            <span className="pi-exp-ans-badge correct">{normalizedCorrect} — {correctOption?.text}</span>
          </div>
        </div>
      )}

      {/* Explanation body */}
      <div className="pi-exp-body">
        <p>{question.explanation}</p>
      </div>

      {/* High-yield pearl */}
      {question.pearl && (
        <div className="pi-pearl">
          <span className="pi-pearl-label">High-Yield Pearl</span>
          <p>{question.pearl}</p>
        </div>
      )}
    </div>
  )
}
