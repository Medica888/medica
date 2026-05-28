/**
 * @param {{
 *   weakSpotReport: import('../../lib/weakSpotAnalysis').WeakSpot[]
 * }} props
 */
export default function WeakSpotDiagnosis({ weakSpotReport }) {
  const weak = (weakSpotReport || []).filter(ws => ws.percentage < 80)

  return (
    <div className="cr-wsd">
      <div className="cr-section-hdr">Instability Analysis</div>
      {weak.length === 0 ? (
        <p className="cr-wsd-empty">No instability clusters detected — consistent performance across all categories.</p>
      ) : weak.map(ws => {
        const missed       = ws.missedQuestions || []
        const visible      = missed.slice(0, 4)
        const extraCount   = missed.length - visible.length
        return (
          <div key={ws.category} className="cr-wsd-row">
            <div className="cr-wsd-top">
              <span className="cr-wsd-cat">{ws.category}</span>
              <span className="cr-wsd-fraction">{ws.correct}/{ws.total}</span>
              <span
                className="cr-wsd-pct"
                style={{ color: ws.percentage < 50 ? 'var(--red)' : ws.percentage < 70 ? 'var(--yellow, #f59e0b)' : 'var(--green)' }}
              >
                {ws.percentage}%
              </span>
            </div>
            <div className="cr-wsd-bar-wrap">
              <div
                className="cr-wsd-bar-fill"
                style={{
                  width: `${ws.percentage}%`,
                  background: ws.percentage < 50 ? 'var(--red)' : ws.percentage < 70 ? 'var(--yellow, #f59e0b)' : 'var(--green)',
                }}
              />
            </div>
            {visible.length > 0 && (
              <div className="cr-wsd-missed">
                {visible.map(q => (
                  <span key={q.id} className="cr-wsd-missed-concept">
                    {q.testedConcept || q.id}
                  </span>
                ))}
                {extraCount > 0 && (
                  <span className="cr-wsd-more">+{extraCount} more</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
