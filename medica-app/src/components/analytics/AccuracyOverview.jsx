export default function AccuracyOverview({ overview }) {
  const {
    totalSessions, totalQuestions, overallAccuracy,
    practiceCount, coachCount, examCount,
    practiceAccuracy, coachAccuracy, examAccuracy,
  } = overview

  const modes = [
    { label: 'Practice', count: practiceCount, accuracy: practiceAccuracy },
    { label: 'Coach',    count: coachCount,    accuracy: coachAccuracy },
    { label: 'Exam',     count: examCount,     accuracy: examAccuracy },
  ].filter(m => m.count > 0)

  return (
    <div className="an-card">
      <div className="an-card-title">Performance Stability</div>
      <div className="an-accuracy-main">
        <span className="an-accuracy-pct" style={{ color: 'var(--blue)' }}>{overallAccuracy}%</span>
        <span className="an-accuracy-lbl">Overall</span>
      </div>
      <div className="an-accuracy-bar-wrap">
        <div className="an-accuracy-bar" style={{ width: `${overallAccuracy}%`, background: 'var(--blue)' }} />
      </div>
      {modes.length > 0 && (
        <div className="an-mode-list">
          {modes.map(m => (
            <div key={m.label} className="an-mode-row">
              <span className="an-mode-label">{m.label}</span>
              <span className="an-mode-count">{m.count} session{m.count !== 1 ? 's' : ''}</span>
              {m.accuracy != null && (
                <span className="an-mode-acc" style={{ color: 'var(--t2)' }}>
                  {m.accuracy}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="an-totals">{totalQuestions} questions · {totalSessions} sessions</div>
    </div>
  )
}
