import { MODES } from '../../lib/quizTypes'

const MODE_ICONS = {
  exam: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5.2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6.5 4V6.5L8.3 8.3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  ),
  practice: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2.5 4.5h8M2.5 6.5h8M2.5 8.5h5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  ),
  coach: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M6.5 1.8L7.9 4.7L11 5.2L8.75 7.4L9.3 10.5L6.5 9L3.7 10.5L4.25 7.4L2 5.2L5.1 4.7L6.5 1.8Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  ),
}

/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function ModeSelector({ value, onChange }) {
  const selected = MODES.find(m => m.id === value)

  return (
    <div className="qb-field">
      <div className="qb-field-lbl">Mode</div>
      <div className="qb-modes" role="group" aria-label="Quiz mode">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`qb-mode${value === m.id ? ' active' : ''}`}
            onClick={() => onChange(m.id)}
            aria-pressed={value === m.id}
          >
            <span className="qb-mode-icon">{MODE_ICONS[m.id]}</span>
            {m.label}
          </button>
        ))}
      </div>
      {value === 'coach' ? (
        <div className="qb-mode-coach-strip">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6.5 4.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            <path d="M6.5 6.2v2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Coach Mode includes deep explanations, weak spot diagnosis, notes, references, and flashcards.
        </div>
      ) : (
        selected && <div className="qb-mode-hint">{selected.desc}</div>
      )}
    </div>
  )
}
