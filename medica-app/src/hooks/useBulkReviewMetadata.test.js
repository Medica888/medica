import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../lib/apiClient', () => ({
  governance: { updateStatus: vi.fn(), updateReviewMetadata: vi.fn(), list: vi.fn(), get: vi.fn(), history: vi.fn(), metrics: vi.fn() },
}))

import { governance } from '../lib/apiClient'
import { useBulkReviewMetadata, useBulkReviewActions } from './useAdminReview'

const metadata = { reviewStatus: 'source_checked', sourceRefs: ['First Aid 2025'], medicalAccuracyStatus: 'pass' }

beforeEach(() => vi.clearAllMocks())

describe('useBulkReviewMetadata', () => {
  it('applies the same metadata to each unique id', async () => {
    governance.updateReviewMetadata.mockResolvedValue({})
    const { result } = renderHook(() => useBulkReviewMetadata())
    let outcome
    await act(async () => { outcome = await result.current.applyBulk(['a', 'b', 'a', ' '], metadata) })
    expect(governance.updateReviewMetadata).toHaveBeenCalledTimes(2)
    expect(governance.updateReviewMetadata).toHaveBeenCalledWith('a', metadata)
    expect(governance.updateReviewMetadata).toHaveBeenCalledWith('b', metadata)
    expect(outcome).toEqual({ succeeded: ['a', 'b'], failed: [] })
    expect(result.current.error).toBeNull()
  })

  it('reports partial failures without throwing', async () => {
    governance.updateReviewMetadata
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('403'))
    const { result } = renderHook(() => useBulkReviewMetadata())
    let outcome
    await act(async () => { outcome = await result.current.applyBulk(['a', 'b'], metadata) })
    expect(outcome.succeeded).toEqual(['a'])
    expect(outcome.failed.map(f => f.id)).toEqual(['b'])
    expect(result.current.error.message).toBe('1 review action failed.')
    expect(result.current.pending).toBe(false)
  })

  it('does nothing for an empty selection', async () => {
    const { result } = renderHook(() => useBulkReviewMetadata())
    let outcome
    await act(async () => { outcome = await result.current.applyBulk([], metadata) })
    expect(outcome).toEqual({ succeeded: [], failed: [] })
    expect(governance.updateReviewMetadata).not.toHaveBeenCalled()
  })
})

describe('useBulkReviewActions (shared runner)', () => {
  it('still passes the status through to updateStatus', async () => {
    governance.updateStatus.mockResolvedValue({})
    const { result } = renderHook(() => useBulkReviewActions())
    await act(async () => { await result.current.actBulk(['a'], 'approved') })
    expect(governance.updateStatus).toHaveBeenCalledWith('a', 'approved')
  })
})
