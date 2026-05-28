const PRIORITY_META = {
  1: { label: 'CRITICAL',   tone: 'critical', helper: 'Instability Risk' },
  2: { label: 'HIGH FOCUS', tone: 'high',     helper: 'Targeted Repair' },
  3: { label: 'REVIEW',     tone: 'review',   helper: 'Monitor' },
  stable: { label: 'STABLE', tone: 'stable',  helper: 'Low Risk' },
}

function getPriorityMeta(priority) {
  return PRIORITY_META[priority] || PRIORITY_META.stable
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== ''
}

export default function StudyPrescription({ studyPrescription = [] }) {
  const filtered = studyPrescription
    .filter(item => item && (item.priorityScore === undefined || item.priorityScore >= 50))
    .slice(0, 5)

  if (filtered.length === 0) {
    return (
      <div className="an-card">
        <div className="an-card-title">Repair Priority Queue</div>
        <p className="an-rx-empty">
          No instability detected at threshold. Continue mixed practice to maintain coverage.
        </p>
      </div>
    )
  }

  return (
    <div className="an-card">
      <div className="an-card-title">Repair Priority Queue</div>
      <div className="an-rx-list">
        {filtered.map((item, i) => {
          const meta = getPriorityMeta(item.priority)
          const title = item.topic || item.area || item.parentTopic || 'Study Priority'
          const action = item.action || item.prescription?.[0] || 'Review this area with targeted practice.'
          const prescription = Array.isArray(item.prescription) && item.prescription.length
            ? item.prescription
            : [action]

          const usmle = item.usmleImportance
          const usmleReason  = usmle?.reason  || null
          const usmleTestedAs = usmle?.testedAs || null

          return (
            <div key={item.id || `${title}-${i}`} className={`an-rx-item tone-${meta.tone}`}>
              <div className="an-rx-urgency-strip" />
              <div className="an-rx-body">

                <div className="an-rx-topline">
                  <div className="an-priority-badge">
                    <span className="an-priority-badge-label">{meta.label}</span>
                    <span className="an-priority-badge-helper">{meta.helper}</span>
                  </div>
                  {hasValue(item.priorityScore) && (
                    <span className="an-rx-score">{Math.round(item.priorityScore)}/100</span>
                  )}
                </div>

                <div className="an-rx-area">{title}</div>

                {(hasValue(item.accuracy) || hasValue(item.trend) || hasValue(item.retentionRisk) || hasValue(item.estimatedScoreGain) || hasValue(item.nextReview)) && (
                  <div className="an-rx-meta">
                    {hasValue(item.accuracy)          && <span className="an-rx-metric">Accuracy {item.accuracy}%</span>}
                    {hasValue(item.trend)              && <span className="an-rx-metric">Trend {item.trend}</span>}
                    {hasValue(item.retentionRisk)      && <span className="an-rx-metric">Retention {item.retentionRisk}</span>}
                    {hasValue(item.estimatedScoreGain) && <span className="an-rx-metric">Gain {item.estimatedScoreGain}</span>}
                    {hasValue(item.nextReview)         && <span className="an-rx-metric">Next review {item.nextReview}</span>}
                  </div>
                )}

                {hasValue(item.mainIssue) && (
                  <div className="an-rx-main-issue">{item.mainIssue}</div>
                )}

                <div className="an-rx-prescription">
                  {prescription.slice(0, 3).map((step, si) => (
                    <div key={si} className="an-rx-action">{step}</div>
                  ))}
                </div>

                {usmleReason && (
                  <div className="an-rx-usmle">
                    <div className="an-rx-usmle-label">Why Step 1 cares</div>
                    <div className="an-rx-usmle-text">{usmleReason}</div>
                    {usmleTestedAs && (
                      <div className="an-rx-usmle-sub">{usmleTestedAs}</div>
                    )}
                  </div>
                )}

              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
