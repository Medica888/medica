function barColor(pct) {
  return pct >= 70 ? 'var(--green)' : pct >= 55 ? 'var(--orange)' : 'var(--red)'
}

export default function SubjectBreakdown({ subjectBreakdown, onViewAll }) {
  return (
    <div className="an-card">
      <div className="an-card-hdr-row">
        <div className="an-card-title">Subject Performance</div>
        {onViewAll && (
          <button className="an-link-btn" onClick={onViewAll}>View all</button>
        )}
      </div>
      <div className="an-bd-list">
        {subjectBreakdown.map(item => (
          <div key={item.name} className="an-bd-row">
            <span className="an-bd-name">{item.name}</span>
            <div className="an-bd-bar-wrap">
              <div className="an-bd-bar" style={{ width: `${item.percentage}%`, background: barColor(item.percentage) }} />
            </div>
            <span className="an-bd-stat">{item.correct}/{item.total}</span>
            <span className="an-bd-pct" style={{ color: barColor(item.percentage) }}>{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
