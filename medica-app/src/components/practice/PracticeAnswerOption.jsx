/**
 * @param {{
 *   option: import('../../lib/quizTypes').QuizOption
 *   state: 'default' | 'correct' | 'wrong' | 'neutral'
 *   disabled: boolean
 *   onClick: () => void
 * }} props
 */
export default function PracticeAnswerOption({ option, state, disabled, onClick }) {
  return (
    <button
      type="button"
      className={`pi-option${state !== 'default' ? ` ${state}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state === 'selected' || state === 'correct' || state === 'wrong'}
    >
      <span className="pi-opt-letter">{option.letter}</span>
      <span className="pi-opt-text">{option.text}</span>
      {state === 'correct' && (
        <svg className="pi-opt-icon correct" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {state === 'wrong' && (
        <svg className="pi-opt-icon wrong" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
