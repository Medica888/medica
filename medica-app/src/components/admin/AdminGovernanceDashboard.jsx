import { useGovernanceMetrics } from '../../hooks/useAdminGovernance'

function pct(val) {
  if (val == null) return '—'
  return `${Math.round(val * 100)}%`
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="adm-metric-card">
      <div className="adm-metric-label">{label}</div>
      <div className="adm-metric-value" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="adm-metric-sub">{sub}</div>}
    </div>
  )
}

function ActionEntry({ entry }) {
  return (
    <div className="adm-recent-entry">
      <div className="adm-recent-action">{entry.action}</div>
      <div className="adm-recent-id" title={entry.questionId}>
        {String(entry.questionId || '').slice(0, 24)}…
      </div>
      {entry.createdAt && (
        <div className="adm-recent-time">
          {new Date(entry.createdAt).toLocaleString('en-US', {
            month: 'short', day: 'numeric',
            hour: 'numeric', minute: '2-digit',
          })}
        </div>
      )}
    </div>
  )
}

export default function AdminGovernanceDashboard() {
  const { data, loading, error } = useGovernanceMetrics()

  const m = data?.metrics ?? {}
  const recentApprovals   = data?.recentApprovals   ?? []
  const recentQuarantines = data?.recentQuarantines ?? []

  return (
    <div className="adm-page">
      <div className="adm-page-hdr">
        <div>
          <h1 className="adm-page-title">Governance Dashboard</h1>
          <p className="adm-page-sub">Generated question bank health overview</p>
        </div>
      </div>

      {error && (
        <div className="adm-error" role="alert">
          Failed to load metrics: {error.message}
        </div>
      )}

      {loading && <div className="adm-detail-loading">Loading metrics…</div>}

      {!loading && !error && (
        <>
          <div className="adm-metric-grid">
            <MetricCard label="Total Generated"     value={m.total ?? 0} />
            <MetricCard label="Pending Review"      value={m.validatedGenerated ?? 0} accent="var(--orange)" />
            <MetricCard label="Approved"            value={m.approved ?? 0} accent="var(--green)" />
            <MetricCard label="Quarantined"         value={m.quarantined ?? 0} accent="var(--red)" />
            <MetricCard label="Approval Rate"       value={pct(m.approvalRate)} />
            <MetricCard label="Quarantine Rate"     value={pct(m.quarantineRate)} />
            <MetricCard
              label="Avg Validation Score"
              value={m.averageValidationScore != null ? `${m.averageValidationScore}%` : '—'}
            />
            <MetricCard label="Used in Sessions"   value={m.used ?? 0} sub={`${m.totalUsage ?? 0} total uses`} />
          </div>

          <div className="adm-recent-cols">
            <div className="adm-recent-col">
              <div className="adm-section-label">Recent Approvals</div>
              {recentApprovals.length === 0 && (
                <div className="adm-hist-empty">No recent approvals.</div>
              )}
              {recentApprovals.map((e, i) => <ActionEntry key={i} entry={e} />)}
            </div>
            <div className="adm-recent-col">
              <div className="adm-section-label">Recent Quarantines</div>
              {recentQuarantines.length === 0 && (
                <div className="adm-hist-empty">No recent quarantines.</div>
              )}
              {recentQuarantines.map((e, i) => <ActionEntry key={i} entry={e} />)}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
