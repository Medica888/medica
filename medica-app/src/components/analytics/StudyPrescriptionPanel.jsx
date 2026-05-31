import { useState } from 'react'
import { getAuthToken, mastery as masteryApi } from '../../lib/apiClient'
import { useDailyStudyPlan, useDueReviews, useStudyPrescription } from '../../hooks/useMastery'

// Tier display config — reuses existing badge CSS from Phase 3.4
const TIER_CONFIG = {
  ontrack:    { label: 'On Track',   sub: 'Maintain with spaced review',    badgeClass: 'an-subj-badge--ontrack',    borderColor: 'var(--blue)'            },
  priority:   { label: 'Priority',   sub: 'Below passing threshold',        badgeClass: 'an-subj-badge--priority',   borderColor: 'var(--status-critical)' },
  focus:      { label: 'Focus',      sub: 'Developing — close to threshold', badgeClass: 'an-subj-badge--focus',      borderColor: 'var(--status-warn)'     },
  reinforced: { label: 'Reinforced', sub: 'Solid — maintain with review',   badgeClass: 'an-subj-badge--reinforced', borderColor: 'var(--status-stable)'   },
}

const EASE_META = [
  { result: 'again', label: 'Again', color: 'var(--status-critical)' },
  { result: 'hard',  label: 'Hard',  color: 'var(--status-warn)'     },
  { result: 'good',  label: 'Good',  color: 'var(--status-stable)'   },
  { result: 'easy',  label: 'Easy',  color: 'var(--blue)'            },
]

function previewInterval(current, ease) {
  switch (ease) {
    case 'again': return 1
    case 'hard':  return Math.max(current, 1)
    case 'good':  return Math.max(Math.round(current * 1.5), 1)
    case 'easy':  return Math.min(current * 2, 30)
    default:      return current
  }
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

const TIER_RANK = { priority: 0, focus: 1, reinforced: 2, ontrack: 3 }

function DailyPlanSummary({ plan, dueData }) {
  const [dismissed, setDismissed] = useState(() => new Set())
  const [pending,   setPending]   = useState(() => new Set())
  const [errors,    setErrors]    = useState(() => new Map())

  if (!plan) return null

  const today = new Date().toISOString().slice(0, 10)

  const handleEase = async (conceptId, currentInterval, result) => {
    if (pending.has(conceptId)) return
    setPending(prev => new Set([...prev, conceptId]))
    setErrors(prev => { const m = new Map(prev); m.delete(conceptId); return m })
    try {
      await masteryApi.reviewConcept(conceptId, result)
      setDismissed(prev => new Set([...prev, conceptId]))
    } catch {
      setErrors(prev => new Map([...prev, [conceptId, 'Review failed — try again']]))
    } finally {
      setPending(prev => { const s = new Set(prev); s.delete(conceptId); return s })
    }
  }

  // ── Build merged queue: due (SRS-scheduled) + prescribed (daily plan only) ─
  const dueReviews = dueData?.reviews ?? []
  const dueIds     = new Set(dueReviews.map(r => r.conceptId))

  // Prescribed items not already covered by the due queue
  const prescribed = (plan.conceptReviews ?? []).filter(r => !dueIds.has(r.conceptId))

  // Sort due items: most overdue first, then earliest nextReviewAt
  const sortedDue = [...dueReviews].sort((a, b) => {
    const diff = (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0)
    if (diff !== 0) return diff
    return new Date(a.nextReviewAt ?? 0).getTime() - new Date(b.nextReviewAt ?? 0).getTime()
  })

  // Sort prescribed: weakest tier first
  const sortedPrescribed = [...prescribed].sort(
    (a, b) => (TIER_RANK[a.priority] ?? 3) - (TIER_RANK[b.priority] ?? 3)
  )

  const mergedQueue  = [...sortedDue, ...sortedPrescribed]
  const overdueCount = dueData?.overdueCount ?? 0
  const visibleQueue = mergedQueue.filter(item => !dismissed.has(item.conceptId))

  return (
    <div className="spp-tier">
      <div className="spp-tier-hdr">
        <span className="an-subj-badge an-subj-badge--priority">Today</span>
        {overdueCount > 0 && (
          <span className="an-subj-badge an-subj-badge--priority">{overdueCount} overdue</span>
        )}
        <span className="spp-tier-sub">{plan.summary}</span>
        <span className="spp-tier-count">{visibleQueue.length} concept{visibleQueue.length !== 1 ? 's' : ''}</span>
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
      {visibleQueue.length > 0 && (
        <div className="spp-tier-body" style={{ borderLeftColor: 'var(--status-critical)' }}>
          {visibleQueue.map(item => {
            const isPending   = pending.has(item.conceptId)
            const errorMsg    = errors.get(item.conceptId)
            const daysOverdue = item.daysOverdue ?? 0
            const statusLabel =
              daysOverdue > 0         ? `${daysOverdue}d overdue`                                  :
              item.nextReviewAt?.slice(0, 10) <= today ? 'Due Today'                               :
              item.nextReviewAt       ? `Next Review ${item.nextReviewAt.slice(0, 10)}`            :
              'Prescribed'
            return (
              <div key={item.conceptId} className="spp-row">
                <div className="spp-row-main">
                  {item.subject && <span className="spp-subject-chip">{item.subject}</span>}
                  <span className="spp-name">{item.name}</span>
                  {item.reason && <span className="spp-rec">{item.reason}</span>}
                  <span className="spp-rec">
                    {statusLabel}
                    {' '}· Interval {item.reviewIntervalDays} day{item.reviewIntervalDays !== 1 ? 's' : ''}
                  </span>
                  <div className="spp-ease-row" role="group" aria-label={`Rate review for ${item.name}`}>
                    {EASE_META.map(({ result, label, color }) => (
                      <button
                        key={result}
                        type="button"
                        className="spp-ease-btn"
                        disabled={isPending}
                        onClick={() => handleEase(item.conceptId, item.reviewIntervalDays, result)}
                        aria-label={`${label} — ${previewInterval(item.reviewIntervalDays, result)}d`}
                      >
                        <span className="spp-ease-label" style={{ color }}>{label}</span>
                        <span className="spp-ease-interval">{previewInterval(item.reviewIntervalDays, result)}d</span>
                      </button>
                    ))}
                  </div>
                  {errorMsg && <span className="spp-ease-error" role="alert">{errorMsg}</span>}
                </div>
                <span className={`an-subj-badge an-subj-badge--${item.priority}`}>
                  {TIER_CONFIG[item.priority]?.label ?? item.priority}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function StudyPrescriptionPanel() {
  const { data: rx,        loading,     error      } = useStudyPrescription()
  const { data: dailyPlan, loading: planLoading, error: planError } = useDailyStudyPlan()
  const { data: dueData,   loading: dueLoading   } = useDueReviews()

  if (!getAuthToken()) return null
  if (loading || planLoading || dueLoading) return (
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
  // dueError: fall back to empty due list — do not block the panel

  if (!rx?.enabled) {
    if (!rx) return null
    return (
      <div className="an-intel-card spp-panel">
        <div className="an-intel-card-title">Study Prescription</div>
        <DailyPlanSummary plan={dailyPlan} dueData={dueData} />
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

      <DailyPlanSummary plan={dailyPlan} dueData={dueData} />

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
