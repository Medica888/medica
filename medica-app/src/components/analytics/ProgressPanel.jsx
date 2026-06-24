import { useAuthState } from '../../hooks/useAuthState'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'

function Delta({ value, label, invert = false }) {
  if (value == null) return (
    <div className="pp-delta">
      <span className="pp-delta-val pp-delta--neutral">—</span>
      <span className="pp-delta-label">{label}</span>
    </div>
  )
  const improved = invert ? value < 0 : value > 0
  const sign     = value > 0 ? '+' : ''
  const cls      = improved ? 'pp-delta--up' : value < 0 ? 'pp-delta--down' : 'pp-delta--neutral'
  return (
    <div className="pp-delta">
      <span className={`pp-delta-val ${cls}`}>{sign}{typeof value === 'number' ? (Number.isInteger(value) ? value : value.toFixed(2)) : value}</span>
      <span className="pp-delta-label">{label}</span>
    </div>
  )
}

function StatCard({ label, current, previous, unit = '', invert = false }) {
  const delta = (current != null && previous != null) ? current - previous : null
  return (
    <div className="pp-stat-card">
      <div className="pp-stat-label">{label}</div>
      <div className="pp-stat-main">
        <span className="pp-stat-val">
          {current != null ? `${typeof current === 'number' && !Number.isInteger(current) ? (current * 100).toFixed(0) : current}${unit}` : '—'}
        </span>
        {previous != null && (
          <span className="pp-stat-prev">
            from {typeof previous === 'number' && !Number.isInteger(previous) ? (previous * 100).toFixed(0) : previous}{unit}
          </span>
        )}
      </div>
      {delta != null && <Delta value={delta} label="vs last session" invert={invert} />}
    </div>
  )
}

export default function ProgressPanel({ progressHook, timelineHook }) {
  const authState = useAuthState()
  const { data: progress, loading: pLoading, error: pErr } = progressHook
  const { data: timeline, loading: tLoading }              = timelineHook

  if (!authState.isAuthenticated) return null
  if (pLoading && tLoading) return (
    <div className="an-intel-card pp-panel">
      <div className="an-intel-card-title">Learning Progress</div>
      <div className="mp-skeleton-rows">{[0,1,2].map(i => <div key={i} className="mp-skeleton-row" />)}</div>
    </div>
  )
  if (pErr?.status === 401 || pErr?.status === 403) return null

  // Need at least one session to show anything
  if (!progress || progress.sessionCount === 0) {
    if (!progress) return null
    return (
      <div className="an-intel-card pp-panel">
        <div className="an-intel-card-title">Learning Progress</div>
        <p className="an-intel-muted">Complete your first session to begin tracking progress.</p>
      </div>
    )
  }

  const trend     = timeline?.trend ?? []
  const chartData = trend.map((p, i) => ({
    session:   i + 1,
    mastery:   Math.round(p.avgMastery * 100),
    priority:  p.priorityCount,
    weak:      p.priorityCount + p.focusCount,
  }))

  const improvementRate  = timeline ? (typeof timeline.improvementRate === 'number'  ? (timeline.improvementRate  * 100).toFixed(1) : null) : null
  const learningVelocity = timeline ? (typeof timeline.learningVelocity === 'number' ? timeline.learningVelocity : null) : null

  return (
    <div className="an-intel-card pp-panel">
      <div className="pp-hdr">
        <div>
          <div className="an-intel-card-title">Learning Progress</div>
          <div className="an-intel-card-sub">{progress.sessionCount} session{progress.sessionCount !== 1 ? 's' : ''} tracked</div>
        </div>
        {progress.sessionCount >= 2 && (
          <div className="pp-velocity">
            {learningVelocity != null && Number(learningVelocity) < 0 && (
              <span className="pp-velocity-badge pp-velocity--up">Improving ↑</span>
            )}
            {learningVelocity != null && Number(learningVelocity) > 0 && (
              <span className="pp-velocity-badge pp-velocity--down">Slipping ↓</span>
            )}
            {learningVelocity != null && Number(learningVelocity) === 0 && (
              <span className="pp-velocity-badge pp-velocity--flat">Steady →</span>
            )}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="pp-stats">
        <StatCard
          label="Overall Mastery"
          current={progress.currentMastery}
          previous={progress.previousMastery}
          unit="%"
        />
        <StatCard
          label="Priority Concepts"
          current={progress.priorityConcepts.current}
          previous={progress.priorityConcepts.previous}
          invert
        />
        <StatCard
          label="Weak Concepts"
          current={progress.weakConcepts.current}
          previous={progress.weakConcepts.previous}
          invert
        />
        {improvementRate != null && progress.sessionCount >= 2 && (
          <StatCard
            label="Mastery/Session"
            current={parseFloat(improvementRate)}
            previous={null}
            unit="%"
          />
        )}
      </div>

      {/* Trend chart — only when ≥2 sessions */}
      {chartData.length >= 2 && (
        <div className="pp-chart-wrap">
          <div className="pp-chart-label">Mastery Trajectory</div>
          <p className="sr-only">
            Mastery across {chartData.length} sessions, from {chartData[0].mastery}% to {chartData[chartData.length - 1].mastery}%.
          </p>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="ppGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2E64C8" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#2E64C8" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-s)" vertical={false} />
              <XAxis
                dataKey="session"
                tick={{ fontSize: 10, fill: 'var(--t4)' }}
                axisLine={false} tickLine={false}
                tickFormatter={v => `S${v}`}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: 'var(--t4)' }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={v => `Session ${v}`}
                formatter={(v) => [`${v}%`, 'Mastery']}
              />
              <Area
                type="monotone" dataKey="mastery"
                stroke="#2E64C8" strokeWidth={2}
                fill="url(#ppGrad)"
                dot={{ r: 3, fill: '#2E64C8', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length < 2 && (
        <p className="an-intel-muted" style={{ marginTop: 0 }}>
          Complete one more session to see your mastery trajectory.
        </p>
      )}
    </div>
  )
}
