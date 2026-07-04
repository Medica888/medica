import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useQBankCatalog } from './useQBankCatalog.js'

const authMocks = vi.hoisted(() => {
  const isAuthenticated = vi.fn()
  const listeners = new Set()
  return {
    isAuthenticated,
    getAuthStateSnapshot: vi.fn(() => isAuthenticated() ? 'authenticated:test-user' : 'anonymous:'),
    subscribeAuthState: vi.fn(listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }),
    notify: () => listeners.forEach(listener => listener()),
  }
})

vi.mock('../lib/apiClient.js', () => ({
  ...authMocks,
  qbank: { catalog: vi.fn() },
}))

vi.mock('../lib/mockQuestions.js', () => ({
  getBrowsableQuestionBank: vi.fn(() => []),
}))

import { qbank } from '../lib/apiClient.js'
import { getBrowsableQuestionBank } from '../lib/mockQuestions.js'

function makeCatalogQuestion(id, overrides = {}) {
  return { id, subject: 'Cardiology', system: 'Cardiovascular', difficulty: 'Balanced', stem: `stem ${id}`, options: [], ...overrides }
}

describe('useQBankCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_USE_BACKEND', 'false')
    authMocks.isAuthenticated.mockReturnValue(false)
    getBrowsableQuestionBank.mockReturnValue([makeCatalogQuestion('local-1')])
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('backend disabled: returns the local bundle, source=local, no fetch', () => {
    const { result } = renderHook(() => useQBankCatalog())
    expect(result.current.source).toBe('local')
    expect(result.current.questions).toEqual([makeCatalogQuestion('local-1')])
    expect(result.current.loading).toBe(false)
    expect(qbank.catalog).not.toHaveBeenCalled()
  })

  it('backend enabled but not authenticated: still uses the local bundle', () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(false)
    const { result } = renderHook(() => useQBankCatalog())
    expect(result.current.source).toBe('local')
    expect(qbank.catalog).not.toHaveBeenCalled()
  })

  it('backend enabled + authenticated: fetches the catalog, source=backend', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(true)
    qbank.catalog.mockResolvedValue({
      data: [makeCatalogQuestion('be-1')],
      totalPages: 1,
    })

    const { result } = renderHook(() => useQBankCatalog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.source).toBe('backend')
    expect(result.current.questions).toEqual([makeCatalogQuestion('be-1')])
    expect(result.current.error).toBeNull()
  })

  it('backend failure: falls back to the local bundle, source=fallback, error set', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(true)
    qbank.catalog.mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useQBankCatalog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.source).toBe('fallback')
    expect(result.current.questions).toEqual([makeCatalogQuestion('local-1')])
    expect(result.current.error).toBe('Network error')
  })

  it('paginates through the catalog until totalPages is exhausted', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(true)
    qbank.catalog
      .mockResolvedValueOnce({ data: [makeCatalogQuestion('be-1'), makeCatalogQuestion('be-2')], totalPages: 2 })
      .mockResolvedValueOnce({ data: [makeCatalogQuestion('be-3')], totalPages: 2 })

    const { result } = renderHook(() => useQBankCatalog())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(qbank.catalog).toHaveBeenCalledTimes(2)
    expect(result.current.questions).toHaveLength(3)
  })

  it('refresh() re-fetches on demand', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(true)
    qbank.catalog.mockResolvedValue({ data: [], totalPages: 1 })

    const { result } = renderHook(() => useQBankCatalog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    qbank.catalog.mockResolvedValue({ data: [makeCatalogQuestion('new-1')], totalPages: 1 })
    result.current.refresh()

    await waitFor(() => expect(result.current.questions).toHaveLength(1))
  })

  it('switches from local data to backend data after authentication changes', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(false)
    qbank.catalog.mockResolvedValue({ data: [makeCatalogQuestion('be-1')], totalPages: 1 })

    const { result } = renderHook(() => useQBankCatalog())
    expect(result.current.source).toBe('local')

    authMocks.isAuthenticated.mockReturnValue(true)
    act(() => authMocks.notify())

    await waitFor(() => expect(result.current.source).toBe('backend'))
    expect(result.current.questions[0].id).toBe('be-1')
  })

  it('passes the initial search term through on mount without waiting for the debounce', async () => {
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(true)
    qbank.catalog.mockResolvedValue({ data: [makeCatalogQuestion('be-1')], totalPages: 1 })

    renderHook(() => useQBankCatalog('pericarditis'))

    await waitFor(() => expect(qbank.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'pericarditis' }),
    ))
  })

  it('debounces search changes instead of firing a request per keystroke', async () => {
    vi.useFakeTimers()
    vi.stubEnv('VITE_USE_BACKEND', 'true')
    authMocks.isAuthenticated.mockReturnValue(true)
    qbank.catalog.mockResolvedValue({ data: [], totalPages: 1 })

    const { rerender } = renderHook((search) => useQBankCatalog(search), { initialProps: '' })
    await vi.waitFor(() => expect(qbank.catalog).toHaveBeenCalledTimes(1))

    rerender('p')
    rerender('pe')
    rerender('per')
    expect(qbank.catalog).toHaveBeenCalledTimes(1)

    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(qbank.catalog).toHaveBeenCalledTimes(2)
    expect(qbank.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'per' }))

    vi.useRealTimers()
  })
})
