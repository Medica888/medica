import { useState } from 'react'
import { useReviewQueue } from '../../hooks/useAdminReview'

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

export default function AdminReviewQueue({ onSelectDetail }) {
  const [filterStatus, setFilterStatus] = useState('')
  const [sort,         setSort]         = useState('priority')
  const [page,         setPage]         = useState(1)

  const { data, loading, error, refetch } = useReviewQueue({
    status: filterStatus || undefined,
    sort,
    page,
    limit: PAGE_SIZE,
  })

  const handleFilter = (val) => { setFilterStatus(val); setPage(1) }
  const handleSort   = (val) => { setSort(val);         setPage(1) }

  const questions = data?.questions ?? []
  const total     = data?.total ?? 0
  const hasMore   = data?.hasMore ?? false
  const hasPrev   = page > 1

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
              onClick={() => handleFilter(f.value)}
              aria-pressed={filterStatus === f.value}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="adm-sort-wrap">
          <label className="adm-sort-label" htmlFor="adm-sort-select">Sort</label>
          <select
            id="adm-sort-select"
            className="adm-sort-select"
            value={sort}
            onChange={e => handleSort(e.target.value)}
          >
            {SORT_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
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
                <th>Status</th>
                <th>Subject</th>
                <th>System</th>
                <th>Difficulty</th>
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
                  <td colSpan={9} className="adm-table-empty">Loading...</td>
                </tr>
              )}
              {!loading && questions.length === 0 && (
                <tr>
                  <td colSpan={9} className="adm-table-empty">No questions found.</td>
                </tr>
              )}
              {questions.map(q => (
                <tr key={q.externalId} className="adm-table-row">
                  <td>
                    <span className={STATUS_CLASS[q.bankStatus] ?? 'adm-badge'}>
                      {STATUS_LABEL[q.bankStatus] ?? q.bankStatus}
                    </span>
                  </td>
                  <td className="adm-cell-text">{q.subject || '-'}</td>
                  <td className="adm-cell-text">{q.system || '-'}</td>
                  <td className="adm-cell-text">{q.difficulty || '-'}</td>
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
          onClick={() => setPage(p => p - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span className="adm-page-info">Page {page}</span>
        <button
          className="adm-btn-page"
          onClick={() => setPage(p => p + 1)}
          disabled={!hasMore}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </div>
  )
}
