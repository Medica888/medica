import { useState } from 'react'
import { useReviewDetail, useReviewHistory, useReviewActions } from '../../hooks/useAdminReview'
import ActionConfirmModal from './ActionConfirmModal'

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E']

const STATUS_LABEL = {
  approved:            'Approved',
  quarantined:         'Quarantined',
  validated_generated: 'Pending Review',
  legacy:              'Legacy',
}

const STATUS_CLASS = {
  approved:            'adm-badge adm-badge-approved',
  quarantined:         'adm-badge adm-badge-quarantined',
  validated_generated: 'adm-badge adm-badge-pending',
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseOptions(body) {
  const raw = body?.options
  if (!Array.isArray(raw)) return []
  return raw.map((opt, i) => {
    const text = String(opt || '')
    // Strip leading 'A. ', 'B. ' etc if present
    return text.replace(/^[A-E]\.\s*/, '') || text
  })
}

export default function AdminReviewDetail({ questionId, onBack }) {
  const { data: detail, loading, error } = useReviewDetail(questionId)
  const { data: histData, loading: histLoading } = useReviewHistory(questionId)
  const { pending, error: actionError, act } = useReviewActions()

  const [pendingAction, setPendingAction] = useState(null) // 'approved' | 'quarantined' | 'validated_generated'
  const [rejectionError, setRejectionError] = useState(null)
  const [localStatus, setLocalStatus] = useState(null) // optimistic update after action

  const question = detail?.question
  const body = question?.body ?? {}
  const history = histData?.history ?? []

  const currentStatus = localStatus ?? question?.bankStatus

  const options = parseOptions(body)
  const correctIdx = typeof body.correct === 'number' ? body.correct : -1

  const handleActionClick = (action) => {
    setRejectionError(null)
    setPendingAction(action)
  }

  const handleConfirm = async () => {
    try {
      await act(questionId, pendingAction)
      setLocalStatus(pendingAction)
      setPendingAction(null)
    } catch (err) {
      setRejectionError(err)
    }
  }

  if (loading) {
    return (
      <div className="adm-page">
        <div className="adm-detail-loading">Loading question…</div>
      </div>
    )
  }

  if (error || !question) {
    return (
      <div className="adm-page">
        <button className="adm-btn-back" onClick={onBack}>← Back to Queue</button>
        <div className="adm-error" role="alert">
          {error ? `Failed to load: ${error.message}` : 'Question not found.'}
        </div>
      </div>
    )
  }

  return (
    <div className="adm-page">
      {pendingAction && (
        <ActionConfirmModal
          action={pendingAction}
          onConfirm={handleConfirm}
          onCancel={() => { setPendingAction(null); setRejectionError(null) }}
          pending={pending}
          rejectionError={rejectionError}
        />
      )}

      <div className="adm-detail-hdr">
        <button className="adm-btn-back" onClick={onBack}>← Back to Queue</button>
        <div className="adm-detail-meta-row">
          <span className={STATUS_CLASS[currentStatus] ?? 'adm-badge'}>
            {STATUS_LABEL[currentStatus] ?? currentStatus}
          </span>
          <span className="adm-detail-id" title={questionId}>
            {questionId?.slice(0, 32)}{questionId?.length > 32 ? '…' : ''}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="adm-action-bar">
        {actionError && (
          <span className="adm-action-err" role="alert">{actionError.message}</span>
        )}
        {currentStatus !== 'approved' && (
          <button
            className="adm-btn-approve"
            onClick={() => handleActionClick('approved')}
            disabled={pending}
          >
            Approve
          </button>
        )}
        {currentStatus !== 'quarantined' && (
          <button
            className="adm-btn-quarantine"
            onClick={() => handleActionClick('quarantined')}
            disabled={pending}
          >
            Quarantine
          </button>
        )}
        {(currentStatus === 'approved' || currentStatus === 'quarantined') && (
          <button
            className="adm-btn-restore"
            onClick={() => handleActionClick('validated_generated')}
            disabled={pending}
          >
            Restore to Pending
          </button>
        )}
      </div>

      <div className="adm-detail-cols">
        {/* Left: Question Content */}
        <div className="adm-detail-main">
          <div className="adm-section">
            <div className="adm-section-label">Clinical Stem</div>
            <div className="adm-stem">{body.stem || '(no stem)'}</div>
          </div>

          {options.length > 0 && (
            <div className="adm-section">
              <div className="adm-section-label">Answer Choices</div>
              <div className="adm-options">
                {options.map((opt, i) => (
                  <div
                    key={i}
                    className={`adm-option${i === correctIdx ? ' adm-option-correct' : ''}`}
                  >
                    <span className="adm-option-letter">{OPTION_LETTERS[i] ?? i}</span>
                    <span className="adm-option-text">{opt}</span>
                    {i === correctIdx && <span className="adm-option-check" aria-label="Correct answer">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {body.explanation && (
            <div className="adm-section">
              <div className="adm-section-label">Explanation</div>
              <div className="adm-text">{body.explanation}</div>
            </div>
          )}

          {body.learningObjective && (
            <div className="adm-section">
              <div className="adm-section-label">Learning Objective</div>
              <div className="adm-text">{body.learningObjective}</div>
            </div>
          )}

          {body.pearl && (
            <div className="adm-section">
              <div className="adm-section-label">Pearl</div>
              <div className="adm-text adm-text-highlight">{body.pearl}</div>
            </div>
          )}

          {(body.memory_anchor ?? body.memoryAnchor) && (
            <div className="adm-section">
              <div className="adm-section-label">Memory Anchor</div>
              <div className="adm-text adm-text-highlight">
                {body.memory_anchor ?? body.memoryAnchor}
              </div>
            </div>
          )}
        </div>

        {/* Right: Metadata + Validation + History */}
        <div className="adm-detail-side">
          <div className="adm-section">
            <div className="adm-section-label">Metadata</div>
            <dl className="adm-dl">
              <dt>Subject</dt>       <dd>{question.subject || '—'}</dd>
              <dt>System</dt>        <dd>{question.system || '—'}</dd>
              <dt>Difficulty</dt>    <dd>{question.difficulty || '—'}</dd>
              <dt>Mode</dt>          <dd>{question.mode || '—'}</dd>
              <dt>Usage Count</dt>   <dd>{question.usageCount ?? 0}</dd>
              <dt>Last Used</dt>     <dd>{fmtDate(question.lastUsedAt)}</dd>
              <dt>Created</dt>       <dd>{fmtDate(question.createdAt)}</dd>
              <dt>Validated At</dt>  <dd>{fmtDate(question.validatedAt)}</dd>
            </dl>
          </div>

          <div className="adm-section">
            <div className="adm-section-label">Validation</div>
            <dl className="adm-dl">
              <dt>Status</dt>
              <dd>
                <span className={`adm-vscore${body.validationStatus === 'pass' ? ' pass' : body.validationStatus === 'repaired' ? ' warn' : ' fail'}`}>
                  {body.validationStatus ?? '—'}
                </span>
              </dd>
              <dt>Score</dt>
              <dd>{question.validationScore != null ? `${question.validationScore}%` : '—'}</dd>
              <dt>Validator</dt>
              <dd className="adm-dd-muted">{body.validationVersion ?? '—'}</dd>
            </dl>
          </div>

          {/* Audit History */}
          <div className="adm-section">
            <div className="adm-section-label">Audit History</div>
            {histLoading && <div className="adm-hist-empty">Loading…</div>}
            {!histLoading && history.length === 0 && (
              <div className="adm-hist-empty">No history recorded.</div>
            )}
            {history.map((entry, i) => (
              <div key={i} className="adm-hist-entry">
                <div className="adm-hist-action">{entry.action}</div>
                <div className="adm-hist-status">
                  {entry.previousStatus && <span className="adm-hist-prev">{entry.previousStatus}</span>}
                  {entry.previousStatus && <span className="adm-hist-arrow"> → </span>}
                  <span className="adm-hist-new">{entry.newStatus}</span>
                </div>
                <div className="adm-hist-meta">
                  {entry.userId && <span>{entry.userId.slice(0, 8)}…</span>}
                  {entry.createdAt && <span> · {fmt(entry.createdAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
