const RISK_META = {
  critical: { label: 'PRIORITY',   color: 'var(--status-critical)' },
  high:     { label: 'FOCUS',      color: 'var(--status-warn)' },
  moderate: { label: 'REINFORCED', color: 'var(--blue)' },
  low:      { label: 'LOW SIGNAL', color: 'var(--t3)' },
}

function ClusterRow({ item }) {
  const barColor = item.severity >= 70 ? 'var(--status-critical)'
    : item.severity >= 50 ? 'var(--status-warn)' : 'var(--blue)'
  return (
    <div className="an-diag-row">
      <div className="an-diag-row-info">
        <span className="an-diag-name">{item.name}</span>
        <span className="an-diag-count">{item.count}×</span>
      </div>
      <div className="an-diag-row-bar">
        <div className="an-diag-row-fill" style={{ width: `${item.severity}%`, background: barColor }} />
      </div>
      {item.density != null && (
        <div className="an-diag-row-density">{item.density}% miss rate</div>
      )}
    </div>
  )
}

export default function MistakeDiagnosis({ mistakeDiagnosis }) {
  if (!mistakeDiagnosis.primaryFailureMode) {
    const { topSubjects = [], topSystems = [], patterns = [] } = mistakeDiagnosis
    return (
      <div className="an-card">
        <div className="an-card-title">Mistake Diagnosis</div>
        {patterns.map((p, i) => (
          <div key={i} className="an-diag-insight">{p}</div>
        ))}
        {topSubjects.length > 0 && (
          <div className="an-diag-section-card" style={{ marginTop: 10 }}>
            <div className="an-diag-lbl">Subject Miss Clusters</div>
            {topSubjects.map(s => (
              <div key={s.name} className="an-diag-row">
                <div className="an-diag-row-info">
                  <span className="an-diag-name">{s.name}</span>
                  <span className="an-diag-count">{s.count} missed</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {topSystems.length > 0 && (
          <div className="an-diag-section-card" style={{ marginTop: 8 }}>
            <div className="an-diag-lbl">System Miss Clusters</div>
            {topSystems.map(s => (
              <div key={s.name} className="an-diag-row">
                <div className="an-diag-row-info">
                  <span className="an-diag-name">{s.name}</span>
                  <span className="an-diag-count">{s.count} missed</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const {
    totalMissed, riskLevel, dataConfidence,
    primaryFailureMode, mistakeMix,
    topSubjects, topSystems,
    diagnosticInsights, recommendedFixes,
  } = mistakeDiagnosis

  if (totalMissed === 0) {
    return (
      <div className="an-card">
        <div className="an-card-title">Mistake Intelligence</div>
        <p className="an-diag-empty">No mistakes recorded yet. Start a session to unlock diagnostic analysis.</p>
      </div>
    )
  }

  const risk     = RISK_META[riskLevel] || RISK_META.low
  const gridCols = topSubjects.length > 0 && topSystems.length > 0 ? '1fr 1fr' : '1fr'

  return (
    <div className="an-card">
      <div className="an-diag-header">
        <div>
          <div className="an-card-title">Mistake Intelligence</div>
          <div className="an-diag-subtitle">{totalMissed} errors analyzed · {dataConfidence} confidence</div>
        </div>
        <div className="an-diag-risk-badge" style={{ '--badge-color': risk.color }}>
          {risk.label}
        </div>
      </div>

      <div className="an-diag-primary">
        <div className="an-diag-primary-label">Primary Failure Mode</div>
        <div className="an-diag-primary-type">{primaryFailureMode.label}</div>
        <div className="an-diag-primary-desc">{primaryFailureMode.description}</div>
      </div>

      {mistakeMix.length > 0 && (
        <div className="an-diag-mix">
          <div className="an-diag-lbl">Miss Distribution</div>
          <div className="an-diag-mix-bar">
            {mistakeMix.map((seg, i) => (
              <div
                key={i}
                className="an-diag-mix-segment"
                style={{ width: `${seg.pct}%`, background: seg.color }}
                title={`${seg.label}: ${seg.count} (${seg.pct}%)`}
              />
            ))}
          </div>
          <div className="an-diag-mix-legend">
            {mistakeMix.map((seg, i) => (
              <div key={i} className="an-diag-mix-item">
                <span className="an-diag-mix-dot" style={{ background: seg.color }} />
                <span>{seg.label}</span>
                <span className="an-diag-mix-pct">{seg.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(topSubjects.length > 0 || topSystems.length > 0) && (
        <div className="an-diag-grid" style={{ gridTemplateColumns: gridCols }}>
          {topSubjects.length > 0 && (
            <div className="an-diag-section-card">
              <div className="an-diag-lbl">Subject Instability Clusters</div>
              {topSubjects.map(s => <ClusterRow key={s.name} item={s} />)}
            </div>
          )}
          {topSystems.length > 0 && (
            <div className="an-diag-section-card">
              <div className="an-diag-lbl">System Instability Clusters</div>
              {topSystems.map(s => <ClusterRow key={s.name} item={s} />)}
            </div>
          )}
        </div>
      )}

      {diagnosticInsights.length > 0 && (
        <div className="an-diag-insights">
          <div className="an-diag-lbl">Diagnostic Signal</div>
          {diagnosticInsights.map((insight, i) => (
            <div key={i} className="an-diag-insight">{insight}</div>
          ))}
        </div>
      )}

      {recommendedFixes.length > 0 && (
        <div className="an-diag-fixes">
          <div className="an-diag-lbl">Repair Protocol</div>
          {recommendedFixes.map((fix, i) => (
            <div key={i} className="an-diag-fix">
              <span className="an-diag-fix-num">{i + 1}</span>
              {fix}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
