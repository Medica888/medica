const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',  Icon: IconDashboard },
  { id: 'qbank',      label: 'QBank',      Icon: IconQBank },
  { id: 'flashcards', label: 'Flashcards', Icon: IconCards, hasBadge: true },
  { id: 'analytics',  label: 'Analytics',  Icon: IconChart },
  { id: 'ai-tutor',   label: 'AI Coach',   Icon: IconCoach },
  { id: 'settings',   label: 'Settings',   Icon: IconSettings },
]

export default function Sidebar({ activeNav, onNav, onHome, flashcardsDue }) {
  return (
    <aside className="sidebar" aria-label="Main navigation">

      {/* Brand */}
      <div className="sb-brand" onClick={onHome} role="button" tabIndex={0}
        aria-label="Medica home"
        onKeyDown={e => e.key === 'Enter' && onHome()}>
        <svg className="sb-brand-icon" width="22" height="25" viewBox="0 0 28 32" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="sb-lg" x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5FA8FF" />
              <stop offset="1" stopColor="#2A6FCF" />
            </linearGradient>
          </defs>
          <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" fill="url(#sb-lg)" />
          <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" stroke="rgba(255,255,255,.12)" strokeWidth=".6" fill="none" />
          <rect x="13.2" y="9.5" width="1.6" height="14" rx=".8" fill="white" />
          <path d="M14 9.5C14 9.5 11.2 7.2 11.8 4.8C12.2 3.2 14 1.8 14 1.8s1.8 1.4 2.2 3c.6 2.4-2.2 4.7-2.2 4.7Z" fill="white" />
          <path d="M10 13.5c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M10 18c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </svg>
        <div className="sb-brand-words">
          <span className="sb-brand-name">MEDICA</span>
          <span className="sb-brand-sub">Step 1 Mastery</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="sb-body" aria-label="Navigation">
        {NAV_ITEMS.map(({ id, label, Icon, hasBadge }) => {
          const due = hasBadge && flashcardsDue > 0 ? flashcardsDue : 0
          return (
            <button
              key={id}
              className={`sb-item${activeNav === id ? ' active' : ''}`}
              onClick={() => onNav(id)}
              aria-current={activeNav === id ? 'page' : undefined}
            >
              <span className="sb-item-icon" aria-hidden="true"><Icon /></span>
              <span className="sb-item-label">{label}</span>
              {due > 0 && (
                <span className="sb-item-badge">{due > 99 ? '99+' : due}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Footer CTA */}
      <div className="sb-footer">
        <button className="btn-new" onClick={() => onNav('create-quiz')}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          New Session
        </button>
      </div>

    </aside>
  )
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
    </svg>
  )
}

function IconQBank() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="4" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4 4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M5 8h6M5 10.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

function IconCards() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="5" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M4.5 5V4a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 11.5 4v1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5"/>
      <path d="M6 9.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 12L5.5 7.5L8 10L11 5.5L14 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 14h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity=".35"/>
    </svg>
  )
}

function IconCoach() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5.5" r="2.8" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M2.5 13.5c0-2.76 2.46-5 5.5-5s5.5 2.24 5.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1.5v1.2M8 13.3v1.2M1.5 8h1.2M13.3 8h1.2M3.4 3.4l.85.85M11.75 11.75l.85.85M3.4 12.6l.85-.85M11.75 4.25l.85-.85" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
