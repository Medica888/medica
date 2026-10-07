import { useId } from 'react'

const GRADIENTS = {
  bright: ['#5FA8FF', '#2A6FCF'],
  deep:   ['#2A82E0', '#1250A0'],
}

export default function MedicaLogo({ size = 24, tagline, wordmark = true, tone = 'bright', className = '' }) {
  const gradientId = useId()
  const [from, to] = GRADIENTS[tone] ?? GRADIENTS.bright

  return (
    <span className={`medica-logo ${className}`.trim()}>
      <svg width={size * 0.875} height={size} viewBox="0 0 28 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
            <stop stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
        <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" fill={`url(#${gradientId})`} />
        <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" stroke="rgba(255,255,255,.12)" strokeWidth=".6" fill="none" />
        <rect x="13.2" y="9.5" width="1.6" height="14" rx=".8" fill="white" />
        <path d="M14 9.5C14 9.5 11.2 7.2 11.8 4.8C12.2 3.2 14 1.8 14 1.8s1.8 1.4 2.2 3c.6 2.4-2.2 4.7-2.2 4.7Z" fill="white" />
        <path d="M10 13.5c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
        <path d="M10 18c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      </svg>
      {wordmark && (
        <span className="medica-logo-words">
          <span className="medica-logo-text">MEDICA</span>
          {tagline && <span className="medica-logo-tagline">{tagline}</span>}
        </span>
      )}
    </span>
  )
}
