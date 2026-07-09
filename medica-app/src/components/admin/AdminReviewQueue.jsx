import { useState } from 'react'
import { useBulkReviewActions, useReviewQueue } from '../../hooks/useAdminReview'

const STATUS_FILTERS = [
  { value: '',                    label: 'All' },
  { value: 'validated_generated', label: 'Pending' },
  { value: 'approved',            label: 'Approved' },
  { value: 'quarantined',         label: 'Quarantined' },
]

const SORT_MODES = [
  { value: 'priority', label: 'Highest Priority' },
  { value: 'newest',   label: 'Newest' },
  { value: 'score',    label: 'Best Score' },
  { value: 'usage',    label: 'Most Used' },
]

const PAGE_SIZE = 50

const REVIEW_FILTERS = [
  { value: '', label: 'All review states' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'validator_passed', label: 'Validator passed' },
  { value: 'source_checked', label: 'Source checked' },
  { value: 'expert_reviewed', label: 'Expert reviewed' },
  { value: 'changes_requested', label: 'Changes requested' },
]

const READY_FILTERS = [
  { value: '', label: 'Any readiness' },
  { value: 'false', label: 'Not commercial ready' },
  { value: 'true', label: 'Commercial ready' },
]

const STATUS_CLASS = {
  approved:           'adm-badge adm-badge-approved',
  quarantined:        'adm-badge adm-badge-quarantined',
  validated_generated:'adm-badge adm-badge-pending',
  legacy:             'adm-badge adm-badge-legacy',
}

const STATUS_LABEL = {
  approved:            'Approved',
  quarantined:         'Quarantined',
  validated_generated: 'Pending',
  legacy:              'Legacy',
}

const READINESS_REASON_LABELS = {
  not_student_visible_status: 'Not approved/restored',
  missing_source_refs: 'Missing source',
  medical_accuracy_not_pass: 'Medical accuracy not pass',
  item_writing_blocked: 'Item-writing issue',
  difficulty_calibration_blocked: 'Difficulty issue',
  hard_mode_needs_expert_review: 'Needs expert review',
  needs_source_or_expert_review: 'Needs source check',
}

function fmt(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score) {
  if (score == null) return 'var(--t3)'
  if (score >= 80)  return 'var(--green)'
  if (score >= 60)  return 'var(--orange)'
  return 'var(--red)'
}

function readinessReasonText(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return ''
  return reasons.map(reason => READINESS_REASON_LABELS[reason] || String(reason).replace(/_/g, ' ')).join(', ')
}

export default function AdminReviewQueue({ onSelectDetail }) {
  const [filterStatus, setFilterStatus] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  const [readyFilter,  setReadyFilter]  = useState('')
  const [sort,         setSort]         = useState('priority')
  const [page,         setPage]         = useState(1)
  const [selectedIds,  setSelectedIds]  = useState([])
  const [bulkMessage,  setBulkMessage]  = useState('')
  const { pending: bulkPending, error: bulkError, actBulk } = useBulkReviewActions()

  const { data, loading, error, refetch } = useReviewQueue({
    status: filterStatus || undefined,
    reviewStatus: reviewStatus || undefined,
    commercialReady: readyFilter === '' ? undefined : readyFilter === 'true',
    sort,
    page,
    limit: PAGE_SIZE,
  })

  const questions = data?.questions ?? []
  const total     = data?.total ?? 0
  const hasMore   = data?.hasMore ?? false
  const hasPrev   = page > 1
  const visibleIds = questions.map(q => q.externalId).filter(Boolean)
  const selectedVisibleIds = selectedIds.filter(id => visibleIds.includes(id))
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length

  const setFilterAndClear = (setter, val) => {
    setter(val)
    setPage(1)
    setSelectedIds([])
    setBulkMessage('')
  }

  const toggleSelected = (id) => {
    setBulkMessage('')
    setSelectedIds(ids => (
      ids.includes(id) ? ids.filter(existing => existing !== id) : [...ids, id]
    ))
  }

  const toggleVisibleSelection = () => {
    setBulkMessage('')
    setSelectedIds(ids => {
      const rest = ids.filter(id => !visibleIds.includes(id))
      return allVisibleSelected ? rest : [...rest, ...visibleIds]
    })
  }

  const handleBulkAction = async (status) => {
    setBulkMessage('')
    const result = await actBulk(selectedVisibleIds, status)
    setBulkMessage(`${result.succeeded.length} updated${result.failed.length ? `, ${result.failed.length} failed` : ''}.`)
    setSelectedIds([])
    refetch()
  }

  return (
    <div className="adm-page">
      <div className="adm-page-hdr">
        <div>
          <h1 className="adm-page-title">Review Queue</h1>
          <p className="adm-page-sub">
            {loading ? 'Loading...' : `${total.toLocaleString()} question${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button className="adm-btn-ghost adm-refresh" onClick={refetch} aria-label="Refresh">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 7a6 6 0 1 0 1.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M1 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>

      <div className="adm-toolbar">
        <div className="adm-filter-tabs" role="group" aria-label="Status filter">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              className={`adm-filter-tab${filterStatus === f.value ? ' active' : ''}`}
              onClick={() => setFilterAndClear(setFilterStatus, f.value)}
              aria-pressed={filterStatus === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="adm-sort-wrap">
          <label className="adm-sort-label" htmlFor="adm-review-state-select">Review</label>
          <select
            id="adm-review-state-select"
            className="adm-sort-select"
            value={reviewStatus}
            onChange={e => setFilterAndClear(setReviewStatus, e.target.value)}
          >
            {REVIEW_FILTERS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <label className="adm-sort-label" htmlFor="adm-ready-select">Readiness</label>
          <select
            id="adm-ready-select"
            className="adm-sort-select"
            value={readyFilter}
            onChange={e => setFilterAndClear(setReadyFilter, e.target.value)}
          >
            {READY_FILTERS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <label className="adm-sort-label" htmlFor="adm-sort-select">Sort</label>
          <select
            id="adm-sort-select"
            className="adm-sort-select"
            value={sort}
            onChange={e => setFilterAndClear(setSort, e.target.value)}
          >
            {SORT_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="adm-bulk-bar" aria-label="Bulk review actions">
        <span className="adm-bulk-count">{selectedVisibleIds.length} selected</span>
        <button
          className="adm-bulk-btn approve"
          disabled={bulkPending || selectedVisibleIds.length === 0}
          onClick={() => handleBulkAction('approved')}
        >
          Approve
        </button>
        <button
          className="adm-bulk-btn quarantine"
          disabled={bulkPending || selectedVisibleIds.length === 0}
          onClick={() => handleBulkAction('quarantined')}
        >
          Quarantine
        </button>
        <button
          className="adm-bulk-btn"
          disabled={bulkPending || selectedVisibleIds.length === 0}
          onClick={() => handleBulkAction('validated_generated')}
        >
          Restore
        </button>
        {bulkMessage && <span className="adm-bulk-ok" role="status">{bulkMessage}</span>}
        {bulkError && <span className="adm-bulk-error" role="alert">{bulkError.message}</span>}
      </div>

      {error && (
        <div className="adm-error" role="alert">
          Failed to load questions: {error.message}
        </div>
      )}

      {!error && (
        <div className="adm-table-wrap">
          <table className="adm-table" aria-label="Review queue">
            <thead>
              <tr>
                <th className="adm-th-select">
                  <input
                    type="checkbox"
                    aria-label="Select all visible questions"
                    checked={allVisibleSelected}
                    onChange={toggleVisibleSelection}
                    disabled={loading || visibleIds.length === 0}
                  />
                </th>
                <th>Status</th>
                <th>Subject</th>
                <th>System</th>
                <th>Difficulty</th>
                <th>Review</th>
                <th>Ready</th>
                <th>Score</th>
                <th>Created</th>
                <th>Last Used</th>
                <th className="adm-th-num">Usage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={12} className="adm-table-empty">Loading...</td>
                </tr>
              )}
              {!loading && questions.length === 0 && (
                <tr>
                  <td colSpan={12} className="adm-table-empty">No questions found.</td>
                </tr>
              )}
              {questions.map(q => (
                <tr key={q.externalId} className="adm-table-row">
                  <td className="adm-cell-select">
                    <input
                      type="checkbox"
                      aria-label={`Select question ${q.externalId}`}
                      checked={selectedIds.includes(q.externalId)}
                      onChange={() => toggleSelected(q.externalId)}
                    />
                  </td>
                  <td>
                    <span className={STATUS_CLASS[q.bankStatus] ?? 'adm-badge'}>
                      {STATUS_LABEL[q.bankStatus] ?? q.bankStatus}
                    </span>
                  </td>
                  <td className="adm-cell-text">{q.subject || '-'}</td>
                  <td className="adm-cell-text">{q.system || '-'}</td>
                  <td className="adm-cell-text">{q.difficulty || '-'}</td>
                  <td>
                    <span className="adm-review-state">
                      {String(q.reviewMetadata?.reviewStatus || 'unreviewed').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td>
                    <div className="adm-ready-cell">
                      <span className={`adm-ready-pill${q.commercialReady ? ' ready' : ''}`}>
                        {q.commercialReady ? 'Ready' : 'Not ready'}
                      </span>
                      {!q.commercialReady && readinessReasonText(q.readinessReasons) && (
                        <span className="adm-ready-reason">
                          {readinessReasonText(q.readinessReasons)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{ color: scoreColor(q.validationScore), fontVariantNumeric: 'tabular-nums' }}>
                      {q.validationScore != null ? `${q.validationScore}%` : '-'}
                    </span>
                  </td>
                  <td className="adm-cell-date">{fmt(q.createdAt)}</td>
                  <td className="adm-cell-date">{fmt(q.lastUsedAt)}</td>
                  <td className="adm-th-num adm-cell-num">{q.usageCount ?? 0}</td>
                  <td>
                    <button
                      className="adm-btn-view"
                      onClick={() => onSelectDetail(q.externalId)}
                      aria-label={`Review question ${q.externalId}`}
                    >
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="adm-pagination">
        <button
          className="adm-btn-page"
          onClick={() => { setSelectedIds([]); setBulkMessage(''); setPage(p => p - 1) }}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="adm-page-info">Page {page}</span>
        <button
          className="adm-btn-page"
          onClick={() => { setSelectedIds([]); setBulkMessage(''); setPage(p => p + 1) }}
          disabled={!hasMore}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  )
}
