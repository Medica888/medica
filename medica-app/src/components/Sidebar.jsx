const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',  Icon: IconDashboard },
  { id: 'qbank',      label: 'QBank',      Icon: IconQBank },
  { id: 'flashcards', label: 'Flashcards', Icon: IconCards, hasBadge: true },
  { id: 'analytics',  label: 'Analytics',  Icon: IconChart },
  { id: 'ai-tutor',   label: 'AI Coach',   Icon: IconCoach },
  { id: 'settings',   label: 'Settings',   Icon: IconSettings },
]

export default function Sidebar({ activeNav, onNav, flashcardsDue, authUser }) {
  return (
    <aside className="sidebar" aria-label="Main navigation">

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

      {/* Admin nav — only visible to admins */}
      {authUser?.isAdmin && (
        <div className="sb-admin-group">
          <div className="sb-admin-label">Admin</div>
          <button
            className={`sb-item${activeNav === 'admin-review' ? ' active' : ''}`}
            onClick={() => onNav('admin-review')}
            aria-current={activeNav === 'admin-review' ? 'page' : undefined}
          >
            <span className="sb-item-icon" aria-hidden="true"><IconReview /></span>
            <span className="sb-item-label">Review Queue</span>
          </button>
          <button
            className={`sb-item${activeNav === 'admin-governance' ? ' active' : ''}`}
            onClick={() => onNav('admin-governance')}
            aria-current={activeNav === 'admin-governance' ? 'page' : undefined}
          >
            <span className="sb-item-icon" aria-hidden="true"><IconGovernance /></span>
            <span className="sb-item-label">Governance</span>
          </button>
          <button
            className={`sb-item${activeNav === 'admin-taxonomy' ? ' active' : ''}`}
            onClick={() => onNav('admin-taxonomy')}
            aria-current={activeNav === 'admin-taxonomy' ? 'page' : undefined}
          >
            <span className="sb-item-icon" aria-hidden="true"><IconTaxonomy /></span>
            <span className="sb-item-label">Taxonomy</span>
          </button>
        </div>
      )}

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

function IconReview() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M5 6h6M5 8.5h4M5 11h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="11.5" cy="10.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M13.5 12.5l1.2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconGovernance() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 1.5L14 4v4c0 3.5-2.8 6-6 7.5C2.8 14 0 11.5 0 8V4l6-2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M5.5 8l1.8 1.8L10.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function IconTaxonomy() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="3" cy="12" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M4.5 4h2.5a1 1 0 0 1 1 1v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M4.5 12h2.5a1 1 0 0 0 1-1v-.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M8 5.5v5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M8 8h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="13" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
