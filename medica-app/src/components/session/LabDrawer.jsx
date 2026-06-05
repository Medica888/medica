import { useState, useEffect } from 'react'
import { USMLE_LAB_REFERENCE } from '../../constants/usmleLabReference'

/**
 * Non-blocking slide-out drawer for USMLE lab reference values.
 * @param {{ isOpen: boolean, onClose: () => void }} props
 */
export default function LabDrawer({ isOpen, onClose }) {
  const [search, setSearch] = useState('')

  const handleClose = () => { setSearch(''); onClose() }

  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null

  const q = search.toLowerCase().trim()
  const filtered = USMLE_LAB_REFERENCE
    .map(cat => ({
      ...cat,
      tests: q ? cat.tests.filter(t => t.test.toLowerCase().includes(q)) : cat.tests,
    }))
    .filter(cat => cat.tests.length > 0)

  return (
    <div className="quiz-drawer lab-drawer" role="complementary" aria-label="Laboratory Reference Values">
      <div className="quiz-drawer-hdr">
        <div>
          <span className="quiz-drawer-title">Lab Values</span>
          <span className="quiz-drawer-subtitle">Adult · First Aid 2025 / NBME / UWorld</span>
        </div>
        <button type="button" className="quiz-drawer-close" onClick={handleClose} aria-label="Close lab values">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="quiz-drawer-search">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search labs..."
          className="quiz-drawer-search-input"
          aria-label="Search lab values"
        />
      </div>

      <div className="quiz-drawer-body">
        {filtered.map(cat => (
          <div key={cat.category} className="quiz-lab-cat">
            <div className="quiz-lab-cat-title">{cat.category}</div>
            {cat.tests.map(item => (
              <div key={item.test} className="quiz-lab-row">
                <span className="quiz-lab-name">{item.test}</span>
                <span className="quiz-lab-value">{item.value}</span>
              </div>
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="quiz-drawer-empty">No results for &ldquo;{search}&rdquo;</div>
        )}
      </div>
    </div>
  )
}
