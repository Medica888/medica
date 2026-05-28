export default function BenchmarkIntelligence({ sessions }) {
  const examSessions = (sessions || []).filter(s => s.mode === 'exam' && (s.total ?? 0) === 40)

  if (examSessions.length === 0) return null

  const latest = examSessions[0]
  const latestScore = latest.percentage ?? 0
  const best = Math.max(...examSessions.map(s => s.percentage ?? 0))

  return (
    <div className="an-section">
      <div className="an-section-label">Benchmark Intelligence</div>
      <div className="an-card an-bench-card">
        <div className="an-bench-header">
          <div>
            <div className="an-bench-sub">
              Standardized 40-question block · {examSessions.length} block{examSessions.length !== 1 ? 's' : ''} completed
            </div>
          </div>
        </div>
        <div className="an-bench-grid">
          <div className="an-bench-stat">
            <div className="an-bench-stat-val">{latestScore}%</div>
            <div className="an-bench-stat-lbl">Your Score</div>
          </div>
          <div className="an-bench-stat">
            <div className="an-bench-stat-val an-bench-stat-val--na">—</div>
            <div className="an-bench-stat-lbl">Platform Median</div>
            <div className="an-bench-stat-note">Expanding dataset</div>
          </div>
          <div className="an-bench-stat">
            <div className="an-bench-stat-val an-bench-stat-val--na">—</div>
            <div className="an-bench-stat-lbl">Difference</div>
          </div>
          <div className="an-bench-stat">
            <div className="an-bench-stat-val">{best}%</div>
            <div className="an-bench-stat-lbl">Best Score</div>
          </div>
        </div>
        <p className="an-bench-note">
          Percentile ranking and cohort comparison will become available as the Medica platform dataset grows.
        </p>
      </div>
    </div>
  )
}
