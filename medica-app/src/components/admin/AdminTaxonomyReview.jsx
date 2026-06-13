import { Fragment, useState, useMemo } from 'react'
import { useTaxonomyCandidates, useTaxonomyCandidateActions } from '../../hooks/useTaxonomyCandidates'

const STATUS_FILTERS = [
  { value: 'pending',            label: 'Pending' },
  { value: '',                   label: 'All' },
  { value: 'approved_canonical', label: 'Approved' },
  { value: 'mapped_alias',       label: 'Mapped' },
  { value: 'rejected',           label: 'Rejected' },
]

const TYPE_FILTERS = [
  { value: '',        label: 'All' },
  { value: 'topic',   label: 'Topic' },
  { value: 'concept', label: 'Concept' },
]

const STATUS_BADGE = {
  pending:            'adm-badge adm-badge-pending',
  approved_canonical: 'adm-badge adm-badge-approved',
  mapped_alias:       'adm-badge adm-badge-approved',
  rejected:           'adm-badge adm-badge-quarantined',
}

const STATUS_LABEL = {
  pending:            'Pending',
  approved_canonical: 'Canonical',
  mapped_alias:       'Mapped',
  rejected:           'Rejected',
}

const PAGE_SIZE = 100

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminTaxonomyReview() {
  const [filterStatus, setFilterStatus] = useState('pending')
  const [filterType,   setFilterType]   = useState('')
  const [search,       setSearch]       = useState('')
  const [page,         setPage]         = useState(1)

  const [expandedId,   setExpandedId]   = useState(null)
  const [actionMode,   setActionMode]   = useState(null)
  const [mapTarget,    setMapTarget]    = useState('')
  const [noteText,     setNoteText]     = useState('')
  const [actionError,  setActionError]  = useState(null)

  const [localUpdates, setLocalUpdates] = useState({})
  const [successId,    setSuccessId]    = useState(null)

  const { data, loading, error, refetch } = useTaxonomyCandidates({
    status: filterStatus || undefined,
    page,
    limit: PAGE_SIZE,
  })
  const { pending: saving, act } = useTaxonomyCandidateActions()

  const rawCandidates = data?.candidates ?? []

  const candidates = useMemo(() => {
    let list = rawCandidates.map(c => localUpdates[c.id] ? { ...c, ...localUpdates[c.id] } : c)
    if (filterType) list = list.filter(c => c.type === filterType)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        c.rawLabel.toLowerCase().includes(q) ||
        (c.normalizedGuess || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [rawCandidates, localUpdates, filterType, search])

  const hasMore = rawCandidates.length >= PAGE_SIZE
  const hasPrev = page > 1

  const flashSuccess = (id) => {
    setSuccessId(id)
    setTimeout(() => setSuccessId(curr => curr === id ? null : curr), 2000)
  }

  const closeExpanded = () => {
    setExpandedId(null)
    setActionMode(null)
    setMapTarget('')
    setNoteText('')
    setActionError(null)
  }

  const applyAction = async (candidate, status, opts = {}) => {
    setActionError(null)
    try {
      const { candidate: updated } = await act(candidate.id, status, opts)
      setLocalUpdates(prev => ({ ...prev, [candidate.id]: updated }))
      flashSuccess(candidate.id)
      closeExpanded()
    } catch (err) {
      setActionError(err?.message || 'Action failed')
    }
  }

  const handleApprove = (c) => applyAction(c, 'approved_canonical')
  const handleReject  = (c) => applyAction(c, 'rejected')

  const handleMapOpen = (c) => {
    if (expandedId === c.id && actionMode === 'map') { closeExpanded(); return }
    setExpandedId(c.id)
    setActionMode('map')
    setMapTarget(c.metadata?.mappedTo ?? '')
    setNoteText('')
    setActionError(null)
  }

  const handleNoteOpen = (c) => {
    if (expandedId === c.id && actionMode === 'note') { closeExpanded(); return }
    setExpandedId(c.id)
    setActionMode('note')
    setNoteText(c.metadata?.note ?? '')
    setMapTarget('')
    setActionError(null)
  }

  const handleMapConfirm = (c) => {
    if (!mapTarget.trim()) return
    applyAction(c, 'mapped_alias', { mappedTo: mapTarget.trim() })
  }

  const handleNoteConfirm = (c) => {
    applyAction(c, c.status, { note: noteText })
  }

  const handleFilterStatus = (val) => { setFilterStatus(val); setPage(1); closeExpanded() }
  const handleFilterType   = (val) => { setFilterType(val); closeExpanded() }

  const count      = rawCandidates.length
  const countLabel = data ? (hasMore ? `${count}+` : String(count)) : null

  return (
    <div className="adm-page">
      <div className="adm-page-hdr">
        <div>
          <h1 className="adm-page-title">Taxonomy Candidates</h1>
          <p className="adm-page-sub">
            {loading
              ? 'Loading…'
              : countLabel !== null
                ? `${countLabel} candidate${count !== 1 ? 's' : ''} — Page ${page}`
                : ''}
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
              onClick={() => handleFilterStatus(f.value)}
              aria-pressed={filterStatus === f.value}
            >{f.label}</button>
          ))}
        </div>
        <div className="adm-filter-tabs" role="group" aria-label="Type filter">
          {TYPE_FILTERS.map(t => (
            <button
              key={t.value}
              className={`adm-filter-tab${filterType === t.value ? ' active' : ''}`}
              onClick={() => handleFilterType(t.value)}
              aria-pressed={filterType === t.value}
            >{t.label}</button>
          ))}
        </div>
        <div className="adm-sort-wrap">
          <label className="adm-sort-label" htmlFor="tc-search">Search</label>
          <input
            id="tc-search"
            className="adm-tc-search"
            type="search"
            placeholder="Filter by label…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search candidates by label"
          />
        </div>
      </div>

      {error && (
        <div className="adm-error" role="alert">
          Failed to load candidates: {error.message}
        </div>
      )}

      {!error && (
        <div className="adm-table-wrap">
          <table className="adm-table" aria-label="Taxonomy candidates">
            <thead>
              <tr>
                <th>Status</th>
                <th>Type</th>
                <th>Raw Label</th>
                <th>Normalized</th>
                <th>Subject / System</th>
                <th className="adm-th-num">Freq</th>
                <th>Seen</th>
                <th>Mapped To</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="adm-table-empty">Loading…</td></tr>
              )}
              {!loading && candidates.length === 0 && (
                <tr><td colSpan={10} className="adm-table-empty">No candidates found.</td></tr>
              )}
              {candidates.map(c => {
                const effective  = localUpdates[c.id] ? { ...c, ...localUpdates[c.id] } : c
                const isExpanded = expandedId === c.id
                const isSuccess  = successId === c.id
                const isPending  = effective.status === 'pending'
                const mappedTo   = effective.metadata?.mappedTo
                const noteText_  = effective.metadata?.note
                const hasNote    = !!noteText_

                return (
                  <Fragment key={c.id}>
                    <tr className={`adm-table-row${isSuccess ? ' adm-row-success' : ''}`}>
                      <td>
                        <span className={STATUS_BADGE[effective.status] ?? 'adm-badge'}>
                          {STATUS_LABEL[effective.status] ?? effective.status}
                        </span>
                      </td>
                      <td>
                        <span className={`adm-tc-type-badge adm-tc-type-${c.type}`}>
                          {c.type}
                        </span>
                      </td>
                      <td className="adm-cell-text adm-tc-label" title={c.rawLabel}>
                        {c.rawLabel}
                      </td>
                      <td className="adm-cell-text adm-tc-muted" title={c.normalizedGuess || undefined}>
                        {c.normalizedGuess || '—'}
                      </td>
                      <td className="adm-cell-text adm-tc-muted">
                        {c.subject && c.system
                          ? `${c.subject} / ${c.system}`
                          : c.subject || c.system || '—'}
                      </td>
                      <td className="adm-th-num adm-cell-num">{c.frequency}</td>
                      <td className="adm-cell-date">
                        <div>{fmt(c.lastSeenAt)}</div>
                        {c.createdAt && <div className="adm-tc-date-sub">{fmt(c.createdAt)}</div>}
                      </td>
                      <td className="adm-cell-text adm-tc-muted" title={mappedTo || undefined}>
                        {mappedTo || '—'}
                      </td>
                      <td className="adm-cell-text adm-tc-note" title={noteText_ || undefined}>
                        {noteText_
                          ? noteText_.length > 40 ? noteText_.slice(0, 40) + '…' : noteText_
                          : '—'}
                      </td>
                      <td>
                        <div className="adm-tc-actions">
                          {isPending && (
                            <>
                              <button
                                className="adm-tc-btn adm-tc-btn-approve"
                                onClick={() => handleApprove(effective)}
                                disabled={saving}
                                aria-label={`Approve ${c.rawLabel} as canonical`}
                              >Approve</button>
                              <button
                                className={`adm-tc-btn adm-tc-btn-map${isExpanded && actionMode === 'map' ? ' active' : ''}`}
                                onClick={() => handleMapOpen(effective)}
                                aria-label={`Map ${c.rawLabel} to existing canonical`}
                                aria-expanded={isExpanded && actionMode === 'map'}
                              >Map…</button>
                              <button
                                className="adm-tc-btn adm-tc-btn-reject"
                                onClick={() => handleReject(effective)}
                                disabled={saving}
                                aria-label={`Reject ${c.rawLabel}`}
                              >Reject</button>
                            </>
                          )}
                          <button
                            className={`adm-tc-btn adm-tc-btn-note${isExpanded && actionMode === 'note' ? ' active' : ''}`}
                            onClick={() => handleNoteOpen(effective)}
                            aria-label={hasNote ? `Edit note for ${c.rawLabel}` : `Add note for ${c.rawLabel}`}
                            aria-expanded={isExpanded && actionMode === 'note'}
                          >{hasNote ? 'Edit Note' : 'Add Note'}</button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && actionMode === 'map' && (
                      <tr className="adm-tc-inline-row">
                        <td colSpan={10}>
                          <div className="adm-tc-inline">
                            <span className="adm-tc-inline-label">
                              Map <strong>{c.rawLabel}</strong> to canonical:
                            </span>
                            <input
                              id={`tc-map-${c.id}`}
                              className="adm-tc-inline-input"
                              type="text"
                              value={mapTarget}
                              onChange={e => setMapTarget(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleMapConfirm(effective)}
                              placeholder="e.g. ACE Inhibitor Cough"
                              autoFocus
                            />
                            <button
                              className="adm-tc-btn adm-tc-btn-approve"
                              onClick={() => handleMapConfirm(effective)}
                              disabled={!mapTarget.trim() || saving}
                            >{saving ? 'Saving…' : 'Confirm'}</button>
                            <button className="adm-btn-ghost" onClick={closeExpanded}>Cancel</button>
                            {actionError && (
                              <span className="adm-tc-inline-error" role="alert">{actionError}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}

                    {isExpanded && actionMode === 'note' && (
                      <tr className="adm-tc-inline-row">
                        <td colSpan={10}>
                          <div className="adm-tc-inline">
                            <span className="adm-tc-inline-label">
                              Note for <strong>{c.rawLabel}</strong>:
                            </span>
                            <input
                              id={`tc-note-${c.id}`}
                              className="adm-tc-inline-input"
                              type="text"
                              value={noteText}
                              onChange={e => setNoteText(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && handleNoteConfirm(effective)}
                              placeholder="Add an admin note…"
                              autoFocus
                            />
                            <button
                              className="adm-tc-btn adm-tc-btn-approve"
                              onClick={() => handleNoteConfirm(effective)}
                              disabled={saving}
                            >{saving ? 'Saving…' : 'Save'}</button>
                            <button className="adm-btn-ghost" onClick={closeExpanded}>Cancel</button>
                            {actionError && (
                              <span className="adm-tc-inline-error" role="alert">{actionError}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="adm-pagination">
        <button
          className="adm-btn-page"
          onClick={() => { setPage(p => p - 1); closeExpanded() }}
          disabled={!hasPrev}
          aria-label="Previous page"
        >← Previous</button>
        <span className="adm-page-info">Page {page}</span>
        <button
          className="adm-btn-page"
          onClick={() => { setPage(p => p + 1); closeExpanded() }}
          disabled={!hasMore}
          aria-label="Next page"
        >Next →</button>
      </div>
    </div>
  )
}
