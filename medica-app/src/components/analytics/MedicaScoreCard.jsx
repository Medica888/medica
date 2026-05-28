export default function MedicaScoreCard({ overview }) {
  const { latestMedicaScore, avgMedicaScore, latestReadiness } = overview
  const scoreColor =
    latestMedicaScore >= 80 ? 'var(--status-stable)' :
    latestMedicaScore >= 65 ? 'var(--blue)' :
    latestMedicaScore >= 50 ? 'var(--status-warn)' :
    'var(--status-critical)'

  return (
    <div className="an-card an-card--score">
      <div className="an-card-title">Readiness Estimate</div>
      <div className="an-score-row">
        <div className="an-score-main" style={{ color: scoreColor }}>{latestMedicaScore}</div>
        <div className="an-score-meta">
          <span className="an-readiness-badge" style={{ color: scoreColor, borderColor: scoreColor }}>
            {latestReadiness}
          </span>
          <span className="an-score-avg">Avg: {avgMedicaScore}</span>
        </div>
      </div>
      <div className="an-score-bar-wrap">
        <div className="an-score-bar" style={{ width: `${latestMedicaScore}%`, background: scoreColor }} />
      </div>
      <p className="an-disclaimer">
        Internal readiness estimate based on recent performance patterns.
      </p>
    </div>
  )
}
