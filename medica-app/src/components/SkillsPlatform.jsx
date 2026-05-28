import { useState } from 'react'

const CATEGORY_COLORS = {
  'Social Media':   '#1769C8',
  'Education':      '#0FAD6F',
  'Outreach':       '#E07B20',
  'USMLE Step 1':   '#1769C8',
  'USMLE Step 2':   '#6B3FBD',
}

const CATEGORY_ORDER = ['Social Media', 'Education', 'Outreach', 'USMLE Step 1', 'USMLE Step 2']

export default function SkillsPlatform({ skills, onSelect }) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? skills.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.description.toLowerCase().includes(query.toLowerCase()) ||
        s.category.toLowerCase().includes(query.toLowerCase())
      )
    : skills

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const items = filtered.filter(s => s.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  filtered.forEach(s => {
    if (!CATEGORY_ORDER.includes(s.category) && !grouped[s.category]) {
      grouped[s.category] = filtered.filter(x => x.category === s.category)
    }
  })

  return (
    <div className="view-home">
      <div className="dash-hero">
        <div className="dash-eyebrow">MEDICA Skills Platform</div>
        <h1 className="dash-title">
          AI-Powered Medical<br />Content & Education
        </h1>
        <p className="dash-sub">
          Premium tools built for Medica — from clinical content creation to USMLE preparation. Select a skill to begin.
        </p>

        <div className="dash-search-row">
          <div className="dash-search">
            <svg className="dash-search-ico" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="#A8BFD4" strokeWidth="1.4" />
              <path d="M10 10L13 13" stroke="#A8BFD4" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search skills..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="dash-grid-wrap">
        {Object.keys(grouped).length === 0 && (
          <p style={{ color: 'var(--t3)', fontSize: 13 }}>No skills match your search.</p>
        )}

        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div className="dash-cat-label">{cat}</div>
            <div className="skill-grid">
              {items.map(skill => {
                const accent = CATEGORY_COLORS[skill.category] || '#1769C8'
                return (
                  <div
                    key={skill.id}
                    className="skill-card"
                    style={{ '--accent': accent }}
                    onClick={() => onSelect(skill)}
                  >
                    <div className="sc-emoji">{skill.emoji}</div>
                    <div className="sc-name">{skill.name}</div>
                    <div className="sc-desc">{skill.description}</div>
                    <div className="sc-cat">{skill.category}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
