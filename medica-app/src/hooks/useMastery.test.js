import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useMasteryOverview, useMasteryWeakest, useMasteryStrongest } from './useMastery'

// Mock the entire apiClient module
vi.mock('../lib/apiClient', () => ({
  getAuthToken: vi.fn(),
  mastery: {
    overview:                  vi.fn(),
    weakest:                   vi.fn(),
    strongest:                 vi.fn(),
    concept:                   vi.fn(),
    adaptivePreview:           vi.fn(),
    adaptiveFlashcardsPreview: vi.fn(),
  },
}))

import * as apiClient from '../lib/apiClient'

const OVERVIEW_DATA = {
  total_concepts:    5,
  avg_mastery_score: 0.6,
  avg_confidence:    0.4,
  distribution:      { priority: 2, focus: 1, reinforced: 1, ontrack: 1 },
  confident_concepts: 0,
}

const WEAKEST_DATA = {
  concepts: [
    { concept: { id: 'c1', name: 'AKI' }, mastery: { mastery_score: 0.1, attempts: 3 }, tier: 'priority' },
  ],
  count: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useMasteryOverview', () => {
  it('returns loading=true initially', () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.overview.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useMasteryOverview())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data when fetch succeeds', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.overview.mockResolvedValue(OVERVIEW_DATA)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(OVERVIEW_DATA)
    expect(result.current.error).toBeNull()
  })

  it('skips fetch and returns loading=false when no token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(apiClient.mastery.overview).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
  })

  it('sets error when fetch rejects (non-401)', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    const err = new Error('Server error')
    apiClient.mastery.overview.mockRejectedValue(err)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(err)
    expect(result.current.data).toBeNull()
  })

  it('sets error on 401 — caller decides whether to show it', async () => {
    apiClient.getAuthToken.mockReturnValue('expired-token')
    const err = Object.assign(new Error('Unauthorized'), { status: 401 })
    apiClient.mastery.overview.mockRejectedValue(err)
    const { result } = renderHook(() => useMasteryOverview())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error?.status).toBe(401)
  })
})

describe('useMasteryWeakest', () => {
  it('returns weakest concepts data', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.weakest.mockResolvedValue(WEAKEST_DATA)
    const { result } = renderHook(() => useMasteryWeakest(5, 1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(WEAKEST_DATA)
  })

  it('passes limit and minAttempts to the API call', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.weakest.mockResolvedValue({ concepts: [], count: 0 })
    renderHook(() => useMasteryWeakest(8, 2))
    await waitFor(() => expect(apiClient.mastery.weakest).toHaveBeenCalledWith(8, 2))
  })
})

describe('useMasteryStrongest', () => {
  it('returns empty data without error when fetch returns empty list', async () => {
    apiClient.getAuthToken.mockReturnValue('tok')
    apiClient.mastery.strongest.mockResolvedValue({ concepts: [], count: 0 })
    const { result } = renderHook(() => useMasteryStrongest(5, 1))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.concepts).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('skips fetch when no auth token', async () => {
    apiClient.getAuthToken.mockReturnValue(null)
    renderHook(() => useMasteryStrongest(5, 1))
    expect(apiClient.mastery.strongest).not.toHaveBeenCalled()
  })
})
