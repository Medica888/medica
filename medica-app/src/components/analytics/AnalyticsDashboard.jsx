import { useMemo, useState } from 'react'
import { buildAnalyticsData } from '../../lib/analyticsEngine'
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts'
import MasteryPanel from './MasteryPanel'
import StudyPrescriptionPanel from './StudyPrescriptionPanel'
import ProgressPanel from './ProgressPanel'
import ProgressTrendPanel from './ProgressTrendPanel'
import { useReadiness } from '../../hooks/useMastery'

const TIME_FILTERS = ['Week', 'Month', 'All time']

const SUBJECT_STATUS = (pct) => {
  if (pct < 65) return { label: 'Priority',   variant: 'priority' }
  if (pct < 75) return { label: 'Focus',       variant: 'focus' }
  if (pct < 85) return { label: 'Reinforced',  variant: 'reinforced' }
  return              { label: 'On track',     variant: 'ontrack' }
}

export default function AnalyticsDashboard({ onNavigate }) {
  const data = useMemo(() => buildAnalyticsData(), [])
  const [timeFilter, setTimeFilter] = useState('All time')
  const rdHook = useReadiness()

  if (data.empty) {
    return (
      <div className="an-page">
        <div className="an-scroll">
          <div className="an-empty">
            <div className="an-empty-icon">📊</div>
            <div className="an-empty-title">No Session Data Yet</div>
            <p className="an-empty-body">
              Complete a Practice, Coach, or Exam session to unlock your Analytics dashboard.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const {
    overview, subjectBreakdown,
    mistakeDiagnosis, studyPrescription, trends,
    repeatedMistakes,
  } = data

  // Derived readiness metrics
  const readinessPct = overview.overallAccuracy != null ? Math.round(overview.overallAccuracy) : 0
  const testedSubjects = subjectBreakdown.filter(s => s.total >= 2).length
  const knowledgeCoverage = Math.min(Math.round((testedSubjects / Math.max(subjectBreakdown.length, 1)) * 100), 100)
  const accuracyConsistency = overview.overallAccuracy != null ? Math.round(overview.overallAccuracy) : 0
  const retentionStability = overview.flashcardsDue != null && overview.flashcardsDue > 0
    ? Math.max(40, Math.round(100 - (overview.flashcardsDue / 20) * 10))
    : 70

  return (
    <div className="an-page">
      <div className="an-scroll">

        {/* Page header */}
        <div className="an-intel-hdr">
          <div>
            <h1 className="an-intel-title">Analytics</h1>
            <p className="an-intel-sub">Performance Intelligence · Step 1</p>
          </div>
          <div className="an-time-filter" role="group" aria-label="Time filter">
            {TIME_FILTERS.map(t => (
              <button
                key={t}
                type="button"
                className={`an-time-btn${timeFilter === t ? ' active' : ''}`}
                onClick={() => setTimeFilter(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="an-intel-grid">

          {/* ── Left column ── */}
          <div className="an-intel-left">

            {/* Score Trajectory */}
            <div className="an-intel-card">
              <div className="an-traj-hdr">
                <div>
                  <div className="an-intel-card-title">Score Trajectory</div>
                  <div className="an-intel-card-sub">Predicted score over {trends.length} session{trends.length !== 1 ? 's' : ''}</div>
                </div>
                {overview.latestMedicaScore != null && (
                  <div className="an-traj-badge">
                    <span className="an-traj-score">{overview.latestMedicaScore}</span>
                    <span className="an-traj-badge-lbl">CURRENT</span>
                  </div>
                )}
              </div>
              {trends.length >= 2 ? (
                <div className="an-traj-chart-wrap">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={trends} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#2E64C8" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2E64C8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
                      <XAxis
                        dataKey="index"
                        tick={{ fontSize: 10, fill: 'var(--t4)' }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 25, 50, 75, 100]}
                        tick={{ fontSize: 10, fill: 'var(--t4)' }}
                        axisLine={false} tickLine={false}
                      />
                      <ReferenceLine
                        y={80} stroke="var(--border)" strokeDasharray="4 3"
                        label={{ value: 'Target', position: 'right', fontSize: 10, fill: 'var(--t4)' }}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                        labelFormatter={v => `Session ${v}`}
                        formatter={(v, name) => [`${v}${name === 'accuracy' ? '%' : ''}`, name === 'medicaScore' ? 'Medica Score' : 'Accuracy']}
                      />
                      <Area
                        type="monotone" dataKey="medicaScore"
                        stroke="#2E64C8" strokeWidth={2}
                        fill="url(#scoreGrad)"
                        dot={{ r: 3, fill: '#2E64C8', strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: '#2E64C8', strokeWidth: 0 }}
                      />
                      <Area
                        type="monotone" dataKey="accuracy"
                        stroke="var(--status-warn)" strokeWidth={1.5}
                        fill="none" strokeDasharray="5 3"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="an-traj-legend">
                    <span className="an-traj-leg-item"><span className="an-traj-leg-line" style={{ background: '#2E64C8' }} />Predicted score</span>
                    <span className="an-traj-leg-item"><span className="an-traj-leg-dash" />Accuracy</span>
                  </div>
                </div>
              ) : (
                <div className="an-traj-empty">Complete more sessions to see your trajectory.</div>
              )}
            </div>

            {/* Subject Performance table */}
            <div className="an-intel-card">
              <div className="an-intel-card-title">Subject Performance</div>
              {subjectBreakdown.length === 0 ? (
                <p className="an-intel-muted">No subject data yet.</p>
              ) : (
                <table className="an-subj-table">
                  <thead>
                    <tr>
                      <th className="an-subj-th">Subject</th>
                      <th className="an-subj-th an-subj-th--num">Done</th>
                      <th className="an-subj-th an-subj-th--num">Accuracy</th>
                      <th className="an-subj-th an-subj-th--num">Trend</th>
                      <th className="an-subj-th an-subj-th--right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjectBreakdown.slice(0, 6).map((s, i) => {
                      const st = SUBJECT_STATUS(s.percentage)
                      return (
                        <tr key={i} className="an-subj-row">
                          <td className="an-subj-name">{s.name}</td>
                          <td className="an-subj-num">{s.total}</td>
                          <td className={`an-subj-num an-subj-acc--${st.variant}`}>{Math.round(s.percentage)}%</td>
                          <td className="an-subj-num">
                            <TrendBars pct={s.percentage} variant={st.variant} />
                          </td>
                          <td className="an-subj-status">
                            <span className={`an-subj-badge an-subj-badge--${st.variant}`}>{st.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

          </div>

          {/* ── Right column ── */}
          <div className="an-intel-right">

            {/* Readiness Estimate — dark card */}
            <ReadinessCard
              localPct={readinessPct}
              localRows={[
                { label: 'Knowledge coverage',   value: knowledgeCoverage },
                { label: 'Accuracy consistency',  value: accuracyConsistency },
                { label: 'Retention stability',   value: retentionStability, variant: 'warn' },
              ]}
              rdHook={rdHook}
            />

            {/* Mistake Intelligence */}
            <div className="an-intel-card an-mistake-card">
              <div className="an-intel-card-title">Mistake Intelligence</div>

              {/* Primary failure mode */}
              {mistakeDiagnosis?.topCategory && (
                <div className="an-mistake-primary">
                  <div className="an-mistake-primary-label">PRIMARY FAILURE MODE</div>
                  <div className="an-mistake-primary-name">{mistakeDiagnosis.topCategory}</div>
                  {mistakeDiagnosis.topCategoryCount > 0 && (
                    <p className="an-mistake-primary-desc">
                      {mistakeDiagnosis.topCategoryCount} error{mistakeDiagnosis.topCategoryCount !== 1 ? 's' : ''} in this category — {Math.round((mistakeDiagnosis.topCategoryCount / (overview.totalQuestions - overview.totalCorrect || 1)) * 100)}% of wrong answers
                    </p>
                  )}
                </div>
              )}

              {/* Mistake clusters */}
              {repeatedMistakes.length > 0 && (
                <div className="an-mistake-clusters">
                  <div className="an-mistake-cluster-label">MISTAKE CLUSTERS</div>
                  {repeatedMistakes.slice(0, 3).map((m, i) => (
                    <div key={i} className="an-mistake-cluster-row">
                      <span className="an-mistake-cluster-name">
                        {[m.subject, m.system].filter(Boolean).join(' · ') || 'Mixed'}
                      </span>
                      <span className="an-mistake-cluster-count">{m.count} error{m.count !== 1 ? 's' : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Recommended repair */}
              {studyPrescription.length > 0 && (
                <div className="an-mistake-repair">
                  <div className="an-mistake-repair-label">RECOMMENDED REPAIR</div>
                  <p className="an-mistake-repair-text">{studyPrescription[0].action}</p>
                </div>
              )}

              {!mistakeDiagnosis?.topCategory && repeatedMistakes.length === 0 && (
                <p className="an-intel-muted">Complete more sessions to surface mistake patterns.</p>
              )}

              {onNavigate && (
                <button
                  type="button"
                  className="an-mistake-cta"
                  onClick={() => onNavigate('create-quiz')}
                >
                  Start Targeted Session →
                </button>
              )}
            </div>

          </div>
        </div>

        {/* ── Progress tracking (backend-powered; needs ≥1 snapshot to show) */}
        <ProgressPanel />

        {/* ── Concept Mastery (backend-powered, gracefully hidden when offline) */}
        <MasteryPanel />

        {/* ── Study Prescription (backend-powered, derived from mastery data) */}
        <StudyPrescriptionPanel />

        {/* ── Learning Timeline (backend-powered, 3-series trend charts) */}
        <ProgressTrendPanel />

        <p className="an-footer-disclaimer">
          Medica Score is an internal readiness estimate, not an official USMLE prediction.
        </p>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TrendBars({ pct, variant }) {
  const filled = pct >= 85 ? 4 : pct >= 75 ? 3 : pct >= 65 ? 2 : 1
  const colors = { priority: '#6D2F3F', focus: '#7D6338', reinforced: '#355C68', ontrack: '#2E64C8' }
  const color = colors[variant] || '#2E64C8'
  return (
    <span className="an-trend-bars" aria-hidden="true">
      {[1, 2, 3, 4].map(n => (
        <span key={n} className="an-trend-bar" style={{ background: n <= filled ? color : 'var(--border)' }} />
      ))}
    </span>
  )
}

function ReadinessRow({ label, value, variant }) {
  const color = variant === 'warn' ? '#D4A84B' : '#2E64C8'
  return (
    <div className="an-readiness-row">
      <span className="an-readiness-row-label">{label}</span>
      <span className="an-readiness-row-val">{value}%</span>
      <div className="an-readiness-bar-wrap">
        <div className="an-readiness-bar" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  )
}

const READINESS_STATUS_COLOR = {
  'Exam Ready':              '#2E64C8',
  'Approaching Readiness':   'var(--status-stable)',
  'Developing':              'var(--status-warn)',
  'Needs Intensive Review':  'var(--status-critical)',
}

function ReadinessCard({ localPct, localRows, rdHook }) {
  const rd = rdHook.data

  // Derive trend direction from the trend contribution component.
  // components.trend ∈ [0,15]; midpoint 7.5 = stable.
  const trendVal = rd?.components?.trend ?? 7.5
  const trendDir = trendVal > 8 ? 'up' : trendVal < 7 ? 'down' : 'flat'
  const trendGlyph = trendDir === 'up' ? '↑' : trendDir === 'down' ? '↓' : '→'

  // Normalize weighted contributions back to 0–100 for bar display
  const compRows = rd ? [
    { label: 'Mastery',      value: Math.round(rd.components.mastery     / 50 * 100) },
    { label: 'Confidence',   value: Math.round(rd.components.confidence  / 20 * 100) },
    { label: 'Consistency',  value: Math.round(rd.components.consistency / 15 * 100) },
  ] : localRows

  const displayPct   = rd ? rd.overallReadiness : localPct
  const statusLabel  = rd?.status ?? null
  const statusColor  = statusLabel ? (READINESS_STATUS_COLOR[statusLabel] ?? '#2E64C8') : null
  const totalConcepts = rd ? (rd.distribution.priority + rd.distribution.focus + rd.distribution.reinforced + rd.distribution.ontrack) : null

  return (
    <div className="an-readiness-card">
      <div className="an-readiness-label">EXAM READINESS</div>
      <div className="an-readiness-pct">
        {displayPct}<span className="an-readiness-pct-unit">%</span>
        <span className="an-readiness-ready"> ready</span>
      </div>

      {statusLabel && (
        <div className="an-readiness-status">
          <span
            className="an-readiness-badge"
            style={{ borderColor: statusColor, color: statusColor }}
            aria-label={`Readiness status: ${statusLabel}`}
          >
            {statusLabel}
          </span>
          <span className={`ptp-delta ptp-delta--${trendDir}`} aria-label={`Trend: ${trendDir}`}>
            {trendGlyph}
          </span>
        </div>
      )}

      {totalConcepts != null && totalConcepts > 0 && totalConcepts < 20 && (
        <p className="an-readiness-hint">
          Based on {totalConcepts} concept{totalConcepts !== 1 ? 's' : ''} — accuracy improves with more practice
        </p>
      )}

      <div className="an-readiness-bars">
        {compRows.map(r => (
          <ReadinessRow
            key={r.label}
            label={r.label}
            value={r.value}
            variant={r.variant}
          />
        ))}
      </div>
    </div>
  )
}
