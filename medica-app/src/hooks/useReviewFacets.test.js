import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../lib/apiClient', () => ({
  governance: { facets: vi.fn() },
}))

import { governance } from '../lib/apiClient'
import { useReviewFacets } from './useAdminReview'

beforeEach(() => vi.clearAllMocks())

describe('useReviewFacets', () => {
  it('loads the facet labels once and stops loading', async () => {
    const facets = { subjects: ['Anatomy'], systems: ['Renal'], difficulties: ['Balanced'] }
    governance.facets.mockResolvedValue(facets)

    const { result } = renderHook(() => useReviewFacets())
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual(facets)
    expect(result.current.error).toBeNull()
    expect(governance.facets).toHaveBeenCalledTimes(1)
  })

  it('exposes a failure as error state instead of throwing', async () => {
    governance.facets.mockRejectedValue(new Error('forbidden'))

    const { result } = renderHook(() => useReviewFacets())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error.message).toBe('forbidden')
  })
})
