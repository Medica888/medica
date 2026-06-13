import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AdminTaxonomyReview from './AdminTaxonomyReview'

vi.mock('../../hooks/useTaxonomyCandidates', () => ({
  useTaxonomyCandidates: vi.fn(),
  useTaxonomyCandidateActions: vi.fn(),
}))

import { useTaxonomyCandidates, useTaxonomyCandidateActions } from '../../hooks/useTaxonomyCandidates'

const makeCandidate = (overrides = {}) => ({
  id:                       'cand-1',
  rawLabel:                 'bradykinin cough',
  rawLabelKey:              'bradykinincough',
  normalizedGuess:          'ACE Inhibitor Cough',
  subject:                  'Pharmacology',
  system:                   'Cardiovascular',
  frequency:                7,
  exampleQuestionFingerprint: 'fp-abc',
  source:                   'concept',
  type:                     'concept',
  status:                   'pending',
  metadata:                 {},
  createdAt:                '2025-01-10T00:00:00Z',
  updatedAt:                '2025-01-10T00:00:00Z',
  lastSeenAt:               '2025-04-01T00:00:00Z',
  ...overrides,
})

const makePage = (candidates, overrides = {}) => ({
  candidates,
  count: candidates.length,
  limit: 100,
  offset: 0,
  ...overrides,
})

const mockAct = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  useTaxonomyCandidates.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() })
  useTaxonomyCandidateActions.mockReturnValue({ pending: false, error: null, act: mockAct })
})

describe('AdminTaxonomyReview', () => {
  it('renders page title', () => {
    render(<AdminTaxonomyReview />)
    expect(screen.getByText('Taxonomy Candidates')).toBeTruthy()
  })

  it('renders loading state', () => {
    useTaxonomyCandidates.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  })

  it('renders empty state when no candidates', () => {
    useTaxonomyCandidates.mockReturnValue({ data: makePage([]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getByText('No candidates found.')).toBeTruthy()
  })

  it('renders candidate row with all key fields', () => {
    const c = makeCandidate()
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getByText('bradykinin cough')).toBeTruthy()
    expect(screen.getByText('ACE Inhibitor Cough')).toBeTruthy()
    expect(screen.getByText('Pharmacology / Cardiovascular')).toBeTruthy()
    expect(screen.getByText('7')).toBeTruthy()
  })

  it('renders status badge for pending candidate', () => {
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    const badges = document.querySelectorAll('.adm-badge-pending')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders type badge for concept candidate', () => {
    const c = makeCandidate({ type: 'concept' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    const badges = document.querySelectorAll('.adm-tc-type-concept')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders type badge for topic candidate', () => {
    const c = makeCandidate({ type: 'topic' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    const badges = document.querySelectorAll('.adm-tc-type-topic')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders Approve, Map, Reject buttons for pending candidate', () => {
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getByLabelText(`Approve ${c.rawLabel} as canonical`)).toBeTruthy()
    expect(screen.getByLabelText(`Map ${c.rawLabel} to existing canonical`)).toBeTruthy()
    expect(screen.getByLabelText(`Reject ${c.rawLabel}`)).toBeTruthy()
  })

  it('does not render Approve/Map/Reject for non-pending candidate', () => {
    const c = makeCandidate({ status: 'approved_canonical' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.queryByLabelText(`Approve ${c.rawLabel} as canonical`)).toBeNull()
    expect(screen.queryByLabelText(`Reject ${c.rawLabel}`)).toBeNull()
  })

  it('calls act with approved_canonical when Approve is clicked', async () => {
    mockAct.mockResolvedValue({ candidate: { ...makeCandidate(), status: 'approved_canonical', metadata: {} } })
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    fireEvent.click(screen.getByLabelText(`Approve ${c.rawLabel} as canonical`))
    await waitFor(() => expect(mockAct).toHaveBeenCalledWith(c.id, 'approved_canonical', {}))
  })

  it('calls act with rejected when Reject is clicked', async () => {
    mockAct.mockResolvedValue({ candidate: { ...makeCandidate(), status: 'rejected', metadata: {} } })
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    fireEvent.click(screen.getByLabelText(`Reject ${c.rawLabel}`))
    await waitFor(() => expect(mockAct).toHaveBeenCalledWith(c.id, 'rejected', {}))
  })

  it('opens map panel when Map button is clicked', () => {
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    fireEvent.click(screen.getByLabelText(`Map ${c.rawLabel} to existing canonical`))
    expect(screen.getByPlaceholderText('e.g. ACE Inhibitor Cough')).toBeTruthy()
  })

  it('submits mapped_alias with correct mappedTo when Confirm is clicked', async () => {
    mockAct.mockResolvedValue({ candidate: { ...makeCandidate(), status: 'mapped_alias', metadata: { mappedTo: 'ACE Inhibitor Cough' } } })
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)

    fireEvent.click(screen.getByLabelText(`Map ${c.rawLabel} to existing canonical`))
    fireEvent.change(screen.getByPlaceholderText('e.g. ACE Inhibitor Cough'), {
      target: { value: 'ACE Inhibitor Cough' },
    })
    fireEvent.click(screen.getByText('Confirm'))
    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith(c.id, 'mapped_alias', { mappedTo: 'ACE Inhibitor Cough' })
    )
  })

  it('Confirm button is disabled when mapTarget is empty', () => {
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    fireEvent.click(screen.getByLabelText(`Map ${c.rawLabel} to existing canonical`))
    const confirmBtn = screen.getByText('Confirm')
    expect(confirmBtn.disabled).toBe(true)
  })

  it('cancels map panel when Cancel is clicked', () => {
    const c = makeCandidate({ status: 'pending' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    fireEvent.click(screen.getByLabelText(`Map ${c.rawLabel} to existing canonical`))
    expect(screen.getByPlaceholderText('e.g. ACE Inhibitor Cough')).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByPlaceholderText('e.g. ACE Inhibitor Cough')).toBeNull()
  })

  it('opens note panel when Add Note is clicked', () => {
    const c = makeCandidate()
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    fireEvent.click(screen.getByLabelText(`Add note for ${c.rawLabel}`))
    expect(screen.getByPlaceholderText('Add an admin note…')).toBeTruthy()
  })

  it('shows error message on fetch failure', () => {
    useTaxonomyCandidates.mockReturnValue({ data: null, loading: false, error: new Error('Network error'), refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getByText(/Failed to load candidates/)).toBeTruthy()
  })

  it('renders all status filter tabs', () => {
    render(<AdminTaxonomyReview />)
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getAllByText('All').length).toBeGreaterThan(0)
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Mapped')).toBeTruthy()
    expect(screen.getByText('Rejected')).toBeTruthy()
  })

  it('renders type filter tabs', () => {
    render(<AdminTaxonomyReview />)
    const allBtns = screen.getAllByText('All')
    expect(allBtns.length).toBeGreaterThan(0)
    expect(screen.getByText('Topic')).toBeTruthy()
    expect(screen.getByText('Concept')).toBeTruthy()
  })

  it('disables Previous page button on first page', () => {
    useTaxonomyCandidates.mockReturnValue({ data: makePage([makeCandidate()]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getByLabelText('Previous page').disabled).toBe(true)
  })

  it('disables Next page button when fewer results than page size', () => {
    useTaxonomyCandidates.mockReturnValue({ data: makePage([makeCandidate()]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    expect(screen.getByLabelText('Next page').disabled).toBe(true)
  })

  it('shows mapped canonical badge for approved_canonical candidate', () => {
    const c = makeCandidate({ status: 'approved_canonical' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    const badges = document.querySelectorAll('.adm-badge-approved')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('shows rejected badge for rejected candidate', () => {
    const c = makeCandidate({ status: 'rejected' })
    useTaxonomyCandidates.mockReturnValue({ data: makePage([c]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminTaxonomyReview />)
    const badges = document.querySelectorAll('.adm-badge-quarantined')
    expect(badges.length).toBeGreaterThan(0)
  })
})
