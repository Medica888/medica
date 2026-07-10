import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useReporterEligibility } from './useReporterEligibility'
import { useAuth } from '../context/AuthContext.jsx'
import { questionReports } from '../lib/apiClient'

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../lib/apiClient', () => ({
  questionReports: {
    getEligibility: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useReporterEligibility', () => {
  it('returns null and does not fetch for an anonymous user', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: null })
    const { result } = renderHook(() => useReporterEligibility())

    expect(result.current).toBeNull()
    expect(questionReports.getEligibility).not.toHaveBeenCalled()
  })

  it('fetches and returns the server eligibility for an authenticated user', async () => {
    const eligibility = { eligible: true, reason: 'eligible', eligibleAt: '2026-01-01T00:00:00.000Z' }
    vi.mocked(useAuth).mockReturnValue({ authUser: { id: 'hook-user-1' } })
    vi.mocked(questionReports.getEligibility).mockResolvedValue(eligibility)

    const { result } = renderHook(() => useReporterEligibility())
    expect(result.current).toBeNull()

    await waitFor(() => expect(result.current).toEqual(eligibility))
  })

  it('resolves to null instead of throwing when the request fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: { id: 'hook-user-2' } })
    vi.mocked(questionReports.getEligibility).mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useReporterEligibility())

    await waitFor(() => expect(questionReports.getEligibility).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('shares a single in-flight fetch across multiple hook instances for the same user', async () => {
    const eligibility = { eligible: false, reason: 'email_unverified', eligibleAt: null }
    vi.mocked(useAuth).mockReturnValue({ authUser: { id: 'hook-user-3' } })
    vi.mocked(questionReports.getEligibility).mockResolvedValue(eligibility)

    const first = renderHook(() => useReporterEligibility())
    const second = renderHook(() => useReporterEligibility())

    await waitFor(() => expect(first.result.current).toEqual(eligibility))
    await waitFor(() => expect(second.result.current).toEqual(eligibility))
    expect(questionReports.getEligibility).toHaveBeenCalledTimes(1)
  })
})
