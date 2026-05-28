const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard', emoji: '⊞' },
    ],
  },
  {
    label: 'USMLE Step 1',
    items: [
      { id: 'create-quiz', label: 'Create Quiz',  emoji: '📝' },
      { id: 'qbank',       label: 'QBank',        emoji: '🗃️' },
      { id: 'flashcards',  label: 'Reinforcement', emoji: '🃏' },
      { id: 'ai-tutor',   label: 'AI Tutor',     emoji: '🤖' },
      { id: 'analytics',  label: 'Analytics',    emoji: '📊' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { id: 'notes',        label: 'Notes',        emoji: '📓' },
      { id: 'bookmarks',    label: 'Bookmarks',    emoji: '🔖' },
      { id: 'performance',  label: 'Performance',  emoji: '📈' },
      { id: 'exam-history', label: 'Exam History', emoji: '📋' },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'settings', label: 'Settings', emoji: '⚙️' },
    ],
  },
]

export default function Sidebar({ activeNav, onNav, onHome }) {
  return (
    <aside className="sidebar" aria-label="Skills navigation">
      <div className="sb-brand" onClick={onHome} role="button" tabIndex={0} aria-label="Medica home">
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

      <div className="sb-body">
        <div className="sb-section">
          <span className="sb-section-txt">Navigation</span>
          <div className="sb-section-line" />
        </div>

        {NAV_GROUPS.map(group => (
          <div className="cat-grp" key={group.label}>
            <div className="cat-lbl">{group.label}</div>
            {group.items.map(item => (
              <div
                key={item.id}
                className={`sb-item${activeNav === item.id ? ' active' : ''}`}
                onClick={() => onNav(item.id)}
              >
                <span className="sb-item-emoji">{item.emoji}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="sb-footer">
        <button className="btn-new" onClick={() => onNav('skills')}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>⊞</span>
          Browse Skills
        </button>
      </div>
    </aside>
  )
}
