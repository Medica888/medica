import { useState, useEffect, useCallback, useRef } from 'react'
import { getAuthToken, exams } from '../lib/apiClient.js'
import { getSessionHistory } from '../lib/storage.js'
import { normalizeAnswerLetter } from '../lib/answerNormalize.js'

const PAGE_LIMIT = 100
const MAX_SESSIONS = 500

// ── Backend-to-frontend shape adapter ─────────────────────────────────────

function _toIso(v) {
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' ? v : String(v ?? '')
}

function _toArray(val) {
  if (Array.isArray(val)) return val
  return Object.entries(val ?? {}).map(([name, stats]) => ({
    name,
    correct:    stats.correct    ?? 0,
    total:      stats.total      ?? 0,
    percentage: stats.percentage ?? 0,
  }))
}

function _rebuildBreakdowns(questions, answers) {
  const usmleMap = {}
  const taskMap  = {}

  for (const q of questions) {
    const isCorrect = normalizeAnswerLetter(answers[q.id]) === normalizeAnswerLetter(q.correct_answer)

    const usmle = q.usmleContentArea || ''
    if (usmle) {
      if (!usmleMap[usmle]) usmleMap[usmle] = { correct: 0, total: 0 }
      usmleMap[usmle].total++
      if (isCorrect) usmleMap[usmle].correct++
    }

    const task = q.physicianTask || ''
    if (task) {
      if (!taskMap[task]) taskMap[task] = { correct: 0, total: 0 }
      taskMap[task].total++
      if (isCorrect) taskMap[task].correct++
    }
  }

  const toArr = (map) => Object.entries(map).map(([name, d]) => ({
    name,
    correct:    d.correct,
    total:      d.total,
    percentage: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
  }))

  return {
    usmleContentBreakdown:  toArr(usmleMap),
    physicianTaskBreakdown: toArr(taskMap),
  }
}

export function normalizeBackendSession(s) {
  const questions = Array.isArray(s.questions) ? s.questions : []
  const answers   = s.answers && typeof s.answers === 'object' ? s.answers : {}
  const { usmleContentBreakdown, physicianTaskBreakdown } = _rebuildBreakdowns(questions, answers)

  return {
    id:                    s.id,
    completedAt:           _toIso(s.completed_at),
    mode:                  s.mode,
    total:                 questions.length,
    correct:               s.score ?? 0,
    percentage:            s.percentage ?? 0,
    medicaScore:           s.medica_score ?? 0,
    readinessLabel:        s.readiness_label ?? '',
    subjectBreakdown:      _toArray(s.subject_breakdown),
    systemBreakdown:       _toArray(s.system_breakdown),
    missedQuestions:       Array.isArray(s.missed_questions) ? s.missed_questions : [],
    usmleContentBreakdown,
    physicianTaskBreakdown,
    difficulty:            s.difficulty ?? '',
  }
}

// ── Paginated backend fetch ────────────────────────────────────────────────

async function _fetchAllSessions() {
  const all = []
  let page = 1

  while (all.length < MAX_SESSIONS) {
    const { data, totalPages } = await exams.list(page, PAGE_LIMIT)
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data.map(normalizeBackendSession))
    if (page >= totalPages) break
    page++
  }

  return all.slice(0, MAX_SESSIONS)
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useSessionHistory() {
  // Evaluate at call time so vi.stubEnv works in tests and hot-reloading is safe.
  // Both flags must be true: VITE_USE_BACKEND gates the write path in dataProvider
  // — if backend writes are disabled the backend has no data, so reads must also stay local.
  const useBackend = import.meta.env.VITE_USE_BACKEND === 'true'
  const isReady    = useBackend && !!getAuthToken()

  const [sessions, setSessions] = useState(getSessionHistory)
  const [loading, setLoading]   = useState(isReady)
  const [error, setError]       = useState(null)
  const [source, setSource]     = useState(isReady ? 'backend' : 'localStorage')

  // cancelRef is set to true on unmount so in-flight multi-page fetches drop their results.
  const cancelRef = useRef(false)

  const refresh = useCallback(() => {
    cancelRef.current = false
    const backendEnabled = import.meta.env.VITE_USE_BACKEND === 'true'
    if (!backendEnabled || !getAuthToken()) {
      setSessions(getSessionHistory())
      setSource('localStorage')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    _fetchAllSessions()
      .then(data => {
        if (cancelRef.current) return
        setSessions(data)
        setSource('backend')
      })
      .catch(err => {
        if (cancelRef.current) return
        console.warn('[useSessionHistory] Backend fetch failed, falling back:', err.message)
        setSessions(getSessionHistory())
        setSource('fallback')
        setError(err.message)
      })
      .finally(() => {
        if (!cancelRef.current) setLoading(false)
      })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return () => { cancelRef.current = true }
  }, [refresh])

  return { sessions, loading, error, source, refresh }
}
