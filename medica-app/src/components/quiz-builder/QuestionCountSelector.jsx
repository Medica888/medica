import { QUESTION_COUNTS } from '../../lib/quizTypes'

/** @param {{ value: number, onChange: (v: number) => void, mode: string }} props */
export default function QuestionCountSelector({ value, onChange, mode }) {
  const timed   = mode === 'exam'
  const isCoach = mode === 'coach'

  return (
    <div className="qb-field">
      <div className="qb-field-lbl">Questions</div>
      <div className="qb-count-hint-top">
        {isCoach
          ? 'Smaller sets work best for deep review.'
          : 'Choose the size of your quiz block.'}
      </div>
      <div className="qb-counts">
        {QUESTION_COUNTS.map(n => (
          <button
            key={n}
            type="button"
            className={`qb-count${value === n ? ' active' : ''}`}
            onClick={() => onChange(n)}
            aria-pressed={value === n}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="qb-time-hint">
        <svg className="qb-time-hint-ico" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        {timed ? `${value} questions · ${value} min` : 'No time limit'}
      </div>
    </div>
  )
}
