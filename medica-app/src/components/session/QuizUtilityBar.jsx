/**
 * @param {{
 *   openDrawer: string | null
 *   onToggle: (drawer: 'labs' | 'calc' | 'notes') => void
 *   hasNotes?: boolean
 * }} props
 */
export default function QuizUtilityBar({ openDrawer, onToggle, hasNotes = false }) {
  return (
    <div className="exam-utility-row" role="toolbar" aria-label="Study tools">
      <button
        type="button"
        className={`exam-util-btn${openDrawer === 'labs' ? ' active' : ''}`}
        onClick={() => onToggle('labs')}
        aria-expanded={openDrawer === 'labs'}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M5 1.5v5L2 12h10L9 6.5V1.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M5 1.5h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round"/>
          <path d="M3.5 8.5h7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
        Lab Values
      </button>
      <button
        type="button"
        className={`exam-util-btn${openDrawer === 'calc' ? ' active' : ''}`}
        onClick={() => onToggle('calc')}
        aria-expanded={openDrawer === 'calc'}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="1.5" y="1" width="11" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.35"/>
          <rect x="3" y="2.5" width="8" height="2.5" rx=".75" fill="currentColor" opacity=".3"/>
          <circle cx="4" cy="8"  r=".9" fill="currentColor"/>
          <circle cx="7" cy="8"  r=".9" fill="currentColor"/>
          <circle cx="10" cy="8" r=".9" fill="currentColor"/>
          <circle cx="4" cy="11"  r=".9" fill="currentColor"/>
          <circle cx="7" cy="11"  r=".9" fill="currentColor"/>
          <circle cx="10" cy="11" r=".9" fill="currentColor"/>
        </svg>
        Calculator
      </button>
      <button
        type="button"
        className={`exam-util-btn${hasNotes ? ' has-notes' : ''}${openDrawer === 'notes' ? ' active' : ''}`}
        onClick={() => onToggle('notes')}
        aria-expanded={openDrawer === 'notes'}
      >
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.35"/>
          <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Notes
        {hasNotes && <span className="exam-util-dot" aria-hidden="true" />}
      </button>
    </div>
  )
}
