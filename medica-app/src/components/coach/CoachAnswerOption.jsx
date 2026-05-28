/**
 * @param {{
 *   option: { letter: string, text: string }
 *   state: 'default' | 'correct' | 'wrong' | 'neutral'
 *   onClick: () => void
 *   disabled: boolean
 * }} props
 */
export default function CoachAnswerOption({ option, state, onClick, disabled }) {
  return (
    <button
      type="button"
      className={`ci-option ci-option--${state}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={`Option ${option.letter}: ${option.text}`}
      aria-pressed={state === 'selected'}
    >
      <span className="ci-opt-letter">{option.letter}</span>
      <span className="ci-opt-text">{option.text}</span>
      {state === 'correct' && (
        <span className="ci-opt-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" fill="var(--green)" opacity=".15" />
            <path d="M4.5 8L6.5 10L11.5 5.5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
      {state === 'wrong' && (
        <span className="ci-opt-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" fill="var(--red)" opacity=".15" />
            <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
      )}
    </button>
  )
}
