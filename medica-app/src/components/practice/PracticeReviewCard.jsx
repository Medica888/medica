import HighlightedText from '../session/HighlightedText'
import { getDifficultyDisplayLabel } from '../../lib/quizTypes'
import {
  getCorrectLetter,
  getUserLetter,
  isQuestionCorrect,
  normalizeOptions,
} from '../../lib/examReviewHelpers'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   userAnswer: import('../../lib/quizTypes').OptionLetter | null
 *   questionNumber: number
 *   highlights?: Array<{start: number, end: number, color: string}>
 * }} props
 */
export default function PracticeReviewCard({ question, userAnswer, questionNumber, highlights = [] }) {
  const correctLetter = getCorrectLetter(question)
  const userLetter = getUserLetter(userAnswer)
  const isCorrect = isQuestionCorrect(question, userAnswer)
  const options = normalizeOptions(question.options)
  const explanationLetters = options
    .map(opt => opt.letter)
    .filter(letter => String(question.optionExplanations?.[letter] ?? '').trim())

  const getState = (opt) => {
    if (opt.letter === correctLetter) return 'correct'
    if (opt.letter === userLetter && !isCorrect) return 'wrong'
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
          {question.difficulty && <span className="prv-tag diff">{getDifficultyDisplayLabel(question.difficulty)}</span>}
        </div>
        <span className={`prv-result-badge${isCorrect ? ' correct' : ' wrong'}`}>
          {isCorrect ? 'Correct' : 'Incorrect'}
        </span>
      </div>

      {/* Stem */}
      <HighlightedText text={question.stem} highlights={highlights} enabled={false} className="prv-stem" />

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

      {/* Option explanations */}
      {explanationLetters.length > 0 && (
        <div className="prv-opt-exps">
          <div className="prv-opt-exps-label">Option Dissection</div>
          {explanationLetters.map(letter => (
            <div key={letter} className="prv-opt-exp-row">
              <span className="prv-opt-exp-letter">{letter}</span>
              <span className="prv-opt-exp-text">{question.optionExplanations[letter]}</span>
            </div>
          ))}
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
