import { useMasteryConcept, useTopicReadiness, useConceptReviews } from '../../hooks/useMastery'

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

const TOPIC_TREND_GLYPH = { up: '↑', down: '↓', stable: '→' }
const TOPIC_TREND_CLS   = { up: 'ptp-delta--up', down: 'ptp-delta--down', stable: 'ptp-delta--flat' }

const RESULT_LABEL = { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' }

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtInterval(days) {
  return `${days}d`
}

export default function ConceptDetailModal({ concept, mastery, tier, onClose }) {
  const { data: detail,    loading }            = useMasteryConcept(concept?.id)
  const { data: topicRd,   loading: trLoading } = useTopicReadiness(concept?.id)
  const { data: reviewHist, loading: rhLoading } = useConceptReviews(concept?.id)

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

        {/* Topic readiness */}
        {trLoading && <p className="an-intel-muted" style={{ fontSize: 11 }}>Loading readiness…</p>}
        {!trLoading && topicRd && (
          <div className="cdm-readiness-section">
            <div className="cdm-section-label">Readiness</div>
            <div className="cdm-readiness-row">
              <span className="cdm-readiness-score">{topicRd.readiness}%</span>
              <span className="cdm-readiness-status">{topicRd.status}</span>
              <span
                className={`ptp-delta ${TOPIC_TREND_CLS[topicRd.trend] ?? 'ptp-delta--flat'}`}
                aria-label={`Trend: ${topicRd.trend}`}
              >
                {TOPIC_TREND_GLYPH[topicRd.trend] ?? '→'}
              </span>
            </div>
            {topicRd.recommendation && (
              <p className="cdm-readiness-rec">{topicRd.recommendation}</p>
            )}
          </div>
        )}

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

        {/* Review history */}
        {!rhLoading && (
          <div className="cdm-history-section">
            <div className="cdm-history-hdr">
              <div className="cdm-section-label">Review History</div>
              {reviewHist && reviewHist.totalReviews > 0 && (
                <span className="cdm-history-count">{reviewHist.totalReviews} review{reviewHist.totalReviews !== 1 ? 's' : ''}</span>
              )}
            </div>

            {reviewHist && reviewHist.totalReviews > 0 ? (
              <>
                <div className="cdm-history-meta">
                  {reviewHist.currentIntervalDays != null && (
                    <div className="cdm-history-meta-item">
                      <span className="cdm-history-meta-key">Interval</span>
                      <span className="cdm-history-meta-val">{fmtInterval(reviewHist.currentIntervalDays)}</span>
                    </div>
                  )}
                  {reviewHist.nextReviewAt && (
                    <div className="cdm-history-meta-item">
                      <span className="cdm-history-meta-key">Next Review</span>
                      <span className="cdm-history-meta-val">{fmtDate(reviewHist.nextReviewAt)}</span>
                    </div>
                  )}
                  {reviewHist.lastReview && (
                    <div className="cdm-history-meta-item">
                      <span className="cdm-history-meta-key">Last Result</span>
                      <span className={`cdm-history-result cdm-result--${reviewHist.lastReview.result}`}>
                        {RESULT_LABEL[reviewHist.lastReview.result]}
                      </span>
                    </div>
                  )}
                </div>

                <div className="cdm-history-timeline" aria-label="Review history timeline">
                  {reviewHist.reviews.map((entry, i) => (
                    <div key={i} className="cdm-history-entry">
                      <span className="cdm-history-date">{fmtDate(entry.reviewedAt)}</span>
                      <span className={`cdm-history-result cdm-result--${entry.result}`}>
                        {RESULT_LABEL[entry.result]}
                      </span>
                      <span className="cdm-history-interval">
                        {fmtInterval(entry.intervalBefore)} → {fmtInterval(entry.intervalAfter)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="cdm-history-empty">No SRS reviews yet.</p>
            )}
          </div>
        )}

        {loading && <p className="an-intel-muted">Loading concept details…</p>}
      </div>
    </div>
  )
}
