import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminGovernanceDashboard from './AdminGovernanceDashboard'

vi.mock('../../hooks/useAdminGovernance', () => ({
  useGovernanceMetrics: vi.fn(),
}))

import { useGovernanceMetrics } from '../../hooks/useAdminGovernance'

const makeMetrics = (overrides = {}) => ({
  metrics: {
    total:                100,
    legacy:               10,
    validatedGenerated:   30,
    approved:             55,
    quarantined:          5,
    used:                 40,
    totalUsage:           320,
    approvalRate:         0.73,
    quarantineRate:       0.07,
    averageValidationScore: 82.4,
    ...overrides,
  },
  recentApprovals:   [],
  recentQuarantines: [],
})

beforeEach(() => {
  useGovernanceMetrics.mockReturnValue({ data: null, loading: true, error: null })
})

describe('AdminGovernanceDashboard', () => {
  it('renders page title', () => {
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('Governance Dashboard')).toBeTruthy()
  })

  it('renders loading state', () => {
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('Loading metrics...')).toBeTruthy()
  })

  it('renders error state', () => {
    useGovernanceMetrics.mockReturnValue({ data: null, loading: false, error: new Error('Server error') })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText(/Failed to load metrics/)).toBeTruthy()
  })

  it('renders metric cards', () => {
    useGovernanceMetrics.mockReturnValue({ data: makeMetrics(), loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('Total Generated')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Quarantined')).toBeTruthy()
    expect(screen.getByText('Pending Review')).toBeTruthy()
  })

  it('renders approval rate', () => {
    useGovernanceMetrics.mockReturnValue({ data: makeMetrics(), loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('73%')).toBeTruthy()
  })

  it('renders average validation score', () => {
    useGovernanceMetrics.mockReturnValue({ data: makeMetrics(), loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('82.4%')).toBeTruthy()
  })

  it('renders recent approvals section', () => {
    useGovernanceMetrics.mockReturnValue({ data: makeMetrics(), loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('Recent Approvals')).toBeTruthy()
  })

  it('renders recent quarantines section', () => {
    useGovernanceMetrics.mockReturnValue({ data: makeMetrics(), loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('Recent Quarantines')).toBeTruthy()
  })

  it('shows empty state for recent approvals', () => {
    useGovernanceMetrics.mockReturnValue({ data: makeMetrics(), loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('No recent approvals.')).toBeTruthy()
  })

  it('renders recent approval entries', () => {
    const data = makeMetrics()
    data.recentApprovals = [{ action: 'approved', questionId: 'fp-test-q1', createdAt: '2025-04-01T10:00:00Z' }]
    useGovernanceMetrics.mockReturnValue({ data, loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    expect(screen.getByText('approved')).toBeTruthy()
  })

  it('shows - when averageValidationScore is null', () => {
    const data = makeMetrics({ averageValidationScore: null })
    useGovernanceMetrics.mockReturnValue({ data: { ...data, metrics: { ...data.metrics, averageValidationScore: null } }, loading: false, error: null })
    render(<AdminGovernanceDashboard />)
    // The '-' should appear somewhere
    const dashes = screen.getAllByText('-')
    expect(dashes.length).toBeGreaterThan(0)
  })
})
