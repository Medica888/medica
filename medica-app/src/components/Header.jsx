import { useState, useEffect } from 'react'
import logoUrl from '../assets/medica-logo.png'

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
      {/* Left - Medica logo (home button) */}
      <button className="hdr-home" onClick={onHome} aria-label="Medica — go to dashboard">
        <img className="hdr-logo" src={logoUrl} alt="MEDICA — Medical Education Centre" />
      </button>

      {/* Divider */}
      <div className="hdr-vr" />

      {/* Page title */}
      <div className="hdr-title-wrap">
        <div className="hdr-page-title" aria-current="page">{title}</div>
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
