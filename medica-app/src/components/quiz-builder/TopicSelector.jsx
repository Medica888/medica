/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function TopicSelector({ value, onChange }) {
  return (
    <div className="qb-field">
      <label className="qb-field-lbl" htmlFor="qb-topic">
        Topic
        <span className="qb-field-lbl-opt">optional</span>
      </label>
      <input
        id="qb-topic"
        type="text"
        className="qb-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. Heart failure, Stroke syndromes, Acid-base disorders"
      />
      <div className="qb-field-sub">
        {value
          ? 'Medica will keep the session focused on this concept.'
          : 'Leave blank to let Medica choose a high-yield topic automatically.'}
      </div>
    </div>
  )
}
