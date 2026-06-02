import { SYSTEMS, getSystemLabel } from '../../lib/quizTypes'

/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function SystemSelector({ value, onChange }) {
  return (
    <div className="qb-field">
      <div className="qb-field-lbl">Organ System</div>
      <div className="qb-pills" role="group" aria-label="Organ system">
        {SYSTEMS.map(s => (
          <button
            key={s}
            type="button"
            className={`qb-pill${value === s ? ' active' : ''}`}
            onClick={() => onChange(s)}
            aria-pressed={value === s}
          >
            {getSystemLabel(s)}
          </button>
        ))}
      </div>
    </div>
  )
}
