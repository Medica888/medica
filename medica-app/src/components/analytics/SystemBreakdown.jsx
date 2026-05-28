function barColor(pct) {
  return pct >= 70 ? 'var(--green)' : pct >= 55 ? 'var(--orange)' : 'var(--red)'
}

const R = 19
const CIRCUMFERENCE = 2 * Math.PI * R

export default function SystemBreakdown({ systemBreakdown, onViewAll }) {
  return (
    <div className="an-card">
      <div className="an-card-hdr-row">
        <div className="an-card-title">System Performance</div>
        {onViewAll && (
          <button className="an-link-btn" onClick={onViewAll}>View all</button>
        )}
      </div>
      <div className="an-sys-grid">
        {systemBreakdown.map(item => {
          const offset = CIRCUMFERENCE * (1 - item.percentage / 100)
          const color = barColor(item.percentage)
          return (
            <div key={item.name} className="an-sys-item">
              <div className="an-sys-radial">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r={R} stroke="var(--border)" strokeWidth="4" />
                  <circle
                    cx="24" cy="24" r={R}
                    stroke={color}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset .45s cubic-bezier(.4,0,.2,1)' }}
                  />
                </svg>
                <span className="an-sys-pct-label" style={{ color }}>{item.percentage}%</span>
              </div>
              <span className="an-sys-name" title={item.name}>{item.name}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
