import { useState, useEffect } from 'react'

export default function Header({ onHome }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('medica-dark') !== '0' } catch { return true }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('medica-dark', dark ? '1' : '0') } catch { /* ignore */ }
  }, [dark])

  return (
    <header className="header">
      <div className="logo" onClick={onHome}>
        <svg className="logo-svg" viewBox="0 0 28 32" fill="none">
          <defs>
            <linearGradient id="lg" x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2A82E0" />
              <stop offset="1" stopColor="#1250A0" />
            </linearGradient>
          </defs>
          <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" fill="url(#lg)" />
          <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" stroke="rgba(255,255,255,.12)" strokeWidth=".6" fill="none" />
          <rect x="13.2" y="9.5" width="1.6" height="14" rx=".8" fill="white" />
          <path d="M14 9.5C14 9.5 11.2 7.2 11.8 4.8C12.2 3.2 14 1.8 14 1.8s1.8 1.4 2.2 3c.6 2.4-2.2 4.7-2.2 4.7Z" fill="white" />
          <path d="M10 13.5c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
          <path d="M10 18c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        </svg>
        <div className="logo-words">
          <span className="logo-name">MEDICA</span>
          <span className="logo-sub">Medical Education Centre</span>
        </div>
      </div>

      <div className="hdr-right">
        <div className="hdr-pill">
          <div className="hdr-dot" />
          <span className="hdr-pill-txt">Skills Platform</span>
        </div>
        <div className="hdr-sep" />
        <span className="hdr-model">Claude Sonnet</span>
        <button
          className="dark-toggle"
          onClick={() => setDark(d => !d)}
          aria-label="Toggle dark mode"
          title="Toggle dark mode"
        >
          {dark ? '☀' : '🌙'}
        </button>
      </div>
    </header>
  )
}
