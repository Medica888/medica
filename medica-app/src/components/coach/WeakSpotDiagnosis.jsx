/**
 * @param {{ weakSpotReport: import('../../lib/weakSpotAnalysis').WeakSpot[] }} props
 */
export default function WeakSpotDiagnosis({ weakSpotReport }) {
  const weak = (weakSpotReport || []).filter(ws => ws.percentage < 80)

  const severity = (pct) => pct < 50 ? 'priority' : pct < 70 ? 'focus' : 'reinforced'
  const label    = (pct) => pct < 50 ? 'PRIORITY' : pct < 70 ? 'FOCUS' : 'REINFORCED'

  return (
    <div className="cr-wsd">
      <div className="cr-panel-label">WEAK SPOT DIAGNOSIS</div>
      {weak.length === 0 ? (
        <p className="cr-wsd-empty">No instability clusters detected — consistent performance across all categories.</p>
      ) : weak.map(ws => {
        const sev     = severity(ws.percentage)
        const missed  = (ws.missedQuestions || []).slice(0, 3)
        const extra   = (ws.missedQuestions || []).length - missed.length
        return (
          <div key={ws.category} className={`cr-wsd-row cr-wsd-row--${sev}`}>
            <div className="cr-wsd-top">
              <div className="cr-wsd-left">
                <span className="cr-wsd-cat">{ws.category}</span>
                {missed.length > 0 && (
                  <span className="cr-wsd-detail">
                    {ws.total - ws.correct} of {ws.total} miss{ws.total - ws.correct !== 1 ? 'es' : ''} · {missed[0].testedConcept || 'Mechanism gap'}
                  </span>
                )}
              </div>
              <span className={`cr-wsd-badge cr-wsd-badge--${sev}`}>{label(ws.percentage)}</span>
            </div>
            {extra > 0 && (
              <span className="cr-wsd-more">+{extra} more</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
