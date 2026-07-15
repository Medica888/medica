import { useEffect, useMemo, useRef, useState } from 'react'
import {
  clearLastQuizSession,
  filterReportedQuestions,
  getLastQuizSession,
  getQBankProgressLedger,
  subscribeQuestionReports,
} from '../../lib/storage'
import { dedupeQuestionList } from '../../lib/questionDedup'
import {
  buildProgressMaps,
  getProgressState,
  computeProgressCounts,
  getAttemptSummary,
} from '../../lib/qbankProgress'
import { useQBankCatalog } from '../../hooks/useQBankCatalog'
import { PUBLIC_DIFFICULTIES, getDifficultyDisplayLabel, getPublicDifficultyId } from '../../lib/quizTypes'

const PAGE_SIZE = 20
const MAX_SELECTION = 40
const MODES = [
  { id: 'exam', label: 'Exam' },
  { id: 'practice', label: 'Practice' },
  { id: 'coach', label: 'Coach' },
]

const STATUS_FILTERS = [
  { id: 'All',              label: 'All' },
  { id: 'unseen',           label: 'Unseen' },
  { id: 'in-progress',      label: 'In progress' },
  { id: 'needs-review',     label: 'Needs review' },
  { id: 'correct',          label: 'Correct' },
  { id: 'repeated-correct', label: 'Repeated correct' },
]

const STATE_LABEL = {
  'in-progress':      'In progress',
  'needs-review':     'Needs review',
  correct:            'Correct',
  'repeated-correct': 'Repeated correct',
}

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

function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function QBankPage({ onStartSelected, sessions = [] }) {
  const [reportsVersion, setReportsVersion] = useState(0)
  const [sessionVersion, setSessionVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('All Subjects')
  const [system, setSystem] = useState('All Systems')
  const [difficulty, setDifficulty] = useState('All Difficulties')
  const [statusFilter, setStatusFilter] = useState('All')
  const [mode, setMode] = useState('practice')
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [preview, setPreview] = useState(null)
  const [page, setPage] = useState(1)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState(null)
  const previewRef = useRef(null)
  const previewOpenerRef = useRef(null)

  const catalog = useQBankCatalog(search)

  // Accumulates every catalog question ever fetched, across all search terms, so a
  // selection or an active session made before a search narrowed the catalog (server
  // search only fetches matching questions) stays valid once the search text changes
  // what `catalog.questions` currently holds. Never evicts; safety (reports/dedup) is
  // re-applied fresh on every read via knownInventory below.
  const [knownQuestions, setKnownQuestions] = useState(() => new Map())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKnownQuestions(current => {
      let changed = false
      const next = new Map(current)
      for (const question of catalog.questions) {
        const id = String(question.id)
        if (!next.has(id)) {
          next.set(id, question)
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [catalog.questions])

  useEffect(() => subscribeQuestionReports(() => setReportsVersion(version => version + 1)), [])

  // Active QBank session: check once on mount, update when reportsVersion changes
  const activeQBankSession = useMemo(() => {
    const last = getLastQuizSession()
    if (!last || last.completed) return null
    const src = last.source || last.config?.source || last.questionSource
    return src === 'validated-qbank' ? last : null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportsVersion, sessionVersion])

  const progressLedger = getQBankProgressLedger()

  // reportsVersion isn't read in the body, but filterReportedQuestions reads live
  // localStorage state — bumping this dep forces recomputation when a report is filed.
  const inventory = useMemo(
    () => dedupeQuestionList(filterReportedQuestions(catalog.questions)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalog.questions, reportsVersion],
  )

  // Search-independent view of every question ever seen, for selection/resume
  // membership checks — must not shrink just because the current search narrowed
  // what useQBankCatalog fetched from the server.
  const knownInventory = useMemo(
    () => dedupeQuestionList(filterReportedQuestions([...knownQuestions.values()])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownQuestions, reportsVersion],
  )
  const knownInventoryIds = useMemo(
    () => new Set(knownInventory.map(question => String(question.id))),
    [knownInventory],
  )

  const { attemptsByQuestion, activeSessionIds } = useMemo(
    () => buildProgressMaps(sessions, activeQBankSession, progressLedger),
    [sessions, activeQBankSession, progressLedger],
  )

  const progressCounts = useMemo(
    () => computeProgressCounts(inventory, attemptsByQuestion, activeSessionIds),
    [inventory, attemptsByQuestion, activeSessionIds],
  )

  const subjects = useMemo(() => uniqueSorted(inventory.map(question => question.subject)), [inventory])
  const systems = useMemo(
    () => uniqueSorted(inventory.map(question => question.system).filter(value => value !== 'Multisystem')),
    [inventory],
  )
  const difficulties = useMemo(() => {
    const available = new Set(inventory.map(question => getPublicDifficultyId(question.difficulty)))
    return PUBLIC_DIFFICULTIES
      .filter(option => available.has(option.id))
      .map(option => option.label)
  }, [inventory])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return inventory.filter(question => {
      if (subject !== 'All Subjects' && question.subject !== subject) return false
      if (system !== 'All Systems' && question.system !== system) return false
      if (difficulty !== 'All Difficulties' && getDifficultyDisplayLabel(question.difficulty) !== difficulty) return false
      if (statusFilter !== 'All') {
        const state = getProgressState(question.id, attemptsByQuestion, activeSessionIds)
        if (state !== statusFilter) return false
      }
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
  }, [inventory, search, subject, system, difficulty, statusFilter, attemptsByQuestion, activeSessionIds])

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
  const selectedQuestions = knownInventory.filter(question => selectedIds.has(String(question.id)))
  const inventoryIds = useMemo(() => new Set(inventory.map(question => String(question.id))), [inventory])
  const selectionCount = selectedQuestions.length

  // Needs-review questions for retry: from the full inventory, capped at 40
  const needsReviewQuestions = useMemo(() => {
    return inventory
      .filter(q => getProgressState(q.id, attemptsByQuestion, activeSessionIds) === 'needs-review')
      .slice(0, MAX_SELECTION)
  }, [inventory, attemptsByQuestion, activeSessionIds])

  const toggleQuestion = id => {
    setSelectedIds(current => {
      const next = new Set([...current].filter(selectedId => knownInventoryIds.has(selectedId)))
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_SELECTION) next.add(id)
      return next
    })
  }

  const selectFiltered = () => {
    setSelectedIds(current => {
      const next = new Set([...current].filter(selectedId => knownInventoryIds.has(selectedId)))
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

  const handleResume = async () => {
    if (!activeQBankSession || starting || catalog.loading) return

    // Backend-driven sessions must never be validated against local search/catalog state
    // (it may be stale, narrowed by a search, or simply not yet fetched this page load).
    // Hand the raw saved session to onStartSelected/handleQBankStart, which re-resolves
    // every id against POST /api/qbank/sessions atomically before touching any UI state.
    if (activeQBankSession.backendDriven) {
      setStartError(null)
      setStarting(true)
      try {
        await onStartSelected({
          mode: activeQBankSession.mode || 'practice',
          questions: activeQBankSession.questions,
          resumeSession: activeQBankSession,
        })
      } catch (err) {
        setStartError(err?.message || 'Could not resume this session. Please try again.')
      } finally {
        setStarting(false)
      }
      return
    }

    // Local sessions: unchanged — validate against the accumulated local catalog cache.
    const safeIds = new Set(knownInventory.map(q => String(q.id)))
    const resumeQuestions = (activeQBankSession.questions || [])
      .filter(q => safeIds.has(String(q.id)))
    if (resumeQuestions.length === 0) return

    const resumedIds = new Set(resumeQuestions.map(q => String(q.id)))
    const answers = Object.fromEntries(
      Object.entries(activeQBankSession.answers || {}).filter(([id]) => resumedIds.has(String(id))),
    )
    const previousCurrentId = activeQBankSession.questions?.[activeQBankSession.currentIndex]?.id
    const resumedIndex = resumeQuestions.findIndex(q => String(q.id) === String(previousCurrentId || ''))
    const resumeSession = {
      ...activeQBankSession,
      questions: resumeQuestions,
      answers,
      currentIndex: resumedIndex >= 0 ? resumedIndex : 0,
      completed: false,
    }

    setStartError(null)
    setStarting(true)
    try {
      await onStartSelected({
        mode: resumeSession.mode || 'practice',
        questions: resumeQuestions,
        resumeSession,
      })
    } catch (err) {
      setStartError(err?.message || 'Could not resume this session. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  const handleDiscardSession = () => {
    if (!window.confirm('Discard this unfinished QBank session? Your saved answers will be removed.')) return
    clearLastQuizSession()
    setSessionVersion(version => version + 1)
  }

  // Backend-driven results are answer-stripped; onStartSelected must resolve full
  // bodies via POST /api/qbank/sessions before a session can be built from them.
  // The backend only re-checks source/bank_status at that point, not this browser's
  // question reports, so re-apply the report filter here to catch a question reported
  // since the catalog was loaded (matches the local path's launch-time re-validation).
  const startSession = async questions => {
    setStartError(null)
    const safeQuestions = filterReportedQuestions(questions)
    if (safeQuestions.length !== questions.length) {
      setStartError('One or more selected questions were just reported and are no longer available. Please refresh your selection.')
      return
    }
    setStarting(true)
    try {
      await onStartSelected({ mode, questions: safeQuestions, backendDriven: catalog.source === 'backend' })
    } catch (err) {
      setStartError(err?.message || 'Could not start this session. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  const handleRetryNeedsReview = () => {
    if (needsReviewQuestions.length === 0 || starting) return
    startSession(needsReviewQuestions)
  }

  const changeStatusFilter = value => {
    setStatusFilter(value)
    setPage(1)
  }

  // In backend mode, `search` narrows the catalog fetch server-side (useQBankCatalog),
  // so a no-match search can empty `inventory` itself, not just `filtered` — inventory
  // size alone can't tell "bank is empty" apart from "this filter combo matched nothing".
  // Active-filter state is the only discriminator that holds in both local and backend mode.
  const hasActiveFilters = Boolean(
    search.trim() || subject !== 'All Subjects' || system !== 'All Systems'
    || difficulty !== 'All Difficulties' || statusFilter !== 'All',
  )

  const clearFilters = () => {
    setSearch('')
    setSubject('All Subjects')
    setSystem('All Systems')
    setDifficulty('All Difficulties')
    setStatusFilter('All')
    setPage(1)
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

        <nav className="qbk-progress-strip" aria-label="Filter by progress">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              className={`qbk-progress-chip qbk-chip-${f.id}${statusFilter === f.id ? ' active' : ''}`}
              aria-pressed={statusFilter === f.id}
              onClick={() => changeStatusFilter(f.id)}
            >
              {f.label}
              <span className="qbk-chip-count">
                {f.id === 'All' ? progressCounts.all : (progressCounts[f.id] ?? 0)}
              </span>
            </button>
          ))}
        </nav>

        {catalog.error && catalog.source === 'fallback' && (
          <div className="qbk-catalog-error" role="alert">
            Couldn't load the latest questions from the server — showing the locally bundled set instead.
          </div>
        )}

        {activeQBankSession && (
          <div className="qbk-resume-banner" role="status">
            <span>
              You have an active session with{' '}
              <strong>{activeQBankSession.questions?.length ?? 0}</strong> question
              {(activeQBankSession.questions?.length ?? 0) !== 1 ? 's' : ''} in progress.
            </span>
            <button type="button" className="qbk-resume-btn" onClick={handleResume} disabled={starting || catalog.loading}>
              {starting ? 'Resuming…' : 'Resume session'}
            </button>
            <button type="button" className="qbk-text-btn" onClick={handleDiscardSession} disabled={starting}>
              Discard
            </button>
          </div>
        )}

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
            {needsReviewQuestions.length > 0 && (
              <button type="button" className="qbk-text-btn qbk-retry-btn" onClick={handleRetryNeedsReview} disabled={starting}>
                Retry needs-review ({needsReviewQuestions.length})
              </button>
            )}
          </div>
        </div>

        {catalog.loading ? (
          <div className="qbk-loading" role="status">Loading validated questions…</div>
        ) : visible.length === 0 ? (
          <div className="qbk-empty">
            {hasActiveFilters ? (
              <>
                <strong>No questions match these filters.</strong>
                <span>Try a broader subject, system, difficulty, or search term.</span>
                <button type="button" className="qbk-text-btn qbk-empty-clear" onClick={clearFilters}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <strong>No validated questions are available right now.</strong>
                <span>Check back later, or build a new session to generate fresh questions.</span>
              </>
            )}
          </div>
        ) : (
          <div className="qbk-list" aria-label="Validated questions">
            {visible.map((question, index) => {
              const id = String(question.id)
              const selected = selectedIds.has(id) && inventoryIds.has(id)
              const disabled = !selected && selectionCount >= MAX_SELECTION
              const absoluteNumber = (page - 1) * PAGE_SIZE + index + 1
              const state = getProgressState(question.id, attemptsByQuestion, activeSessionIds)
              const summary = getAttemptSummary(question.id, attemptsByQuestion)
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
                      {question.difficulty && <span className="qbk-difficulty">{getDifficultyDisplayLabel(question.difficulty)}</span>}
                      <span className="qbk-validated">Validated</span>
                      {state !== 'unseen' && (
                        <span className={`qbk-status qbk-status-${state}`}>{STATE_LABEL[state]}</span>
                      )}
                      {summary.count > 0 && (
                        <span className="qbk-attempt-meta">
                          {summary.count}× · {formatDate(summary.lastAttemptedAt)}
                        </span>
                      )}
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
          disabled={selectedQuestions.length === 0 || starting}
          onClick={() => startSession(selectedQuestions)}
        >
          {starting ? 'Starting…' : 'Start Selected Questions'}
        </button>
        {startError && (
          <p className="qbk-start-error" role="alert">{startError}</p>
        )}
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
              {preview.difficulty && <span className="qbk-difficulty">{getDifficultyDisplayLabel(preview.difficulty)}</span>}
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
