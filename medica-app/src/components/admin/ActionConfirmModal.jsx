const ACTION_LABELS = {
  approved:          { verb: 'Approve',    desc: 'Mark this question as approved for production use.' },
  quarantined:       { verb: 'Quarantine', desc: 'Remove this question from active use and flag for review.' },
  validated_generated: { verb: 'Restore', desc: 'Restore this question to pending review status.' },
}

export default function ActionConfirmModal({ action, onConfirm, onCancel, pending, rejectionError }) {
  const { verb, desc } = ACTION_LABELS[action] ?? { verb: action, desc: '' }

  return (
    <div className="adm-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="adm-modal-title">
      <div className="adm-modal">
        <div className="adm-modal-hdr">
          <h2 id="adm-modal-title" className="adm-modal-title">{verb} Question?</h2>
        </div>
        <div className="adm-modal-body">
          {rejectionError ? (
            <div className="adm-rejection">
              <div className="adm-rejection-title">Validation failed</div>
              {(rejectionError.data?.rejectionReasons ?? []).map((r, i) => (
                <div key={i} className="adm-rejection-item">{r}</div>
              ))}
            </div>
          ) : (
            <p className="adm-modal-desc">{desc}</p>
          )}
        </div>
        {!rejectionError && (
          <div className="adm-modal-ftr">
            <button className="adm-btn-ghost" onClick={onCancel} disabled={pending}>
              Cancel
            </button>
            <button
              className={`adm-btn-action adm-btn-${action}`}
              onClick={onConfirm}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? 'Working…' : verb}
            </button>
          </div>
        )}
        {rejectionError && (
          <div className="adm-modal-ftr">
            <button className="adm-btn-ghost" onClick={onCancel}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
