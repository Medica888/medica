/** @param {{ value: string, onChange: (v: string) => void }} props */
export default function ClinicalFocusInput({ value, onChange }) {
  return (
    <div className="qb-field">
      <label className="qb-field-lbl" htmlFor="qb-clinical-focus">
        Clinical Themes / Custom Focus
        <span className="qb-field-lbl-opt">optional</span>
      </label>
      <textarea
        id="qb-clinical-focus"
        className="qb-textarea"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. trauma, surgery complications, renal physiology, heart failure drugs, acid-base, stroke localization"
        rows={3}
      />
      <div className="qb-field-sub">
        Add a broader clinical context or theme for the quiz.
      </div>
    </div>
  )
}
