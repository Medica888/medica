import { useState, useEffect } from 'react'

export default function Header({ onHome, pageTitle, readinessStatus }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('medica-dark') !== '0' } catch { return true }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('medica-dark', dark ? '1' : '0') } catch { /* ignore */ }
  }, [dark])

  const title = pageTitle || 'Medica'
  const status = readinessStatus || { label: 'Active', active: true }

  return (
    <header className="header">
      {/* Left - compact wordmark (home button) */}
      <button className="hdr-home" onClick={onHome} aria-label="Go to dashboard">
        <svg width="16" height="18" viewBox="0 0 28 32" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="hdr-lg" x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5FA8FF" />
              <stop offset="1" stopColor="#2A6FCF" />
            </linearGradient>
          </defs>
          <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" fill="url(#hdr-lg)" />
          <rect x="13.2" y="9.5" width="1.6" height="14" rx=".8" fill="white" />
          <path d="M14 9.5C14 9.5 11.2 7.2 11.8 4.8C12.2 3.2 14 1.8 14 1.8s1.8 1.4 2.2 3c.6 2.4-2.2 4.7-2.2 4.7Z" fill="white" />
        </svg>
      </button>

      {/* Divider */}
      <div className="hdr-vr" />

      {/* Page title */}
      <div className="hdr-title-wrap">
        <h1 className="hdr-page-title">{title}</h1>
      </div>

      {/* Right controls */}
      <div className="hdr-right">
        <div className={`hdr-pill${status.active ? '' : ' hdr-pill--dim'}`}>
          <div className={`hdr-dot${status.active ? '' : ' hdr-dot--dim'}`} />
          <span className="hdr-pill-txt">Readiness: {status.label}</span>
        </div>
        <div className="hdr-sep" />
        <button
          className={`dark-toggle ${dark ? 'is-dark' : 'is-light'}`}
          onClick={() => setDark(d => !d)}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
        >
          {dark ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21 15.2A9 9 0 1 1 8.8 3a7 7 0 0 0 12.2 12.2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
