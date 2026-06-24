import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { normalizeBackendSession, useSessionHistory } from './useSessionHistory.js'

vi.mock('../lib/apiClient.js', () => ({
  isAuthenticated: vi.fn(),
  exams: { list: vi.fn() },
}))

vi.mock('../lib/storage.js', () => ({
  getSessionHistory: vi.fn(() => []),
}))

import { isAuthenticated, exams } from '../lib/apiClient.js'
import { getSessionHistory } from '../lib/storage.js'

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeBackendSession(overrides = {}) {
  return {
    id:               'uuid-1',
    mode:             'practice',
    score:            7,
    percentage:       70,
    medica_score:     210,
    readiness_label:  'Developing',
    difficulty:       'Balanced',
    completed_at:     '2026-06-14T12:00:00.000Z',
    questions:        [],
    answers:          {},
    subject_breakdown: {},
    system_breakdown:  {},
    missed_questions:  [],
    ...overrides,
  }
}

// ── normalizeBackendSession ───────────────────────────────────────────────

describe('normalizeBackendSession — field mapping', () => {
  it('maps snake_case to camelCase', () => {
    const s = normalizeBackendSession(makeBackendSession())
    expect(s.completedAt).toBe('2026-06-14T12:00:00.000Z')
    expect(s.medicaScore).toBe(210)
    expect(s.readinessLabel).toBe('Developing')
  })

  it('uses questions.length as total', () => {
    const s = normalizeBackendSession(makeBackendSession({
      questions: [{ id: 'q1', correct_answer: 'A' }, { id: 'q2', correct_answer: 'B' }],
    }))
    expect(s.total).toBe(2)
  })

  it('maps score → correct', () => {
    const s = normalizeBackendSession(makeBackendSession({ score: 7 }))
    expect(s.correct).toBe(7)
  })

  it('converts subject_breakdown Record to Array', () => {
    const s = normalizeBackendSession(makeBackendSession({
      subject_breakdown: { Pathology: { correct: 7, total: 10, percentage: 70 } },
    }))
    expect(s.subjectBreakdown).toEqual([
      { name: 'Pathology', correct: 7, total: 10, percentage: 70 },
    ])
  })

  it('passes through subject_breakdown that is already an Array', () => {
    const arr = [{ name: 'Pathology', correct: 7, total: 10, percentage: 70 }]
    const s = normalizeBackendSession(makeBackendSession({ subject_breakdown: arr }))
    expect(s.subjectBreakdown).toEqual(arr)
  })

  it('converts a Date object for completed_at to ISO string', () => {
    const s = normalizeBackendSession(makeBackendSession({
      completed_at: new Date('2026-06-14T12:00:00.000Z'),
    }))
    expect(s.completedAt).toBe('2026-06-14T12:00:00.000Z')
  })

  it('handles missing/empty fields without throwing', () => {
    const s = normalizeBackendSession({ id: 'x', mode: 'exam', score: 0, percentage: 0 })
    expect(s.total).toBe(0)
    expect(s.subjectBreakdown).toEqual([])
    expect(s.systemBreakdown).toEqual([])
    expect(s.missedQuestions).toEqual([])
    expect(s.usmleContentBreakdown).toEqual([])
    expect(s.physicianTaskBreakdown).toEqual([])
    expect(s.readinessLabel).toBe('')
    expect(s.difficulty).toBe('')
  })
})

describe('normalizeBackendSession — breakdown reconstruction', () => {
  const questions = [
    { id: 'q1', correct_answer: 'A', usmleContentArea: 'Cardiovascular System', physicianTask: 'Patient Care' },
    { id: 'q2', correct_answer: 'B', usmleContentArea: 'Cardiovascular System', physicianTask: '' },
    { id: 'q3', correct_answer: 'C', usmleContentArea: '', physicianTask: 'Patient Care' },
  ]

  it('reconstructs usmleContentBreakdown from per-question data', () => {
    const s = normalizeBackendSession(makeBackendSession({
      questions,
      answers: { q1: 'A', q2: 'C', q3: 'C' },
    }))
    expect(s.usmleContentBreakdown).toEqual([
      { name: 'Cardiovascular System', correct: 1, total: 2, percentage: 50 },
    ])
  })

  it('reconstructs physicianTaskBreakdown from per-question data', () => {
    const s = normalizeBackendSession(makeBackendSession({
      questions,
      answers: { q1: 'A', q2: 'C', q3: 'C' },
    }))
    expect(s.physicianTaskBreakdown).toEqual([
      { name: 'Patient Care', correct: 2, total: 2, percentage: 100 },
    ])
  })

  it('counts unanswered questions as incorrect', () => {
    const s = normalizeBackendSession(makeBackendSession({
      questions: [{ id: 'q1', correct_answer: 'A', usmleContentArea: 'Biochemistry', physicianTask: '' }],
      answers: {},
    }))
    expect(s.usmleContentBreakdown).toEqual([
      { name: 'Biochemistry', correct: 0, total: 1, percentage: 0 },
    ])
  })
})

// ── completedAt dedup ─────────────────────────────────────────────────────

describe('completedAt dedup — string and Date round-trips both produce the same ISO value', () => {
  const iso = '2026-06-14T12:00:00.000Z'

  it('ISO string completed_at passes through unchanged', () => {
    const s = normalizeBackendSession(makeBackendSession({ completed_at: iso }))
    expect(s.completedAt).toBe(iso)
  })

  it('Date object completed_at serializes to the same ISO string', () => {
    const s = normalizeBackendSession(makeBackendSession({ completed_at: new Date(iso) }))
    expect(s.completedAt).toBe(iso)
  })

  it('Date object and ISO string inputs produce the same completedAt for dedup', () => {
    const fromDate = normalizeBackendSession(makeBackendSession({ completed_at: new Date(iso) }))
    const fromStr  = normalizeBackendSession(makeBackendSession({ completed_at: iso }))
    expect(fromDate.completedAt).toBe(fromStr.completedAt)
    expect(fromDate.completedAt).toBe(iso)
  })
})

// ── useSessionHistory hook ────────────────────────────────────────────────

describe('useSessionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: backend disabled, no token
    vi.stubEnv('VITE_USE_BACKEND', 'false')
    isAuthenticated.mockReturnValue(false)
    getSessionHistory.mockReturnValue([])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('anonymous user: returns localStorage sessions, source=localStorage, loading=false', () => {
    getSessionHistory.mockReturnValue([{ id: 'local-1' }])
    const { result } = renderHook(() => useSessionHistory())
    expect(result.current.source).toBe('localStorage')
    expect(result.current.sessions).toEqual([{ id: 'local-1' }])
    expect(result.current.loading).toBe(false)
    expect(exams.list).not.toHaveBeenCalled()
  })

  it('token present but USE_BACKEND=false: still uses localStorage', () => {
    isAuthenticated.mockReturnValue(true)
    getSessionHistory.mockReturnValue([{ id: 'local-1' }])
    const { result } = renderHook(() => useSessionHistory())
    expect(result.current.source).toBe('localStorage')
    expect(exams.list).not.toHaveBeenCalled()
  })

  it('USE_BACKEND=true + token: fetches from backend, source=backend', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    isAuthenticated.mockReturnValue(true)
    exams.list.mockResolvedValue({
      data: [makeBackendSession({ id: 'be-1' })],
      totalPages: 1,
    })

    const { result } = renderHook(() => useSessionHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.source).toBe('backend')
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe('be-1')
    expect(result.current.error).toBeNull()
  })

  it('backend failure: falls back to localStorage, source=fallback, error set', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    isAuthenticated.mockReturnValue(true)
    getSessionHistory.mockReturnValue([{ id: 'local-1' }])
    exams.list.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useSessionHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.source).toBe('fallback')
    expect(result.current.sessions).toEqual([{ id: 'local-1' }])
    expect(result.current.error).toBe('Network error')
  })

  it('empty backend response: source=backend, sessions=[]', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    isAuthenticated.mockReturnValue(true)
    getSessionHistory.mockReturnValue([{ id: 'local-1' }])
    exams.list.mockResolvedValue({ data: [], totalPages: 1 })

    const { result } = renderHook(() => useSessionHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.source).toBe('backend')
    expect(result.current.sessions).toEqual([])
  })

  it('pagination: fetches all pages until totalPages exhausted', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    isAuthenticated.mockReturnValue(true)

    exams.list
      .mockResolvedValueOnce({
        data: [makeBackendSession({ id: 'be-1' }), makeBackendSession({ id: 'be-2' })],
        totalPages: 2,
      })
      .mockResolvedValueOnce({
        data: [makeBackendSession({ id: 'be-3' })],
        totalPages: 2,
      })

    const { result } = renderHook(() => useSessionHistory())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(exams.list).toHaveBeenCalledTimes(2)
    expect(result.current.sessions).toHaveLength(3)
  })

  it('refresh() re-fetches on demand', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    isAuthenticated.mockReturnValue(true)
    exams.list.mockResolvedValue({ data: [], totalPages: 1 })

    const { result } = renderHook(() => useSessionHistory())
    await waitFor(() => expect(result.current.loading).toBe(false))

    exams.list.mockResolvedValue({
      data: [makeBackendSession({ id: 'new-1' })],
      totalPages: 1,
    })

    result.current.refresh()
    await waitFor(() => {
      expect(result.current.sessions).toHaveLength(1)
      expect(result.current.sessions[0].id).toBe('new-1')
    })
  })
})
