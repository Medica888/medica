import { useState } from 'react'
import { getAuthToken } from '../../lib/apiClient'
import { useMasteryOverview, useMasteryWeakest, useMasteryStrongest } from '../../hooks/useMastery'
import ConceptDetailModal from './ConceptDetailModal'

const TIER_META = {
  priority:   { label: 'Priority',   color: 'var(--status-critical)' },
  focus:      { label: 'Focus',      color: 'var(--status-warn)'     },
  reinforced: { label: 'Reinforced', color: 'var(--status-stable)'   },
  ontrack:    { label: 'On Track',   color: 'var(--blue)'            },
}

function MasteryBar({ score }) {
  const pct   = Math.round((score ?? 0) * 100)
  const color = pct < 65 ? 'var(--status-critical)' : pct < 75 ? 'var(--status-warn)' : pct < 85 ? 'var(--status-stable)' : 'var(--blue)'
  return (
    <div className="mp-bar-wrap" title={`${pct}%`}>
      <div className="mp-bar" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function SkeletonRow() {
  return <div className="mp-skeleton-row" />
}

export default function MasteryPanel() {
  const [selectedConcept, setSelectedConcept] = useState(null)

  const overview  = useMasteryOverview()
  const weakest   = useMasteryWeakest(5, 1)
  const strongest = useMasteryStrongest(5, 1)

  // Only render when authenticated
  if (!getAuthToken()) return null

  // Hide entire panel while all three are still loading first time
  if (overview.loading && weakest.loading && strongest.loading) {
    return (
      <div className="an-intel-card mp-panel">
        <div className="an-intel-card-title">Concept Mastery</div>
        <div className="mp-skeleton-rows">
          {[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}
        </div>
      </div>
    )
  }

  // Silently hide on auth error (401) — don't surface it in analytics
  if (overview.error?.status === 401 || overview.error?.status === 403) return null

  const ov   = overview.data
  const dist = ov?.distribution

  return (
    <>
      <div className="mp-panel">

        {/* ── Row 1: Tier distribution ─────────────────────────────── */}
        <div className="mp-row">
          <div className="an-intel-card mp-dist-card">
            <div className="an-intel-card-title">Concept Mastery</div>
            <div className="an-intel-card-sub">
              {ov ? `${ov.total_concepts} concept${ov.total_concepts !== 1 ? 's' : ''} tracked` : 'Loading…'}
            </div>

            {ov && ov.total_concepts === 0 ? (
              <p className="an-intel-muted">
                Complete sessions with AI-generated questions to build your mastery profile.
              </p>
            ) : dist ? (
              <>
                <div className="mp-dist-grid">
                  {Object.entries(TIER_META).map(([key, meta]) => (
                    <div key={key} className="mp-dist-cell">
                      <span className="mp-dist-count" style={{ color: meta.color }}>
                        {dist[key] ?? 0}
                      </span>
                      <span className="mp-dist-label">{meta.label}</span>
                    </div>
                  ))}
                </div>

                {/* Average mastery bar */}
                {ov.avg_mastery_score != null && (
                  <div className="mp-avg-row">
                    <span className="mp-avg-label">Avg mastery</span>
                    <span className="mp-avg-val">{Math.round(ov.avg_mastery_score * 100)}%</span>
                    <div className="mp-avg-bar-wrap">
                      <div
                        className="mp-avg-bar"
                        style={{ width: `${Math.round(ov.avg_mastery_score * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* ── Strongest concepts ───────────────────────────────── */}
          <div className="an-intel-card mp-concept-card">
            <div className="an-intel-card-title">Strongest Concepts</div>
            {strongest.loading ? (
              <div className="mp-skeleton-rows">{[0,1,2].map(i => <SkeletonRow key={i} />)}</div>
            ) : !strongest.data?.concepts?.length ? (
              <p className="an-intel-muted">No concepts with sufficient attempts yet.</p>
            ) : (
              <div className="mp-concept-list">
                {strongest.data.concepts.map(({ concept, mastery, tier }) => (
                  <button
                    key={concept.id}
                    type="button"
                    className="mp-concept-row"
                    onClick={() => setSelectedConcept({ concept, mastery, tier })}
                    aria-label={`View ${concept.name} details`}
                  >
                    <span className="mp-concept-name">{concept.name}</span>
                    <MasteryBar score={mastery.mastery_score} />
                    <span className={`an-subj-badge an-subj-badge--${tier}`}>
                      {TIER_META[tier]?.label ?? tier}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 2: Weakest concepts ──────────────────────────────── */}
        <div className="an-intel-card mp-concept-card mp-weak-card">
          <div className="an-intel-card-title">Priority Concepts</div>
          <div className="an-intel-card-sub">Needs reinforcement — sorted weakest first</div>
          {weakest.loading ? (
            <div className="mp-skeleton-rows">{[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}</div>
          ) : !weakest.data?.concepts?.length ? (
            <p className="an-intel-muted">
              {ov?.total_concepts > 0
                ? 'All tracked concepts are performing at Focus level or above.'
                : 'No weak concepts identified yet.'}
            </p>
          ) : (
            <table className="mp-weak-table">
              <thead>
                <tr>
                  <th className="mp-th">Concept</th>
                  <th className="mp-th mp-th--num">Attempts</th>
                  <th className="mp-th mp-th--bar">Mastery</th>
                  <th className="mp-th mp-th--right">Status</th>
                </tr>
              </thead>
              <tbody>
                {weakest.data.concepts.map(({ concept, mastery, tier }) => (
                  <tr
                    key={concept.id}
                    className="mp-weak-row"
                    onClick={() => setSelectedConcept({ concept, mastery, tier })}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setSelectedConcept({ concept, mastery, tier })}
                    role="button"
                    aria-label={`View ${concept.name} details`}
                  >
                    <td className="mp-td-name">{concept.name}</td>
                    <td className="mp-td-num">{mastery.attempts}</td>
                    <td className="mp-td-bar"><MasteryBar score={mastery.mastery_score} /></td>
                    <td className="mp-td-badge">
                      <span className={`an-subj-badge an-subj-badge--${tier}`}>
                        {TIER_META[tier]?.label ?? tier}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedConcept && (
        <ConceptDetailModal
          concept={selectedConcept.concept}
          mastery={selectedConcept.mastery}
          tier={selectedConcept.tier}
          onClose={() => setSelectedConcept(null)}
        />
      )}
    </>
  )
}
