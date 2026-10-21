import { useState } from 'react'

const STATUS_CHOICES = [
  { value: 'source_checked',  label: 'Source checked' },
  { value: 'expert_reviewed', label: 'Expert reviewed' },
]

/**
 * Applies one review decision to every selected question. Marking content reviewed makes it
 * student-visible, so the reviewer must cite a source and explicitly attest to the check.
 *
 * @param {{
 *   selectedCount: number
 *   hardCount: number
 *   pending: boolean
 *   onSubmit: (metadata: { reviewStatus: string, sourceRefs: string[], reviewNotes: string|null }) => void
 *   onCancel: () => void
 * }} props
 */
export default function BulkReviewPanel({ selectedCount, hardCount, pending, onSubmit, onCancel }) {
  const [reviewStatus, setReviewStatus] = useState('source_checked')
  const [sources, setSources]           = useState('')
  const [notes, setNotes]               = useState('')
  const [attested, setAttested]         = useState(false)

  const sourceRefs = sources.split('\n').map(line => line.trim()).filter(Boolean)
  const needsExpert = hardCount > 0 && reviewStatus !== 'expert_reviewed'
  const canSubmit = !pending && sourceRefs.length > 0 && attested && !needsExpert

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit({ reviewStatus, sourceRefs, reviewNotes: notes.trim() || null })
  }

  return (
    <form className="adm-bulk-review" aria-label="Mark selected questions reviewed" onSubmit={handleSubmit}>
      <div className="adm-bulk-review-grid">
        <label>
          Review status
          <select value={reviewStatus} onChange={e => setReviewStatus(e.target.value)}>
            {STATUS_CHOICES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>
          Source references (one per line)
          <textarea rows={3} value={sources} onChange={e => setSources(e.target.value)} />
        </label>
        <label>
          Notes (optional)
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} />
        </label>
      </div>

      {needsExpert && (
        <p className="adm-bulk-error" role="alert">
          {hardCount} selected question{hardCount === 1 ? ' is' : 's are'} NBME Difficult or UWorld Challenge and can only be marked Expert reviewed.
        </p>
      )}

      <label className="adm-bulk-attest">
        <input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} />
        I checked the medical content of these {selectedCount} questions against the cited source.
      </label>

      <div className="adm-bulk-review-actions">
        <button type="submit" className="adm-bulk-btn approve" disabled={!canSubmit}>
          Mark {selectedCount} reviewed
        </button>
        <button type="button" className="adm-bulk-btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
