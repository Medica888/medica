import { SUBJECTS } from '../../lib/quizTypes'

/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function SubjectSelector({ value, onChange }) {
  return (
    <div className="qb-field">
      <label className="qb-field-lbl" htmlFor="qb-subject">Subject</label>
      <div className="qb-select-wrap">
        <select
          id="qb-subject"
          className="qb-select"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {SUBJECTS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
