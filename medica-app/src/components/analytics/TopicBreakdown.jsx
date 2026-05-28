function severityLabel(index, total) {
  if (index === 0) return 'high'
  if (index <= 2 || index < Math.ceil(total / 2)) return 'medium'
  return 'low'
}

const SEVERITY_TEXT = { high: 'High', medium: 'Med', low: 'Low' }

export default function TopicBreakdown({ topicBreakdown, onViewAll }) {
  return (
    <div className="an-card">
      <div className="an-card-hdr-row">
        <div className="an-card-title">Topic Miss Map</div>
        {onViewAll && (
          <button className="an-link-btn" onClick={onViewAll}>View all</button>
        )}
      </div>
      <p className="an-card-sub">Coach session miss patterns by topic</p>
      <div className="an-topic-list">
        {topicBreakdown.map((item, i) => {
          const sev = severityLabel(i, topicBreakdown.length)
          return (
            <div key={item.name} className="an-topic-row">
              <span className={`an-topic-rank${i < 3 ? ` an-topic-rank--${i + 1}` : ''}`}>
                #{i + 1}
              </span>
              <span className="an-topic-name">{item.name}</span>
              <span className={`an-topic-severity an-topic-severity--${sev}`}>
                {SEVERITY_TEXT[sev]}
              </span>
              <span className="an-topic-count">{item.missed}×</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
