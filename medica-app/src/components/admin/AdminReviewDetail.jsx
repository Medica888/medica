import { useEffect, useState } from 'react'
import {
  useReviewActions,
  useReviewDetail,
  useReviewHistory,
  useReviewMetadataActions,
} from '../../hooks/useAdminReview'
import ActionConfirmModal from './ActionConfirmModal'
import { ANSWER_LETTERS, normalizeAnswerLetter } from '../../lib/answerNormalize'

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

const REVIEW_STATUS_OPTIONS = [
  ['unreviewed', 'Unreviewed'],
  ['validator_passed', 'Validator passed'],
  ['source_checked', 'Source checked'],
  ['expert_reviewed', 'Expert reviewed'],
  ['changes_requested', 'Changes requested'],
  ['rejected', 'Rejected'],
  ['quarantined', 'Quarantined'],
  ['retired', 'Retired'],
]

const RUBRIC_OPTIONS = [
  ['unknown', 'Unknown'],
  ['pass', 'Pass'],
  ['minor_issue', 'Minor issue'],
  ['major_issue', 'Major issue'],
  ['fail', 'Fail'],
]

const READINESS_REASON_LABELS = {
  not_student_visible_status: 'Question must be approved or restored.',
  missing_source_refs: 'Add at least one source reference.',
  medical_accuracy_not_pass: 'Medical accuracy must be marked pass.',
  item_writing_blocked: 'Resolve major/failing item-writing issues.',
  difficulty_calibration_blocked: 'Resolve major/failing difficulty-calibration issues.',
  hard_mode_needs_expert_review: 'NBME/UWorld-style content requires expert review.',
  needs_source_or_expert_review: 'Mark as source checked or expert reviewed.',
}

function fmt(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function fmtDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function parseOptions(body) {
  const raw = body?.options
  if (!Array.isArray(raw)) return []
  return raw.flatMap((opt, index) => {
    if (opt === null || opt === undefined) return []
    if (typeof opt === 'object') {
      const letter = normalizeAnswerLetter(opt.letter ?? opt.id ?? index)
      if (!letter) return []
      return [{ letter, text: String(opt.text ?? opt.label ?? '') }]
    }
    const text = String(opt || '')
    const matched = text.match(/^([A-La-l])[.)]\s*(.*)$/)
    if (matched) return [{ letter: matched[1].toUpperCase(), text: matched[2] || text }]
    const letter = ANSWER_LETTERS[index]
    return letter ? [{ letter, text }] : []
  })
}

function splitSourceRefs(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map(ref => ref.trim())
    .filter(Boolean)
}

function readinessReasonLabels(reasons) {
  if (!Array.isArray(reasons)) return []
  return reasons.map(reason => READINESS_REASON_LABELS[reason] || String(reason).replace(/_/g, ' '))
}

export default function AdminReviewDetail({ questionId, onBack }) {
  const { data: detail, loading, error } = useReviewDetail(questionId)
  const { data: histData, loading: histLoading, refetch: refetchHistory } = useReviewHistory(questionId)
  const { pending, error: actionError, act } = useReviewActions()
  const {
    pending: metadataPending,
    error: metadataError,
    update: updateReviewMetadata,
  } = useReviewMetadataActions()

  const [pendingAction, setPendingAction] = useState(null) // 'approved' | 'quarantined' | 'validated_generated'
  const [rejectionError, setRejectionError] = useState(null)
  const [localStatus, setLocalStatus] = useState(null) // optimistic update after action
  const [localReviewMetadata, setLocalReviewMetadata] = useState(null)
  const [localCommercialReady, setLocalCommercialReady] = useState(null)
  const [localReadinessReasons, setLocalReadinessReasons] = useState(null)
  const [metadataSaved, setMetadataSaved] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalReviewMetadata(null)
    setLocalCommercialReady(null)
    setLocalReadinessReasons(null)
    setMetadataSaved(false)
  }, [questionId])

  const question = detail?.question
  const body = question?.body ?? {}
  const history = histData?.history ?? []

  const currentStatus = localStatus ?? question?.bankStatus
  const reviewMetadata = localReviewMetadata ?? question?.reviewMetadata ?? body.reviewMetadata ?? {}
  const commercialReady = localCommercialReady ?? (question?.commercialReady === true)
  const readinessReasons = localCommercialReady === true
    ? []
    : readinessReasonLabels(localReadinessReasons ?? question?.readinessReasons)

  const options = parseOptions(body)
  const correctLetter = normalizeAnswerLetter(body.correct ?? body.correctAnswer ?? body.correct_answer)

  const handleActionClick = (action) => {
    setRejectionError(null)
    setPendingAction(action)
  }

  const handleConfirm = async () => {
    try {
      await act(questionId, pendingAction)
      setLocalStatus(pendingAction)
      setPendingAction(null)
      refetchHistory()
    } catch (err) {
      setRejectionError(err)
    }
  }

  const handleMetadataSubmit = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setMetadataSaved(false)
    try {
      const result = await updateReviewMetadata(questionId, {
        reviewStatus: form.get('reviewStatus'),
        sourceRefs: splitSourceRefs(form.get('sourceRefs')),
        medicalAccuracyStatus: form.get('medicalAccuracyStatus'),
        itemWritingStatus: form.get('itemWritingStatus'),
        difficultyCalibrationStatus: form.get('difficultyCalibrationStatus'),
        reviewNotes: String(form.get('reviewNotes') || '').trim() || null,
      })
      setLocalReviewMetadata(result?.question?.reviewMetadata ?? null)
      setLocalCommercialReady(Boolean(result?.question?.commercialReady))
      setLocalReadinessReasons(Array.isArray(result?.question?.readinessReasons) ? result.question.readinessReasons : null)
      setMetadataSaved(true)
      refetchHistory()
    } catch {
      // Error state is exposed by useReviewMetadataActions and rendered above the form.
    }
  }

  if (loading) {
    return (
      <div className="adm-page">
        <div className="adm-detail-loading">Loading question...</div>
      </div>
    )
  }

  if (error || !question) {
    return (
      <div className="adm-page">
        <button className="adm-btn-back" onClick={onBack}>Back to Queue</button>
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
        <button className="adm-btn-back" onClick={onBack}>Back to Queue</button>
        <div className="adm-detail-meta-row">
          <span className={STATUS_CLASS[currentStatus] ?? 'adm-badge'}>
            {STATUS_LABEL[currentStatus] ?? currentStatus}
          </span>
          <span className="adm-detail-id" title={questionId}>
            {questionId?.slice(0, 32)}{questionId?.length > 32 ? '...' : ''}
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
                    key={opt.letter || i}
                    className={`adm-option${opt.letter === correctLetter ? ' adm-option-correct' : ''}`}
                  >
                    <span className="adm-option-letter">{opt.letter}</span>
                    <span className="adm-option-text">{opt.text}</span>
                    {opt.letter === correctLetter && <span className="adm-option-check" aria-label="Correct answer">Correct</span>}
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
              <dt>Subject</dt>       <dd>{question.subject || '-'}</dd>
              <dt>System</dt>        <dd>{question.system || '-'}</dd>
              <dt>Difficulty</dt>    <dd>{question.difficulty || '-'}</dd>
              <dt>Mode</dt>          <dd>{question.mode || '-'}</dd>
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
                  {body.validationStatus ?? '-'}
                </span>
              </dd>
              <dt>Score</dt>
              <dd>{question.validationScore != null ? `${question.validationScore}%` : '-'}</dd>
              <dt>Validator</dt>
              <dd className="adm-dd-muted">{body.validationVersion ?? '-'}</dd>
            </dl>
          </div>

          <div className="adm-section adm-review-meta">
            <div className="adm-section-label">Reviewed Content</div>
            <div className={`adm-ready-card${commercialReady ? ' ready' : ''}`}>
              <span>{commercialReady ? 'Commercial ready' : 'Not commercial ready'}</span>
              <small>
                Requires sources, medical accuracy pass, and the correct review level.
              </small>
              {!commercialReady && readinessReasons.length > 0 && (
                <ul className="adm-ready-reasons">
                  {readinessReasons.map(reason => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
            </div>
            {metadataError && (
              <div className="adm-action-err" role="alert">{metadataError.message}</div>
            )}
            {metadataSaved && (
              <div className="adm-save-ok" role="status">Review metadata saved.</div>
            )}
            <form className="adm-review-form" onSubmit={handleMetadataSubmit}>
              <label>
                Review status
                <select name="reviewStatus" defaultValue={reviewMetadata.reviewStatus || 'unreviewed'}>
                  {REVIEW_STATUS_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Medical accuracy
                <select name="medicalAccuracyStatus" defaultValue={reviewMetadata.medicalAccuracyStatus || 'unknown'}>
                  {RUBRIC_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Item writing
                <select name="itemWritingStatus" defaultValue={reviewMetadata.itemWritingStatus || 'unknown'}>
                  {RUBRIC_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Difficulty fit
                <select name="difficultyCalibrationStatus" defaultValue={reviewMetadata.difficultyCalibrationStatus || 'unknown'}>
                  {RUBRIC_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Source references
                <textarea
                  name="sourceRefs"
                  defaultValue={Array.isArray(reviewMetadata.sourceRefs) ? reviewMetadata.sourceRefs.join('\n') : ''}
                  rows={3}
                  placeholder="USMLE Content Outline, Pathoma..."
                />
              </label>
              <label>
                Review notes
                <textarea
                  name="reviewNotes"
                  defaultValue={reviewMetadata.reviewNotes || ''}
                  rows={3}
                  placeholder="What changed, what was checked..."
                />
              </label>
              <button className="adm-btn-review-save" type="submit" disabled={metadataPending}>
                {metadataPending ? 'Saving...' : 'Save review metadata'}
              </button>
            </form>
          </div>

          {/* Audit History */}
          <div className="adm-section">
            <div className="adm-section-label">Audit History</div>
            {histLoading && <div className="adm-hist-empty">Loading...</div>}
            {!histLoading && history.length === 0 && (
              <div className="adm-hist-empty">No history recorded.</div>
            )}
            {history.map((entry, i) => (
              <div key={i} className="adm-hist-entry">
                <div className="adm-hist-action">{entry.action}</div>
                <div className="adm-hist-status">
                  {entry.previousStatus && <span className="adm-hist-prev">{entry.previousStatus}</span>}
                  {entry.previousStatus && <span className="adm-hist-arrow"> to </span>}
                  <span className="adm-hist-new">{entry.newStatus}</span>
                </div>
                <div className="adm-hist-meta">
                  {entry.userId && <span>{entry.userId.slice(0, 8)}...</span>}
                  {entry.createdAt && <span> - {fmt(entry.createdAt)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
