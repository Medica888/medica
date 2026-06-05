/**
 * Exam submission confirmation modal.
 * Shows answered/marked/unanswered counts before final submit.
 * @param {{ isOpen: boolean, onConfirm: () => void, onCancel: () => void, answered: number, total: number, markedCount: number }} props
 */
export default function SubmitConfirmModal({ isOpen, onConfirm, onCancel, answered, total, markedCount }) {
  if (!isOpen) return null

  const unanswered = total - answered
  const isComplete = unanswered === 0

  return (
    <div
      className="submit-confirm-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Submit exam confirmation"
    >
      <div className="submit-confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="submit-confirm-hdr">Submit Exam</div>

        <div className="submit-confirm-stats">
          <div className="scs-row">
            <span>Answered</span>
            <span>{answered} / {total}</span>
          </div>
          <div className="scs-row">
            <span>Marked for review</span>
            <span>{markedCount}</span>
          </div>
          {!isComplete && (
            <div className="scs-row warn">
              <span>Unanswered</span>
              <span>{unanswered}</span>
            </div>
          )}
        </div>

        <div className="submit-confirm-msg">
          {isComplete
            ? 'All questions answered. Your exam is ready to submit.'
            : `${unanswered} question${unanswered !== 1 ? 's' : ''} left unanswered. You can go back to answer them first.`}
        </div>

        <div className="submit-confirm-actions">
          <button type="button" className="sca-cancel" onClick={onCancel}>
            Go Back
          </button>
          <button
            type="button"
            className="sca-confirm"
            onClick={onConfirm}
            aria-label="Confirm and submit exam"
          >
            Confirm Submit
          </button>
        </div>
      </div>
    </div>
  )
}
