import { useMasteryConcept } from '../../hooks/useMastery'

const TIER_META = {
  priority:   { label: 'Priority',   color: 'var(--status-critical)' },
  focus:      { label: 'Focus',      color: 'var(--status-warn)'     },
  reinforced: { label: 'Reinforced', color: 'var(--status-stable)'   },
  ontrack:    { label: 'On Track',   color: 'var(--blue)'            },
}

// "ace-inhibitor-adverse-effects" → "Ace Inhibitor Adverse Effects"
function slugToDisplay(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function ConfidenceBar({ score }) {
  const pct = Math.round((score ?? 0) * 100)
  return (
    <div className="cdm-bar-wrap">
      <div className="cdm-bar" style={{ width: `${pct}%` }} />
    </div>
  )
}

export default function ConceptDetailModal({ concept, mastery, tier, onClose }) {
  const { data: detail, loading } = useMasteryConcept(concept?.id)

  const tierMeta = TIER_META[tier] ?? TIER_META.focus
  const masteryPct = Math.round((mastery?.mastery_score ?? 0) * 100)
  const confPct    = Math.round((mastery?.confidence_score ?? 0) * 100)

  // Ancestor path from concept detail (array of slugs, root → self)
  const ancestorPath = detail?.ancestor_path ?? []

  return (
    <div
      className="cdm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${concept?.name} mastery details`}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cdm-panel">
        {/* Header */}
        <div className="cdm-hdr">
          <div className="cdm-hdr-left">
            <span className="cdm-title">{concept?.name}</span>
            <span
              className={`an-subj-badge an-subj-badge--${tier}`}
              style={{ fontSize: 10, marginTop: 4 }}
            >
              {tierMeta.label}
            </span>
          </div>
          <button
            type="button"
            className="cdm-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Subject / System chips */}
        {(concept?.subject || concept?.system) && (
          <div className="cdm-chips">
            {concept.subject && <span className="cdm-chip">{concept.subject}</span>}
            {concept.system  && <span className="cdm-chip">{concept.system}</span>}
          </div>
        )}

        {/* Mastery metrics */}
        <div className="cdm-metrics">
          <div className="cdm-metric">
            <span className="cdm-metric-val" style={{ color: tierMeta.color }}>{masteryPct}%</span>
            <span className="cdm-metric-label">Mastery</span>
          </div>
          <div className="cdm-metric">
            <span className="cdm-metric-val">{confPct}%</span>
            <span className="cdm-metric-label">Confidence</span>
          </div>
          <div className="cdm-metric">
            <span className="cdm-metric-val">{mastery?.attempts ?? 0}</span>
            <span className="cdm-metric-label">Attempts</span>
          </div>
          <div className="cdm-metric">
            <span className="cdm-metric-val">{mastery?.correct ?? 0}</span>
            <span className="cdm-metric-label">Correct</span>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="cdm-conf-section">
          <div className="cdm-conf-row">
            <span className="cdm-conf-label">Confidence ({confPct}%)</span>
            <span className="cdm-conf-hint">Saturates at 5+ attempts</span>
          </div>
          <ConfidenceBar score={mastery?.confidence_score} />
        </div>

        {/* Ancestor path */}
        {!loading && ancestorPath.length > 1 && (
          <div className="cdm-path-section">
            <div className="cdm-section-label">Concept Path</div>
            <div className="cdm-path">
              {ancestorPath.map((slug, i) => (
                <span key={slug} className="cdm-path-item">
                  {i > 0 && <span className="cdm-path-sep">›</span>}
                  <span className={i === ancestorPath.length - 1 ? 'cdm-path-current' : 'cdm-path-ancestor'}>
                    {slugToDisplay(slug)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent incorrect count */}
        {mastery?.recent_incorrect_count > 0 && (
          <div className="cdm-incorrect-note">
            <span style={{ color: 'var(--status-critical)', fontWeight: 700 }}>
              {mastery.recent_incorrect_count}
            </span>
            {' '}wrong answer{mastery.recent_incorrect_count !== 1 ? 's' : ''} recorded
          </div>
        )}

        {loading && <p className="an-intel-muted">Loading concept details…</p>}
      </div>
    </div>
  )
}
