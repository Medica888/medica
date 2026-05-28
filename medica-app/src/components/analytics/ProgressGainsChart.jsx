function clampPercent(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return 0
  return Math.min(100, Math.max(0, Number(value)))
}

function normalizeProgressItem(item) {
  if (!item || !item.name) return null

  const previous = clampPercent(
    item.previous  ?? item.before    ?? item.oldScore ?? item.start ?? item.older ?? 0
  )
  const current = clampPercent(
    item.current   ?? item.after     ?? item.newScore ?? item.end   ?? item.score ?? item.recent ?? 0
  )
  const rawGain = item.gain != null ? Number(item.gain) : (current - previous)
  const gain    = isNaN(rawGain) ? 0 : rawGain

  if (gain <= 0) return null
  return { name: item.name, previous, current, gain: Math.round(gain) }
}

export default function ProgressGainsChart({ items = [] }) {
  const rows = items
    .map(normalizeProgressItem)
    .filter(Boolean)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 5)

  return (
    <div className="an-card">
      <div className="an-card-title">Top 5 Progress Gains</div>
      {rows.length === 0 ? (
        <p className="an-progress-empty">
          No progress gains detected yet. Complete more mixed blocks to unlock trend analysis.
        </p>
      ) : (
        <div className="an-progress-chart">
          {rows.map((item, i) => {
            const segLeft  = Math.min(item.previous, item.current)
            const segWidth = Math.abs(item.current - item.previous)
            return (
              <div key={i} className="an-progress-row">
                <div className="an-progress-row-head">
                  <div className="an-progress-left">
                    <span className={`an-progress-rank${i < 3 ? ` an-progress-rank--${i + 1}` : ''}`}>
                      #{i + 1}
                    </span>
                    <span className="an-progress-title">{item.name}</span>
                  </div>
                  <div className="an-progress-values">
                    <span className="an-progress-prev-val">{item.previous}%</span>
                    <span className="an-progress-arrow">→</span>
                    <span className="an-progress-curr-val">{item.current}%</span>
                    <span className="an-progress-gain">+{item.gain}%</span>
                  </div>
                </div>

                <div className="an-progress-track">
                  <div className="an-progress-track-bg" />
                  <div
                    className="an-progress-range"
                    style={{ left: `${segLeft}%`, width: `${segWidth}%` }}
                  />
                  <div
                    className="an-progress-marker an-progress-marker-start"
                    style={{ left: `${item.previous}%` }}
                  />
                  <div
                    className="an-progress-marker an-progress-marker-end"
                    style={{ left: `${item.current}%` }}
                  />
                </div>

                <div className="an-progress-axis">
                  <span>0%</span>
                  <span>100%</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
