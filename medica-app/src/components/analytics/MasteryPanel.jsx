import { useState } from 'react'
import { getAuthToken } from '../../lib/apiClient'
import { useMasteryOverview, useMasteryWeakest, useMasteryStrongest, useMasterySubjects, useMasterySubjectConcepts } from '../../hooks/useMastery'
import ConceptDetailModal from './ConceptDetailModal'

const TIER_META = {
  p1:         { label: 'P1',         color: 'var(--status-critical)' },
  p2:         { label: 'P2',         color: 'var(--status-warn)'     },
  p3:         { label: 'P3',         color: 'var(--status-stable)'   },
  priority:   { label: 'P1',         color: 'var(--status-critical)' },
  focus:      { label: 'P2',         color: 'var(--status-warn)'     },
  reinforced: { label: 'P3',         color: 'var(--status-stable)'   },
  ontrack:    { label: 'On Track',   color: 'var(--blue)'            },
}

function MasteryBar({ score }) {
  const pct   = Math.round((score ?? 0) * 100)
  const color = pct < 50 ? 'var(--status-critical)' : pct < 70 ? 'var(--status-warn)' : pct < 80 ? 'var(--status-stable)' : 'var(--blue)'
  return (
    <div className="mp-bar-wrap" title={`${pct}%`}>
      <div className="mp-bar" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function SkeletonRow() {
  return <div className="mp-skeleton-row" />
}

// ── Subject drilldown modal — reuses cdm-* CSS from ConceptDetailModal ────────

function SubjectDrilldownModal({ subjectData, onClose, onConceptClick }) {
  const { data: drilldown, loading: dLoading } = useMasterySubjectConcepts(subjectData.subject)

  const tierColor = TIER_META[subjectData.tier]?.color ?? 'var(--blue)'

  return (
    <div
      className="cdm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`${subjectData.subject} subject mastery`}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="cdm-panel">

        {/* Header */}
        <div className="cdm-hdr">
          <div className="cdm-hdr-left">
            <span className="cdm-title">{subjectData.subject}</span>
            <span
              className={`an-subj-badge an-subj-badge--${subjectData.tier}`}
              style={{ fontSize: 10, marginTop: 4 }}
            >
              {TIER_META[subjectData.tier]?.label ?? subjectData.tier}
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

        {/* 4-up metrics */}
        <div className="cdm-metrics">
          <div className="cdm-metric">
            <span className="cdm-metric-val" style={{ color: tierColor }}>
              {Math.round(subjectData.rollupMastery * 100)}%
            </span>
            <span className="cdm-metric-label">Mastery</span>
          </div>
          <div className="cdm-metric">
            <span className="cdm-metric-val">
              {Math.round(subjectData.rollupConfidence * 100)}%
            </span>
            <span className="cdm-metric-label">Confidence</span>
          </div>
          <div className="cdm-metric">
            <span className="cdm-metric-val">{subjectData.totalAttempts}</span>
            <span className="cdm-metric-label">Attempts</span>
          </div>
          <div className="cdm-metric">
            <span
              className="cdm-metric-val"
              style={{ color: subjectData.weakConceptCount > 0 ? 'var(--status-critical)' : 'var(--blue)' }}
            >
              {subjectData.weakConceptCount}
            </span>
            <span className="cdm-metric-label">Weak</span>
          </div>
        </div>

        {/* Concept list */}
        <div className="cdm-section-label">
          Concepts{drilldown ? ` · ${drilldown.count}` : ''}
        </div>

        {dLoading ? (
          <div className="mp-skeleton-rows">
            {[0, 1, 2, 3].map(i => <SkeletonRow key={i} />)}
          </div>
        ) : !drilldown?.concepts?.length ? (
          <p className="an-intel-muted">No concepts tracked for this subject yet.</p>
        ) : (
          <div className="mp-concept-list">
            {drilldown.concepts.map(({ concept, mastery, tier }) => (
              <button
                key={concept.id}
                type="button"
                className="mp-concept-row"
                onClick={() => onConceptClick({ concept, mastery, tier })}
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
  )
}

// ── Subject list — rows are clickable buttons ─────────────────────────────────

function SubjectList({ items, emptyMsg, onSelect }) {
  if (!items.length) return <p className="an-intel-muted">{emptyMsg}</p>
  return (
    <div className="mp-concept-list">
      {items.map(s => (
        <button
          key={s.subject}
          type="button"
          className="mp-subject-row"
          onClick={() => onSelect(s)}
          aria-label={`View ${s.subject} subject details`}
        >
          <span className="mp-subject-name">{s.subject}</span>
          <MasteryBar score={s.rollupMastery} />
          <span className="spp-attempts">{s.totalAttempts} tries</span>
          <span className={`an-subj-badge an-subj-badge--${s.tier}`}>
            {TIER_META[s.tier]?.label ?? s.tier}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function MasteryPanel() {
  const [selectedConcept, setSelectedConcept] = useState(null)  // {concept, mastery, tier}
  const [selectedSubject, setSelectedSubject] = useState(null)  // SubjectRollup

  const overview  = useMasteryOverview()
  const weakest   = useMasteryWeakest(5, 1)
  const strongest = useMasteryStrongest(5, 1)
  const subjects  = useMasterySubjects()

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

  function handleSubjectClick(subjectRollup) {
    setSelectedSubject(subjectRollup)
    setSelectedConcept(null)
  }

  function handleConceptFromSubject(conceptData) {
    setSelectedSubject(null)
    setSelectedConcept(conceptData)
  }

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
          <div className="an-intel-card-title">P1 Concepts</div>
          <div className="an-intel-card-sub">Needs reinforcement — sorted weakest first</div>
          {weakest.loading ? (
            <div className="mp-skeleton-rows">{[0,1,2,3,4].map(i => <SkeletonRow key={i} />)}</div>
          ) : !weakest.data?.concepts?.length ? (
            <p className="an-intel-muted">
              {ov?.total_concepts > 0
                ? 'All tracked concepts are performing at P2 level or above.'
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

        {/* ── Row 3: Subject breakdown ──────────────────────────── */}
        {!(subjects.error?.status === 401 || subjects.error?.status === 403) && (
          <div className="mp-row">

            {/* Weak subjects */}
            <div className="an-intel-card mp-concept-card">
              <div className="an-intel-card-title">Weak Subjects</div>
              <div className="an-intel-card-sub">Below 80% mastery - click to drill down</div>
              {subjects.loading ? (
                <div className="mp-skeleton-rows">{[0,1,2].map(i => <SkeletonRow key={i} />)}</div>
              ) : (
                <SubjectList
                  items={(subjects.data?.subjects ?? []).filter(s => s.tier !== 'ontrack')}
                  emptyMsg="All subjects are performing at exam-ready level."
                  onSelect={handleSubjectClick}
                />
              )}
            </div>

            {/* Strong subjects — tier is ontrack */}
            <div className="an-intel-card mp-concept-card">
              <div className="an-intel-card-title">Strong Subjects</div>
              <div className="an-intel-card-sub">Mastery 80%+ - click to drill down</div>
              {subjects.loading ? (
                <div className="mp-skeleton-rows">{[0,1,2].map(i => <SkeletonRow key={i} />)}</div>
              ) : (
                <SubjectList
                  items={(subjects.data?.subjects ?? [])
                    .filter(s => s.tier === 'ontrack')
                    .sort((a, b) => b.rollupMastery - a.rollupMastery)}
                  emptyMsg="No subjects at exam-ready level yet."
                  onSelect={handleSubjectClick}
                />
              )}
            </div>

          </div>
        )}

      </div>

      {selectedSubject && (
        <SubjectDrilldownModal
          subjectData={selectedSubject}
          onClose={() => setSelectedSubject(null)}
          onConceptClick={handleConceptFromSubject}
        />
      )}

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
