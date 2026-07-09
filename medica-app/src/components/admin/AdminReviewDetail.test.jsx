import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import AdminReviewDetail from './AdminReviewDetail'

vi.mock('../../hooks/useAdminReview', () => ({
  useReviewDetail:          vi.fn(),
  useReviewHistory:         vi.fn(),
  useReviewActions:         vi.fn(),
  useReviewMetadataActions: vi.fn(),
}))

import {
  useReviewActions,
  useReviewDetail,
  useReviewHistory,
  useReviewMetadataActions,
} from '../../hooks/useAdminReview'

const makeDetail = (overrides = {}) => ({
  question: {
    externalId:      'fp-test-abc',
    subject:         'Pharmacology',
    system:          'Cardiovascular',
    difficulty:      'Hard',
    bankStatus:      'validated_generated',
    mode:            'exam',
    validationScore: 85,
    usageCount:      2,
    lastUsedAt:      '2025-02-01T10:00:00Z',
    createdAt:       '2025-01-10T08:00:00Z',
    validatedAt:     '2025-01-10T08:01:00Z',
    body: {
      stem:              'A 55-year-old man presents with chest pain.',
      options:           ['A. Aspirin', 'B. Metoprolol', 'C. Lisinopril', 'D. Warfarin', 'E. Clopidogrel'],
      correct:           1,
      explanation:       'Beta-blockers reduce heart rate and myocardial oxygen demand.',
      learningObjective: 'Understand beta-blocker pharmacology.',
      pearl:             'Metoprolol is cardioselective.',
      validationStatus:  'pass',
      validationScore:   85,
      validationVersion: 'server-question-validator-v1',
    },
    ...overrides,
  },
})

beforeEach(() => {
  useReviewDetail.mockReturnValue({ data: null, loading: true, error: null })
  useReviewHistory.mockReturnValue({ data: null, loading: false, error: null, refetch: vi.fn() })
  useReviewActions.mockReturnValue({ pending: false, error: null, act: vi.fn() })
  useReviewMetadataActions.mockReturnValue({ pending: false, error: null, update: vi.fn() })
})

describe('AdminReviewDetail', () => {
  it('shows loading state', () => {
    render(<AdminReviewDetail questionId="fp-1" onBack={vi.fn()} />)
    expect(screen.getByText('Loading question...')).toBeTruthy()
  })

  it('shows error when question not found', () => {
    useReviewDetail.mockReturnValue({ data: null, loading: false, error: new Error('Not found') })
    render(<AdminReviewDetail questionId="fp-1" onBack={vi.fn()} />)
    expect(screen.getByText(/Failed to load/)).toBeTruthy()
  })

  it('renders question stem', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('A 55-year-old man presents with chest pain.')).toBeTruthy()
  })

  it('renders answer options', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('Aspirin')).toBeTruthy()
    expect(screen.getByText('Metoprolol')).toBeTruthy()
  })

  it('marks correct answer', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    // Correct answer is index 1 = Metoprolol
    const metoprolol = screen.getByText('Metoprolol').closest('.adm-option')
    expect(metoprolol?.classList.contains('adm-option-correct')).toBe(true)
  })

  it('renders and marks rare extended A-L answer choices in admin review', () => {
    useReviewDetail.mockReturnValue({
      data: makeDetail({
        body: {
          stem: 'A rare extended-option item needs admin review.',
          options: [
            { letter: 'A', text: 'Choice A' },
            { letter: 'B', text: 'Choice B' },
            { letter: 'C', text: 'Choice C' },
            { letter: 'D', text: 'Choice D' },
            { letter: 'E', text: 'Choice E' },
            { letter: 'F', text: 'Choice F' },
            { letter: 'G', text: 'Choice G' },
            { letter: 'H', text: 'Choice H' },
            { letter: 'I', text: 'Choice I' },
            { letter: 'J', text: 'Choice J' },
            { letter: 'K', text: 'Choice K' },
            { letter: 'L', text: 'Choice L' },
          ],
          correct: 'L',
          explanation: 'Extended options must remain reviewable by clinicians.',
        },
      }),
      loading: false,
      error: null,
    })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    const choiceL = screen.getByText('Choice L').closest('.adm-option')
    expect(choiceL?.classList.contains('adm-option-correct')).toBe(true)
    expect(within(choiceL).getByText('L')).toBeTruthy()
  })

  it('renders explanation', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('Beta-blockers reduce heart rate and myocardial oxygen demand.')).toBeTruthy()
  })

  it('renders validation info', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('pass')).toBeTruthy()
    expect(screen.getByText('85%')).toBeTruthy()
  })

  it('shows Approve and Quarantine for pending question', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('Approve')).toBeTruthy()
    expect(screen.getByText('Quarantine')).toBeTruthy()
  })

  it('does not show Approve for already approved question', () => {
    useReviewDetail.mockReturnValue({
      data: makeDetail({ bankStatus: 'approved' }),
      loading: false, error: null,
    })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.queryByText('Approve')).toBeNull()
    expect(screen.getByText('Quarantine')).toBeTruthy()
    expect(screen.getByText('Restore to Pending')).toBeTruthy()
  })

  it('shows Restore for quarantined question', () => {
    useReviewDetail.mockReturnValue({
      data: makeDetail({ bankStatus: 'quarantined' }),
      loading: false, error: null,
    })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('Restore to Pending')).toBeTruthy()
  })

  it('opens confirm modal on Approve click', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Approve'))
    expect(screen.getByText('Approve Question?')).toBeTruthy()
  })

  it('opens confirm modal on Quarantine click', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Quarantine'))
    expect(screen.getByText('Quarantine Question?')).toBeTruthy()
  })

  it('cancels modal without action', () => {
    const act = vi.fn()
    useReviewActions.mockReturnValue({ pending: false, error: null, act })
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Approve'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(act).not.toHaveBeenCalled()
    expect(screen.queryByText('Approve Question?')).toBeNull()
  })

  it('calls act with correct args on confirm', async () => {
    const act = vi.fn().mockResolvedValue({ question: { bankStatus: 'approved' } })
    const refetch = vi.fn()
    useReviewActions.mockReturnValue({ pending: false, error: null, act })
    useReviewHistory.mockReturnValue({ data: null, loading: false, error: null, refetch })
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Approve'))
    const modal = screen.getByRole('dialog')
    fireEvent.click(within(modal).getByText('Approve'))
    await waitFor(() => expect(act).toHaveBeenCalledWith('fp-test-abc', 'approved'))
    expect(refetch).toHaveBeenCalled()
  })

  it('saves reviewed-content metadata and updates commercial readiness', async () => {
    const update = vi.fn().mockResolvedValue({
      question: {
        commercialReady: true,
        reviewMetadata: {
          reviewStatus: 'source_checked',
          sourceRefs: ['USMLE Content Outline', 'Pathoma'],
          medicalAccuracyStatus: 'pass',
          itemWritingStatus: 'pass',
          difficultyCalibrationStatus: 'pass',
          reviewNotes: 'Reviewed against source.',
        },
      },
    })
    const refetch = vi.fn()
    useReviewMetadataActions.mockReturnValue({ pending: false, error: null, update })
    useReviewHistory.mockReturnValue({ data: null, loading: false, error: null, refetch })
    useReviewDetail.mockReturnValue({
      data: makeDetail({
        commercialReady: false,
        readinessReasons: ['missing_source_refs', 'needs_source_or_expert_review'],
        reviewMetadata: {
          reviewStatus: 'validator_passed',
          sourceRefs: [],
          medicalAccuracyStatus: 'unknown',
          itemWritingStatus: 'unknown',
          difficultyCalibrationStatus: 'unknown',
        },
      }),
      loading: false,
      error: null,
    })

    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)

    expect(screen.getByText('Not commercial ready')).toBeTruthy()
    expect(screen.getByText('Add at least one source reference.')).toBeTruthy()
    expect(screen.getByText('Mark as source checked or expert reviewed.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Review status'), { target: { value: 'source_checked' } })
    fireEvent.change(screen.getByLabelText('Medical accuracy'), { target: { value: 'pass' } })
    fireEvent.change(screen.getByLabelText('Item writing'), { target: { value: 'pass' } })
    fireEvent.change(screen.getByLabelText('Difficulty fit'), { target: { value: 'pass' } })
    fireEvent.change(screen.getByLabelText('Source references'), {
      target: { value: 'USMLE Content Outline\nPathoma' },
    })
    fireEvent.change(screen.getByLabelText('Review notes'), {
      target: { value: 'Reviewed against source.' },
    })
    fireEvent.click(screen.getByText('Save review metadata'))

    await waitFor(() => {
      expect(update).toHaveBeenCalledWith('fp-test-abc', {
        reviewStatus: 'source_checked',
        sourceRefs: ['USMLE Content Outline', 'Pathoma'],
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'pass',
        reviewNotes: 'Reviewed against source.',
      })
    })
    expect(screen.getByText('Review metadata saved.')).toBeTruthy()
    expect(screen.getByText('Commercial ready')).toBeTruthy()
    expect(refetch).toHaveBeenCalled()
  })

  it('calls onBack when Back button clicked', () => {
    const onBack = vi.fn()
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={onBack} />)
    fireEvent.click(screen.getByText('Back to Queue'))
    expect(onBack).toHaveBeenCalled()
  })

  it('shows audit history', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    useReviewHistory.mockReturnValue({
      data: { history: [{ action: 'approved', previousStatus: 'validated_generated', newStatus: 'approved', userId: 'user-uuid-1', createdAt: '2025-03-01T10:00:00Z' }] },
      loading: false, error: null,
    })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    // "approved" may appear multiple times (action + new status) - check at least one exists
    expect(screen.getAllByText('approved').length).toBeGreaterThan(0)
  })

  it('shows No history recorded when empty', () => {
    useReviewDetail.mockReturnValue({ data: makeDetail(), loading: false, error: null })
    useReviewHistory.mockReturnValue({ data: { history: [] }, loading: false, error: null })
    render(<AdminReviewDetail questionId="fp-test-abc" onBack={vi.fn()} />)
    expect(screen.getByText('No history recorded.')).toBeTruthy()
  })
})
