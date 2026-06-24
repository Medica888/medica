import { isAuthenticated } from '../../lib/apiClient'
import MasteryTimelineChart from './MasteryTimelineChart'

// ── Local helpers ──────────────────────────────────────────────────────────────

function DeltaBadge({ value, invert = false }) {
  if (value == null || value === 0) return <span className="ptp-delta ptp-delta--flat">—</span>
  const improved = invert ? value < 0 : value > 0
  const sign     = value > 0 ? '+' : ''
  const cls      = improved ? 'ptp-delta--up' : 'ptp-delta--down'
  const display  = Number.isInteger(value) ? `${sign}${value}` : `${sign}${value.toFixed(1)}`
  return <span className={`ptp-delta ${cls}`}>{display}</span>
}

function TrendCard({
  title, sub, current, previous, unit = '', invert = false,
  chartData, color, gradientId,
}) {
  const delta = current != null && previous != null ? current - previous : null

  const fmt = (v) => {
    if (v == null) return '—'
    if (typeof v === 'number' && !Number.isInteger(v)) return `${Math.round(v * 100)}${unit}`
    return `${v}${unit}`
  }

  return (
    <div className="ptp-card">
      <div className="ptp-card-hdr">
        <span className="ptp-card-title">{title}</span>
        {sub && <span className="ptp-card-sub">{sub}</span>}
      </div>

      <div className="ptp-card-current">
        <span className="ptp-card-val">{fmt(current)}</span>
        {previous != null && (
          <span className="ptp-card-prev">from {fmt(previous)}</span>
        )}
        {delta != null && <DeltaBadge value={delta} invert={invert} />}
      </div>

      <MasteryTimelineChart
        data={chartData}
        color={color}
        gradientId={gradientId}
        unit={unit}
        height={120}
        invert={invert}
      />
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────────────────

export default function ProgressTrendPanel({ progressHook, timelineHook }) {
  const { data: progress, loading: pLoading, error: pErr } = progressHook
  const { data: timeline, loading: tLoading }              = timelineHook

  if (!isAuthenticated()) return null
  if (pLoading || tLoading) return (
    <div className="an-intel-card ptp-panel">
      <div className="an-intel-card-title">Learning Timeline</div>
      <div className="mp-skeleton-rows">
        {[0, 1, 2].map(i => <div key={i} className="mp-skeleton-row" />)}
      </div>
    </div>
  )
  if (pErr?.status === 401 || pErr?.status === 403) return null

  // Need at least 1 snapshot to show anything
  if (!progress || progress.sessionCount === 0) {
    if (!progress) return null
    return (
      <div className="an-intel-card ptp-panel">
        <div className="an-intel-card-title">Learning Timeline</div>
        <p className="an-intel-muted">Complete your first session to start building your learning timeline.</p>
      </div>
    )
  }

  const trend = timeline?.trend ?? []

  // Build per-series chart data from the trend points
  const masteryData  = trend.map(p => ({ sessionNumber: p.sessionNumber, value: Math.round(p.avgMastery * 100) }))
  const priorityData = trend.map(p => ({ sessionNumber: p.sessionNumber, value: p.priorityCount }))
  const weakData     = trend.map(p => ({ sessionNumber: p.sessionNumber, value: p.priorityCount + p.focusCount }))

  return (
    <div className="an-intel-card ptp-panel">
      <div className="ptp-hdr">
        <div>
          <div className="an-intel-card-title">Learning Timeline</div>
          <div className="an-intel-card-sub">
            {progress.sessionCount} session{progress.sessionCount !== 1 ? 's' : ''} · mastery snapshots
          </div>
        </div>
        {progress.sessionCount < 2 && (
          <span className="ptp-hint">1 more session needed for trend lines</span>
        )}
      </div>

      <div className="ptp-grid">
        <TrendCard
          title="Overall Mastery"
          sub="avg across all concepts"
          current={progress.currentMastery}
          previous={progress.previousMastery}
          unit="%"
          chartData={masteryData}
          color="#2E64C8"
          gradientId="ptp-mastery"
        />

        <TrendCard
          title="Priority Concepts"
          sub="mastery < 65% — needs work"
          current={progress.priorityConcepts.current}
          previous={progress.priorityConcepts.previous}
          invert
          chartData={priorityData}
          color="var(--status-critical)"
          gradientId="ptp-priority"
        />

        <TrendCard
          title="Weak Concepts"
          sub="mastery < 75% — priority + focus"
          current={progress.weakConcepts.current}
          previous={progress.weakConcepts.previous}
          invert
          chartData={weakData}
          color="var(--status-warn)"
          gradientId="ptp-weak"
        />
      </div>
    </div>
  )
}
