import AdaptiveGenerateCTA from './AdaptiveGenerateCTA'

export default function FlashcardEmptyState({
  showAdaptiveCTA,
  adaptivePlan,
  aiGenState,
  aiGenMsg,
  onGenerateAI,
  onNavigate,
}) {
  return (
    <div className="fc-page">
      <div className="fc-empty">
        <div className="fc-empty-icon">
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" aria-hidden="true">
            <rect x="6" y="14" width="40" height="28" rx="5" stroke="currentColor" strokeWidth="2" opacity=".35"/>
            <rect x="10" y="8" width="32" height="28" rx="5" stroke="currentColor" strokeWidth="2" opacity=".2"/>
            <path d="M18 28h16M18 33h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45"/>
          </svg>
        </div>
        <h2 className="fc-empty-title">No Reinforcement Items Yet</h2>
        <p className="fc-empty-body">
          Finish a Practice or Coach session to automatically generate clinical reinforcement cards from your missed questions.
        </p>
        {showAdaptiveCTA && (
          <AdaptiveGenerateCTA
            plan={adaptivePlan}
            state={aiGenState}
            msg={aiGenMsg}
            onGenerate={onGenerateAI}
          />
        )}
        {onNavigate && (
          <button type="button" className="fc-action-btn primary" onClick={() => onNavigate('create-quiz')}>
            Start a Practice Session
          </button>
        )}
      </div>
    </div>
  )
}
