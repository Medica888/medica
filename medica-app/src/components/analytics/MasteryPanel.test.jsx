import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MasteryPanel from './MasteryPanel'

// ── Mock hooks and apiClient ──────────────────────────────────────────────────

vi.mock('../../lib/apiClient', () => ({
  isAuthenticated: vi.fn(() => true),
}))

vi.mock('../../hooks/useMastery', () => ({
  useMasteryOverview:         vi.fn(),
  useMasteryWeakest:          vi.fn(),
  useMasteryStrongest:        vi.fn(),
  useMasterySubjects:         vi.fn(),
  useMasterySubjectConcepts:  vi.fn(),
}))

// ConceptDetailModal calls useMasteryConcept and useTopicReadiness internally
vi.mock('./ConceptDetailModal', () => ({
  default: ({ concept, onClose }) => (
    <div data-testid="concept-detail-modal">
      <span>{concept?.name}</span>
      <button onClick={onClose}>close</button>
    </div>
  ),
}))

import * as apiClient from '../../lib/apiClient'
import * as useMasteryModule from '../../hooks/useMastery'

const LOADING = { data: null, loading: true,  error: null }

const OVERVIEW_DATA = {
  data: { total_concepts: 4, avg_mastery_score: 0.65, avg_confidence: 0.7, distribution: { priority: 1, focus: 1, reinforced: 1, ontrack: 1 }, confident_concepts: 2 },
  loading: false, error: null,
}

const WEAKEST_DATA = {
  data: { concepts: [{ concept: { id: 'c1', name: 'AKI' }, mastery: { mastery_score: 0.3, attempts: 4, confidence_score: 0.5, correct: 1, recent_incorrect_count: 2 }, tier: 'priority' }], count: 1 },
  loading: false, error: null,
}

const STRONGEST_DATA = {
  data: { concepts: [{ concept: { id: 'c2', name: 'Hypertension' }, mastery: { mastery_score: 0.9, attempts: 8, confidence_score: 0.9, correct: 7, recent_incorrect_count: 0 }, tier: 'ontrack' }], count: 1 },
  loading: false, error: null,
}

const SUBJECTS_DATA = {
  data: {
    subjects: [
      { subject: 'Pharmacology', rollupMastery: 0.45, rollupConfidence: 0.6, totalAttempts: 40, weakConceptCount: 3, tier: 'priority' },
      { subject: 'Cardiology',   rollupMastery: 0.88, rollupConfidence: 0.9, totalAttempts: 60, weakConceptCount: 0, tier: 'ontrack'  },
    ],
    count: 2,
  },
  loading: false, error: null,
}

const SUBJECT_CONCEPTS_DATA = {
  subject: 'Pharmacology',
  concepts: [
    { concept: { id: 'c3', name: 'Beta Blockers',  subject: 'Pharmacology', system: 'Cardiovascular' }, mastery: { mastery_score: 0.3, attempts: 4, confidence_score: 0.4, correct: 1, recent_incorrect_count: 2 }, tier: 'priority' },
    { concept: { id: 'c4', name: 'ACE Inhibitors', subject: 'Pharmacology', system: 'Cardiovascular' }, mastery: { mastery_score: 0.7, attempts: 6, confidence_score: 0.7, correct: 4, recent_incorrect_count: 0 }, tier: 'focus'    },
  ],
  count: 2,
}

beforeEach(() => {
  vi.clearAllMocks()
  apiClient.isAuthenticated.mockReturnValue(true)
  useMasteryModule.useMasteryOverview.mockReturnValue(OVERVIEW_DATA)
  useMasteryModule.useMasteryWeakest.mockReturnValue(WEAKEST_DATA)
  useMasteryModule.useMasteryStrongest.mockReturnValue(STRONGEST_DATA)
  useMasteryModule.useMasterySubjects.mockReturnValue(SUBJECTS_DATA)
  useMasteryModule.useMasterySubjectConcepts.mockReturnValue({ data: null, loading: false, error: null })
})

// ── Row 3 subject cards ───────────────────────────────────────────────────────

describe('MasteryPanel — subject breakdown (Row 3)', () => {
  it('renders Weak Subjects card', () => {
    render(<MasteryPanel />)
    expect(screen.getByText('Weak Subjects')).toBeTruthy()
  })

  it('renders Strong Subjects card', () => {
    render(<MasteryPanel />)
    expect(screen.getByText('Strong Subjects')).toBeTruthy()
  })

  it('shows weak subject in Weak Subjects card', () => {
    render(<MasteryPanel />)
    expect(screen.getByText('Pharmacology')).toBeTruthy()
  })

  it('shows strong subject in Strong Subjects card', () => {
    render(<MasteryPanel />)
    expect(screen.getByText('Cardiology')).toBeTruthy()
  })

  it('shows skeleton rows while subjects are loading', () => {
    useMasteryModule.useMasterySubjects.mockReturnValue(LOADING)
    const { container } = render(<MasteryPanel />)
    const skeletons = container.querySelectorAll('.mp-skeleton-row')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty-state message when no weak subjects', () => {
    useMasteryModule.useMasterySubjects.mockReturnValue({
      data: { subjects: [{ subject: 'Cardiology', rollupMastery: 0.9, rollupConfidence: 0.9, totalAttempts: 30, weakConceptCount: 0, tier: 'ontrack' }], count: 1 },
      loading: false, error: null,
    })
    render(<MasteryPanel />)
    expect(screen.getByText(/exam-ready level/i)).toBeTruthy()
  })

  it('hides subject row on 401 error', () => {
    useMasteryModule.useMasterySubjects.mockReturnValue({
      data: null, loading: false, error: { status: 401 },
    })
    render(<MasteryPanel />)
    expect(screen.queryByText('Weak Subjects')).toBeNull()
  })

  it('returns null when not authenticated', () => {
    apiClient.isAuthenticated.mockReturnValue(false)
    const { container } = render(<MasteryPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('subject rows are rendered as buttons', () => {
    const { container } = render(<MasteryPanel />)
    const pharmBtn = container.querySelector('button[aria-label="View Pharmacology subject details"]')
    expect(pharmBtn).toBeTruthy()
  })
})

// ── Subject drilldown modal ───────────────────────────────────────────────────

describe('MasteryPanel — SubjectDrilldownModal', () => {
  it('opens drilldown modal when a subject row is clicked', () => {
    render(<MasteryPanel />)
    const pharmBtn = screen.getByRole('button', { name: /View Pharmacology subject details/i })
    fireEvent.click(pharmBtn)
    // Modal uses aria-label
    expect(screen.getByRole('dialog', { name: /Pharmacology subject mastery/i })).toBeTruthy()
  })

  it('modal shows the subject name in the title', () => {
    render(<MasteryPanel />)
    fireEvent.click(screen.getByRole('button', { name: /View Pharmacology subject details/i }))
    expect(screen.getAllByText('Pharmacology').length).toBeGreaterThan(0)
  })

  it('modal shows loading skeleton while concepts are loading', () => {
    useMasteryModule.useMasterySubjectConcepts.mockReturnValue(LOADING)
    render(<MasteryPanel />)
    fireEvent.click(screen.getByRole('button', { name: /View Pharmacology subject details/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('.mp-skeleton-row')).toBeTruthy()
  })

  it('modal lists concepts for the selected subject', () => {
    useMasteryModule.useMasterySubjectConcepts.mockReturnValue({
      data: SUBJECT_CONCEPTS_DATA, loading: false, error: null,
    })
    render(<MasteryPanel />)
    fireEvent.click(screen.getByRole('button', { name: /View Pharmacology subject details/i }))
    expect(screen.getByText('Beta Blockers')).toBeTruthy()
    expect(screen.getByText('ACE Inhibitors')).toBeTruthy()
  })

  it('clicking a concept in the modal opens ConceptDetailModal', () => {
    useMasteryModule.useMasterySubjectConcepts.mockReturnValue({
      data: SUBJECT_CONCEPTS_DATA, loading: false, error: null,
    })
    render(<MasteryPanel />)
    // Open subject modal
    fireEvent.click(screen.getByRole('button', { name: /View Pharmacology subject details/i }))
    // Click a concept inside it
    fireEvent.click(screen.getByRole('button', { name: /View Beta Blockers details/i }))
    // Subject modal closes, ConceptDetailModal opens
    expect(screen.queryByRole('dialog', { name: /Pharmacology subject mastery/i })).toBeNull()
    expect(screen.getByTestId('concept-detail-modal')).toBeTruthy()
  })

  it('closing modal removes it from DOM', () => {
    render(<MasteryPanel />)
    fireEvent.click(screen.getByRole('button', { name: /View Pharmacology subject details/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Close/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows empty-state inside modal when no concepts exist for subject', () => {
    useMasteryModule.useMasterySubjectConcepts.mockReturnValue({
      data: { subject: 'Pharmacology', concepts: [], count: 0 },
      loading: false, error: null,
    })
    render(<MasteryPanel />)
    fireEvent.click(screen.getByRole('button', { name: /View Pharmacology subject details/i }))
    expect(screen.getByText(/No concepts tracked/i)).toBeTruthy()
  })
})
