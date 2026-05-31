import { getAuthToken } from '../../lib/apiClient'
import { useDailyStudyPlan, useStudyPrescription } from '../../hooks/useMastery'

// Tier display config — reuses existing badge CSS from Phase 3.4
const TIER_CONFIG = {
  ontrack:    { label: 'On Track',   sub: 'Maintain with spaced review',    badgeClass: 'an-subj-badge--ontrack',    borderColor: 'var(--blue)'            },
  priority:   { label: 'Priority',   sub: 'Below passing threshold',        badgeClass: 'an-subj-badge--priority',   borderColor: 'var(--status-critical)' },
  focus:      { label: 'Focus',      sub: 'Developing — close to threshold', badgeClass: 'an-subj-badge--focus',      borderColor: 'var(--status-warn)'     },
  reinforced: { label: 'Reinforced', sub: 'Solid — maintain with review',   badgeClass: 'an-subj-badge--reinforced', borderColor: 'var(--status-stable)'   },
}

function MasteryPct({ score }) {
  const pct   = Math.round((score ?? 0) * 100)
  const color = pct < 65 ? 'var(--status-critical)' : pct < 75 ? 'var(--status-warn)' : pct < 85 ? 'var(--status-stable)' : 'var(--blue)'
  return (
    <span className="spp-pct" style={{ color }} title={`${pct}% mastery`}>
      {pct}%
    </span>
  )
}

function ConfidenceDots({ score }) {
  const filled = Math.round((score ?? 0) * 5) // 0-5 dots
  return (
    <span className="spp-conf-dots" aria-label={`Confidence: ${Math.round((score ?? 0) * 100)}%`}>
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          className={`spp-conf-dot${i < filled ? ' filled' : ''}`}
        />
      ))}
    </span>
  )
}

function ConceptRow({ item }) {
  return (
    <div className="spp-row">
      <div className="spp-row-main">
        {item.subject && (
          <span className="spp-subject-chip">{item.subject}</span>
        )}
        <span className="spp-name">{item.name}</span>
        <span className="spp-rec">{item.recommendation}</span>
      </div>
      <div className="spp-row-meta">
        <MasteryPct score={item.masteryScore} />
        <ConfidenceDots score={item.confidence} />
        <span className="spp-attempts">{item.attempts} tried</span>
      </div>
    </div>
  )
}

function TierSection({ tier, items }) {
  const cfg = TIER_CONFIG[tier]
  if (!items?.length) return null
  return (
    <div className="spp-tier">
      <div className="spp-tier-hdr">
        <span className={`an-subj-badge ${cfg.badgeClass}`}>{cfg.label}</span>
        <span className="spp-tier-sub">{cfg.sub}</span>
        <span className="spp-tier-count">{items.length} concept{items.length !== 1 ? 's' : ''}</span>
      </div>
      <div
        className="spp-tier-body"
        style={{ borderLeftColor: cfg.borderColor }}
      >
        {items.map((item, i) => <ConceptRow key={`${tier}-${i}`} item={item} />)}
      </div>
    </div>
  )
}

function StatPill({ icon, value, label }) {
  return (
    <div className="spp-stat">
      <span className="spp-stat-icon" aria-hidden="true">{icon}</span>
      <span className="spp-stat-val">{value}</span>
      <span className="spp-stat-label">{label}</span>
    </div>
  )
}

function DailyPlanSummary({ plan }) {
  if (!plan) return null
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="spp-tier">
      <div className="spp-tier-hdr">
        <span className="an-subj-badge an-subj-badge--priority">Today</span>
        <span className="spp-tier-sub">{plan.summary}</span>
        <span className="spp-tier-count">{plan.readinessStatus}</span>
      </div>
      <div className="spp-stats">
        <StatPill icon="?" value={plan.recommendedQuestions} label="questions" />
        <StatPill icon="F" value={plan.recommendedFlashcards} label="flashcards" />
        <StatPill icon="T" value={`${plan.estimatedMinutes} min`} label="today" />
      </div>
      {plan.focusSubjects?.length > 0 && (
        <div className="cdm-chips">
          {plan.focusSubjects.map(subject => (
            <span key={subject} className="spp-subject-chip">{subject}</span>
          ))}
        </div>
      )}
      {plan.conceptReviews?.length > 0 && (
        <div className="spp-tier-body" style={{ borderLeftColor: 'var(--status-critical)' }}>
          {plan.conceptReviews.map(item => (
            <div key={item.conceptId} className="spp-row">
              <div className="spp-row-main">
                {item.subject && <span className="spp-subject-chip">{item.subject}</span>}
                <span className="spp-name">{item.name}</span>
                <span className="spp-rec">{item.reason}</span>
                <span className="spp-rec">
                  {item.nextReviewAt?.slice(0, 10) <= today ? 'Due Today' : `Next Review ${item.nextReviewAt?.slice(0, 10) || 'TBD'}`}
                  {' '}· Interval {item.reviewIntervalDays} day{item.reviewIntervalDays !== 1 ? 's' : ''}
                </span>
              </div>
              <span className={`an-subj-badge an-subj-badge--${item.priority}`}>
                {TIER_CONFIG[item.priority]?.label ?? item.priority}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StudyPrescriptionPanel() {
  const { data: rx, loading, error } = useStudyPrescription()
  const { data: dailyPlan, loading: planLoading, error: planError } = useDailyStudyPlan()

  if (!getAuthToken()) return null
  if (loading || planLoading) return (
    <div className="an-intel-card spp-panel">
      <div className="an-intel-card-title">Study Prescription</div>
      <div className="mp-skeleton-rows">
        {[0, 1, 2, 3].map(i => <div key={i} className="mp-skeleton-row" />)}
      </div>
    </div>
  )
  // Silent on 401/403 — anonymous or expired session
  if (error?.status === 401 || error?.status === 403) return null
  if (planError?.status === 401 || planError?.status === 403) return null

  if (!rx?.enabled) {
    if (!rx) return null
    return (
      <div className="an-intel-card spp-panel">
        <div className="an-intel-card-title">Study Prescription</div>
        <DailyPlanSummary plan={dailyPlan} />
        <p className="an-intel-muted">
          {rx.reason ?? 'Complete more sessions to generate a personalized study prescription.'}
        </p>
      </div>
    )
  }

  const hasContent = rx.priority.length + rx.focus.length + rx.reinforced.length > 0

  return (
    <div className="an-intel-card spp-panel">
      <div className="spp-hdr">
        <div>
          <div className="an-intel-card-title">Study Prescription</div>
          <div className="an-intel-card-sub">Personalized from your mastery data</div>
        </div>
        <span className="spp-strategy-badge">Adaptive</span>
      </div>

      <DailyPlanSummary plan={dailyPlan} />

      {/* Summary stats */}
      <div className="spp-stats">
        <StatPill icon="⏱" value={`${rx.estimatedStudyTime} min`} label="est. session" />
        <StatPill icon="?" value={rx.recommendedQuestions}          label="questions" />
        <StatPill icon="▣" value={rx.recommendedFlashcards}          label="flashcards" />
      </div>

      {hasContent ? (
        <div className="spp-tiers">
          <TierSection tier="priority"   items={rx.priority}   />
          <TierSection tier="focus"      items={rx.focus}      />
          <TierSection tier="reinforced" items={rx.reinforced} />
        </div>
      ) : (
        <p className="an-intel-muted">
          All tracked concepts are on track (≥85% mastery) — no urgent study priorities.
        </p>
      )}

      <p className="spp-footnote">
        Estimates: priority ×5 min · focus ×3 min · reinforced ×2 min per concept
      </p>
    </div>
  )
}
