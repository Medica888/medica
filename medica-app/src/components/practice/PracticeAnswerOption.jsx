/**
 * @param {{
 *   option: import('../../lib/quizTypes').QuizOption
 *   state: 'default' | 'correct' | 'wrong' | 'neutral'
 *   disabled: boolean
 *   onClick: () => void
 *   eliminated?: boolean
 *   onToggleEliminate?: () => void
 * }} props
 */
export default function PracticeAnswerOption({ option, state, disabled, onClick, eliminated = false, onToggleEliminate }) {
  const canEliminate = !!onToggleEliminate && !disabled && state !== 'selected'

  return (
    <div className="pi-option-row">
      <button
        type="button"
        className={`pi-option${state !== 'default' ? ` ${state}` : ''}${eliminated ? ' eliminated' : ''}`}
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
      {onToggleEliminate && (
        <button
          type="button"
          className={`pi-opt-cross${eliminated ? ' active' : ''}`}
          onClick={onToggleEliminate}
          disabled={!canEliminate}
          aria-pressed={eliminated}
          aria-label={`${eliminated ? 'Restore' : 'Cross out'} choice ${option.letter}`}
          title={eliminated ? 'Restore option' : 'Cross out option'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2 7H12M4 4.5C4 3.4 5.3 2.5 7 2.5S10 3.4 10 4.5M4 9.5C4 10.6 5.3 11.5 7 11.5S10 10.6 10 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
