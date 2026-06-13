export default function AdaptiveGenerateCTA({ plan, state, msg, onGenerate, compact = false }) {
  const enabled = plan.data?.enabled
  const targets = plan.data?.targetConcepts ?? []
  const recCount = plan.data?.recommendedCardCount ?? 10
  const isLoading = state === 'loading'

  if (plan.loading) return null

  if (compact) {
    return (
      <div className="fc-ai-strip">
        <div className="fc-ai-strip-left">
          <span className="fc-ai-strip-label">AI Reinforcement</span>
          {enabled && targets.length > 0 && (
            <span className="fc-ai-strip-sub">{targets.length} weak concept{targets.length !== 1 ? 's' : ''} targeted</span>
          )}
          {!enabled && <span className="fc-ai-strip-sub">Complete more sessions to enable adaptive mode</span>}
        </div>
        <div className="fc-ai-strip-right">
          {msg && <span className={`fc-ai-msg${state === 'error' ? ' err' : ''}`}>{msg}</span>}
          <button
            type="button"
            className={`fc-action-btn primary sm${isLoading ? ' loading' : ''}`}
            onClick={onGenerate}
            disabled={isLoading}
          >
            {isLoading ? 'Generating...' : `Generate ${recCount} Cards`}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fc-ai-cta">
      <div className="fc-ai-cta-icon" aria-hidden="true">*</div>
      <div className="fc-ai-cta-body">
        <div className="fc-ai-cta-title">AI Reinforcement Flashcards</div>
        <p className="fc-ai-cta-desc">
          {enabled && targets.length > 0
            ? `Adaptive mode active - generate cards targeting your ${targets.length} weakest concept${targets.length !== 1 ? 's' : ''}.`
            : 'Generate clinical reinforcement cards. Complete more sessions to unlock adaptive targeting.'}
        </p>
        {enabled && targets.length > 0 && (
          <div className="fc-ai-concepts">
            {targets.slice(0, 5).map(c => (
              <span key={c} className="fc-ai-concept-chip">{c}</span>
            ))}
            {targets.length > 5 && <span className="fc-ai-concept-chip dim">+{targets.length - 5} more</span>}
          </div>
        )}
      </div>
      {msg && <p className={`fc-ai-msg${state === 'error' ? ' err' : ''}`}>{msg}</p>}
      <button
        type="button"
        className={`fc-action-btn primary${isLoading ? ' loading' : ''}`}
        onClick={onGenerate}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : `Generate ${recCount} Cards`}
      </button>
    </div>
  )
}
