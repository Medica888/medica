import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

vi.mock('../lib/apiClient', () => ({
  governance: { facets: vi.fn(), exportCsv: vi.fn() },
}))

import { governance } from '../lib/apiClient'
import { act } from '@testing-library/react'
import { useReviewExport, useReviewFacets } from './useAdminReview'

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

describe('useReviewExport', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:review')
    URL.revokeObjectURL = vi.fn()
  })

  it('downloads the CSV through a temporary link and cleans up', async () => {
    const blob = new Blob(['id\r\n'], { type: 'text/csv' })
    governance.exportCsv.mockResolvedValue(blob)
    const clicked = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { clicked.push(this.download) })

    const { result } = renderHook(() => useReviewExport())
    await act(async () => { await result.current.exportCsv({ difficulty: 'Balanced' }) })

    expect(governance.exportCsv).toHaveBeenCalledWith({ difficulty: 'Balanced' })
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(clicked).toEqual(['review-queue.csv'])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:review')
    expect(document.querySelector('a[download]')).toBeNull()
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeNull()
    click.mockRestore()
  })

  it('exposes a failed export as error state and never triggers a download', async () => {
    governance.exportCsv.mockRejectedValue(new Error('forbidden'))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const { result } = renderHook(() => useReviewExport())
    await act(async () => { await result.current.exportCsv({}) })

    expect(result.current.error.message).toBe('forbidden')
    expect(result.current.pending).toBe(false)
    expect(click).not.toHaveBeenCalled()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    click.mockRestore()
  })
})
