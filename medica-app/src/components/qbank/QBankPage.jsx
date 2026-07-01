import { useEffect, useMemo, useRef, useState } from 'react'
import { getBrowsableQuestionBank } from '../../lib/mockQuestions'
import { subscribeQuestionReports } from '../../lib/storage'

const PAGE_SIZE = 20
const MAX_SELECTION = 40
const MODES = [
  { id: 'exam', label: 'Exam' },
  { id: 'practice', label: 'Practice' },
  { id: 'coach', label: 'Coach' },
]

function questionTopic(question) {
  return question.testedConcept
    || question.topic
    || question.canonicalTopic
    || question.questionAngle
    || 'General Step 1 concept'
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

export default function QBankPage({ onStartSelected }) {
  const [reportsVersion, setReportsVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('All Subjects')
  const [system, setSystem] = useState('All Systems')
  const [difficulty, setDifficulty] = useState('All Difficulties')
  const [mode, setMode] = useState('practice')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [preview, setPreview] = useState(null)
  const [page, setPage] = useState(1)
  const previewRef = useRef(null)
  const previewOpenerRef = useRef(null)

  useEffect(() => subscribeQuestionReports(() => setReportsVersion(version => version + 1)), [])

  const inventory = useMemo(
    () => reportsVersion >= 0 ? getBrowsableQuestionBank() : [],
    [reportsVersion],
  )
  const subjects = useMemo(() => uniqueSorted(inventory.map(question => question.subject)), [inventory])
  const systems = useMemo(
    () => uniqueSorted(inventory.map(question => question.system).filter(value => value !== 'Multisystem')),
    [inventory],
  )
  const difficulties = useMemo(() => uniqueSorted(inventory.map(question => question.difficulty)), [inventory])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return inventory.filter(question => {
      if (subject !== 'All Subjects' && question.subject !== subject) return false
      if (system !== 'All Systems' && question.system !== system) return false
      if (difficulty !== 'All Difficulties' && question.difficulty !== difficulty) return false
      if (!needle) return true
      return [
        question.stem,
        question.subject,
        question.system,
        question.topic,
        question.testedConcept,
        question.canonicalTopic,
        question.questionAngle,
      ].some(value => String(value || '').toLowerCase().includes(needle))
    })
  }, [inventory, search, subject, system, difficulty])

  useEffect(() => {
    if (!preview) return undefined
    previewRef.current?.focus()
    const handleEscape = event => {
      if (event.key === 'Escape') setPreview(null)
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      previewOpenerRef.current?.focus?.()
    }
  }, [preview])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const selectedQuestions = inventory.filter(question => selectedIds.has(String(question.id)))
  const inventoryIds = useMemo(() => new Set(inventory.map(question => String(question.id))), [inventory])
  const selectionCount = selectedQuestions.length

  const toggleQuestion = id => {
    setSelectedIds(current => {
      const next = new Set([...current].filter(selectedId => inventoryIds.has(selectedId)))
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_SELECTION) next.add(id)
      return next
    })
  }

  const selectFiltered = () => {
    setSelectedIds(current => {
      const next = new Set([...current].filter(selectedId => inventoryIds.has(selectedId)))
      for (const question of filtered) {
        if (next.size >= MAX_SELECTION) break
        next.add(String(question.id))
      }
      return next
    })
  }

  const openPreview = (question, event) => {
    previewOpenerRef.current = event.currentTarget
    setPreview(question)
  }

  const trapPreviewFocus = event => {
    if (event.key !== 'Tab') return
    const focusable = [...(previewRef.current?.querySelectorAll('button:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === previewRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="qbk-page">
      <div className="qbk-scroll">
        <header className="qbk-header">
          <div>
            <span className="qbk-eyebrow">Validated Question Library</span>
            <h1 className="qbk-title">QBank</h1>
            <p className="qbk-subtitle">
              Browse reviewed questions, build a focused set, and start without generating new content.
            </p>
          </div>
          <div className="qbk-inventory" aria-label={`${inventory.length} validated questions available`}>
            <strong>{inventory.length}</strong>
            <span>available</span>
          </div>
        </header>

        <section className="qbk-toolbar" aria-label="QBank filters">
          <div className="qbk-search-field">
            <label htmlFor="qbk-search">Search questions</label>
            <input
              id="qbk-search"
              type="search"
              value={search}
              onChange={event => { setSearch(event.target.value); setPage(1) }}
              placeholder="Search topic, concept, or question text"
            />
          </div>
          <FilterSelect label="Subject" value={subject} onChange={value => { setSubject(value); setPage(1) }} options={['All Subjects', ...subjects]} />
          <FilterSelect label="System" value={system} onChange={value => { setSystem(value); setPage(1) }} options={['All Systems', ...systems]} />
          <FilterSelect label="Difficulty" value={difficulty} onChange={value => { setDifficulty(value); setPage(1) }} options={['All Difficulties', ...difficulties]} />
        </section>

        <div className="qbk-list-header">
          <div data-testid="qbk-match-count">
            <strong>{filtered.length}</strong> matching question{filtered.length !== 1 ? 's' : ''}
          </div>
          <div className="qbk-list-actions">
            <button type="button" className="qbk-text-btn" onClick={selectFiltered} disabled={filtered.length === 0 || selectionCount >= MAX_SELECTION}>
              Select filtered (up to 40)
            </button>
            <button type="button" className="qbk-text-btn" onClick={() => setSelectedIds(new Set())} disabled={selectionCount === 0}>
              Clear selection
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="qbk-empty">
            <strong>No questions match these filters.</strong>
            <span>Try a broader subject, system, difficulty, or search term.</span>
          </div>
        ) : (
          <div className="qbk-list" aria-label="Validated questions">
            {visible.map((question, index) => {
              const id = String(question.id)
              const selected = selectedIds.has(id) && inventoryIds.has(id)
              const disabled = !selected && selectionCount >= MAX_SELECTION
              const absoluteNumber = (page - 1) * PAGE_SIZE + index + 1
              return (
                <article key={id} className={`qbk-row${selected ? ' selected' : ''}`}>
                  <label className="qbk-select">
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleQuestion(id)}
                      aria-label={`Select question ${absoluteNumber}: ${questionTopic(question)}`}
                    />
                    <span aria-hidden="true" />
                  </label>
                  <div className="qbk-row-main">
                    <div className="qbk-row-meta">
                      <span>Q{absoluteNumber}</span>
                      {question.subject && <span>{question.subject}</span>}
                      {question.system && question.system !== question.subject && <span>{question.system}</span>}
                      {question.difficulty && <span className="qbk-difficulty">{question.difficulty}</span>}
                      <span className="qbk-validated">Validated</span>
                    </div>
                    <strong className="qbk-concept">{questionTopic(question)}</strong>
                    <p className="qbk-stem-preview">{question.stem}</p>
                  </div>
                  <button type="button" className="qbk-preview-btn" onClick={event => openPreview(question, event)}>
                    Preview
                  </button>
                </article>
              )
            })}
          </div>
        )}

        {pageCount > 1 && (
          <nav className="qbk-pagination" aria-label="QBank pages">
            <button type="button" onClick={() => setPage(value => value - 1)} disabled={page === 1}>Previous</button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" onClick={() => setPage(value => value + 1)} disabled={page === pageCount}>Next</button>
          </nav>
        )}
      </div>

      <div className="qbk-launch" aria-label="Selected question session">
        <div className="qbk-selection-count">
          <strong>{selectionCount}</strong>
          <span>of {MAX_SELECTION} selected</span>
        </div>
        <div className="qbk-mode" role="group" aria-label="Session mode">
          {MODES.map(option => (
            <button
              key={option.id}
              type="button"
              className={mode === option.id ? 'active' : ''}
              aria-pressed={mode === option.id}
              onClick={() => setMode(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="qbk-start-btn"
          disabled={selectedQuestions.length === 0}
          onClick={() => onStartSelected({ mode, questions: selectedQuestions })}
        >
          Start Selected Questions
        </button>
      </div>

      {preview && (
        <div className="qbk-preview-overlay" role="dialog" aria-modal="true" aria-labelledby="qbk-preview-title" onClick={event => event.target === event.currentTarget && setPreview(null)}>
          <div className="qbk-preview-panel" ref={previewRef} tabIndex={-1} onKeyDown={trapPreviewFocus}>
            <div className="qbk-preview-header">
              <div>
                <span className="qbk-eyebrow">Question Preview</span>
                <h2 id="qbk-preview-title">{questionTopic(preview)}</h2>
              </div>
              <button type="button" className="qbk-preview-close" onClick={() => setPreview(null)} aria-label="Close question preview">×</button>
            </div>
            <div className="qbk-row-meta">
              {preview.subject && <span>{preview.subject}</span>}
              {preview.system && preview.system !== preview.subject && <span>{preview.system}</span>}
              {preview.difficulty && <span className="qbk-difficulty">{preview.difficulty}</span>}
              <span className="qbk-validated">Validated</span>
            </div>
            <p className="qbk-preview-stem">{preview.stem}</p>
            <div className="qbk-preview-options" aria-label="Answer options">
              {(preview.options || []).map(option => (
                <div key={option.letter} className="qbk-preview-option">
                  <span>{option.letter}</span>
                  <p>{option.text}</p>
                </div>
              ))}
            </div>
            <p className="qbk-preview-note">Answers and explanations remain hidden until you begin the session.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  const id = `qbk-${label.toLowerCase()}`
  return (
    <div className="qbk-filter-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}
