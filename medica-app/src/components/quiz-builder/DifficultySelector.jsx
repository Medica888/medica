import { DIFFICULTIES } from '../../lib/quizTypes'

/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function DifficultySelector({ value, onChange }) {
  const selected = DIFFICULTIES.find(d => d.id === value)

  return (
    <div className="qb-field">
      <div className="qb-field-lbl">Difficulty</div>
      <div className="qb-diff-hint-top">Choose the level of reasoning complexity.</div>
      <div className="qb-diffs">
        {DIFFICULTIES.map(d => (
          <button
            key={d.id}
            type="button"
            className={`qb-diff${value === d.id ? ' active' : ''}`}
            onClick={() => onChange(d.id)}
            aria-pressed={value === d.id}
          >
            {d.id}
          </button>
        ))}
      </div>
      {selected && (
        <div className="qb-diff-desc">{selected.desc}</div>
      )}
    </div>
  )
}
