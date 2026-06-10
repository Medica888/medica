import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AdminReviewQueue from './AdminReviewQueue'

vi.mock('../../hooks/useAdminReview', () => ({
  useReviewQueue: vi.fn(),
}))

import { useReviewQueue } from '../../hooks/useAdminReview'

const makeQuestion = (overrides = {}) => ({
  externalId:      'fp-test-1',
  subject:         'Pathology',
  system:          'Cardiovascular',
  difficulty:      'Medium',
  bankStatus:      'validated_generated',
  validationScore: 78,
  createdAt:       '2025-01-15T12:00:00Z',
  lastUsedAt:      null,
  usageCount:      3,
  ...overrides,
})

const makePage = (questions, overrides = {}) => ({
  questions,
  total:   questions.length,
  count:   questions.length,
  limit:   50,
  offset:  0,
  page:    1,
  hasMore: false,
  ...overrides,
})

beforeEach(() => {
  useReviewQueue.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() })
})

describe('AdminReviewQueue', () => {
  it('renders page title', () => {
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByText('Review Queue')).toBeTruthy()
  })

  it('renders loading state', () => {
    useReviewQueue.mockReturnValue({ data: null, loading: true, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getAllByText('Loading…').length).toBeGreaterThan(0)
  })

  it('renders empty state', () => {
    useReviewQueue.mockReturnValue({ data: makePage([]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByText('No questions found.')).toBeTruthy()
  })

  it('renders questions in table', () => {
    const q = makeQuestion()
    useReviewQueue.mockReturnValue({ data: makePage([q]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByText('Pathology')).toBeTruthy()
    expect(screen.getByText('Cardiovascular')).toBeTruthy()
    expect(screen.getByText('78%')).toBeTruthy()
  })

  it('shows total count', () => {
    useReviewQueue.mockReturnValue({ data: makePage([makeQuestion()]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByText('1 question')).toBeTruthy()
  })

  it('calls onSelectDetail when Review button clicked', () => {
    const onSelect = vi.fn()
    const q = makeQuestion({ externalId: 'fp-abc' })
    useReviewQueue.mockReturnValue({ data: makePage([q]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={onSelect} />)
    fireEvent.click(screen.getByText('Review'))
    expect(onSelect).toHaveBeenCalledWith('fp-abc')
  })

  it('renders all status filter tabs', () => {
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Quarantined')).toBeTruthy()
  })

  it('shows error message on fetch failure', () => {
    useReviewQueue.mockReturnValue({ data: null, loading: false, error: new Error('Network error'), refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByText(/Failed to load questions/)).toBeTruthy()
  })

  it('disables Next when hasMore is false', () => {
    useReviewQueue.mockReturnValue({ data: makePage([makeQuestion()], { hasMore: false }), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    const nextBtn = screen.getByLabelText('Next page')
    expect(nextBtn.disabled).toBe(true)
  })

  it('disables Previous on first page', () => {
    useReviewQueue.mockReturnValue({ data: makePage([makeQuestion()]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    const prevBtn = screen.getByLabelText('Previous page')
    expect(prevBtn.disabled).toBe(true)
  })

  it('renders sort select with priority option', () => {
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    expect(screen.getByDisplayValue('Highest Priority')).toBeTruthy()
  })

  it('renders status badge for approved question', () => {
    const q = makeQuestion({ bankStatus: 'approved' })
    useReviewQueue.mockReturnValue({ data: makePage([q]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    // "Approved" appears in filter tab + badge — verify badge class exists
    const badges = document.querySelectorAll('.adm-badge-approved')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('renders status badge for quarantined question', () => {
    const q = makeQuestion({ bankStatus: 'quarantined' })
    useReviewQueue.mockReturnValue({ data: makePage([q]), loading: false, error: null, refetch: vi.fn() })
    render(<AdminReviewQueue onSelectDetail={vi.fn()} />)
    // "Quarantined" appears in filter tab + badge — verify badge class exists
    const badges = document.querySelectorAll('.adm-badge-quarantined')
    expect(badges.length).toBeGreaterThan(0)
  })
})
