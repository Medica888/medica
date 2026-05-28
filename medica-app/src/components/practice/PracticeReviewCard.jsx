/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   userAnswer: import('../../lib/quizTypes').OptionLetter | null
 *   questionNumber: number
 * }} props
 */
export default function PracticeReviewCard({ question, userAnswer, questionNumber }) {
  const isCorrect = userAnswer === question.correct
  const options = question.options.slice(0, 4)

  const getState = (opt) => {
    if (opt.letter === question.correct) return 'correct'
    if (opt.letter === userAnswer && !isCorrect) return 'wrong'
    return 'neutral'
  }

  return (
    <div className={`prv-card${isCorrect ? ' correct' : ' wrong'}`}>
      {/* Card header */}
      <div className="prv-card-hdr">
        <span className="prv-card-num">Q{questionNumber}</span>
        <div className="prv-card-tags">
          {question.subject   && <span className="prv-tag">{question.subject}</span>}
          {question.system    && <span className="prv-tag">{question.system}</span>}
          {question.difficulty && <span className="prv-tag diff">{question.difficulty}</span>}
        </div>
        <span className={`prv-result-badge${isCorrect ? ' correct' : ' wrong'}`}>
          {isCorrect ? 'Correct' : 'Incorrect'}
        </span>
      </div>

      {/* Stem */}
      <p className="prv-stem">{question.stem}</p>

      {/* Options */}
      <div className="prv-options">
        {options.map(opt => (
          <div key={opt.letter} className={`prv-opt ${getState(opt)}`}>
            <span className="prv-opt-letter">{opt.letter}</span>
            <span className="prv-opt-text">{opt.text}</span>
            {getState(opt) === 'correct' && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2.5 7L5.5 10L11.5 4" stroke="var(--green)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {getState(opt) === 'wrong' && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="var(--red)" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            )}
          </div>
        ))}
      </div>

      {/* Explanation */}
      {question.explanation && (
        <div className="prv-explanation">
          <p>{question.explanation}</p>
        </div>
      )}

      {/* Pearl */}
      {question.pearl && (
        <div className="prv-pearl">
          <span className="prv-pearl-label">High-Yield Pearl</span>
          <p>{question.pearl}</p>
        </div>
      )}
    </div>
  )
}
