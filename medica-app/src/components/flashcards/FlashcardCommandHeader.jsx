import { IconMedicaShield } from './FlashcardIcons'

export default function FlashcardCommandHeader({
  totalCount,
  dueCount,
  visibleCount,
  copyMsg,
  onCopyAll,
  onExportCSV,
  onStartReview,
  onClearDeck,
}) {
  const hasVisibleCards = visibleCount > 0

  return (
    <header className="fc-command-header">
      <div className="fc-command-left">
        <div className="fc-command-icon" aria-hidden="true"><IconMedicaShield/></div>
        <div>
          <h1 className="fc-command-title">Clinical Reinforcement</h1>
          <p className="fc-command-subtitle">
            {totalCount} item{totalCount !== 1 ? 's' : ''} / {dueCount} due today
          </p>
          <span className="fc-command-kicker">Reinforcement Library</span>
        </div>
      </div>
      <div className="fc-header-actions">
        <button type="button"
          className={`fc-action-btn sm${copyMsg === 'copied' ? ' copied' : copyMsg === 'failed' ? ' failed' : ''}`}
          onClick={onCopyAll} disabled={!hasVisibleCards}
          title="Copy visible items as text" aria-label="Copy visible items to clipboard"
        >
          {copyMsg === 'copied' ? 'Copied' : copyMsg === 'failed' ? 'Failed' : (
            <><svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="4" y="3.5" width="6.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4 3V2a1.5 1.5 0 0 0-1.5 1.5v7A1.5 1.5 0 0 0 4 12h4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>Copy</>
          )}
        </button>
        <button type="button" className="fc-action-btn sm"
          onClick={onExportCSV} disabled={!hasVisibleCards}
          title="Export as CSV" aria-label="Export visible items as CSV"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v7.5M3.5 6L6 8.5 8.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M1.5 9.5v1a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          Export
        </button>
        <button type="button" className="fc-action-btn primary sm"
          onClick={onStartReview} disabled={!hasVisibleCards}
          aria-label={`Start reinforcement of ${visibleCount} items`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2 6.5L5 9.5L10 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Start Reinforcement
        </button>
        <button type="button" className="fc-clear-deck-btn" onClick={onClearDeck}
          title="Delete all reinforcement items and groups" aria-label="Clear all reinforcement items"
        >Clear Reinforcement</button>
      </div>
    </header>
  )
}
