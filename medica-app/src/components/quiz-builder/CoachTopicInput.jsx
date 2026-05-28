/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function CoachTopicInput({ value, onChange }) {
  return (
    <div className="qb-field qb-field-coach">
      <label className="qb-field-lbl" htmlFor="qb-coach-topic">
        Specific Topic to Coach Me On
        <span className="qb-field-lbl-opt">optional</span>
      </label>
      <input
        id="qb-coach-topic"
        type="text"
        className="qb-input"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder='e.g. "Loop diuretics", "Heart failure pathophysiology", "Brachial plexus lesions"'
      />
      <div className="qb-field-sub">
        Write one concrete topic you want the coach to focus on.
      </div>
    </div>
  )
}
