import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import QBankPage from './QBankPage'
import { getBrowsableQuestionBank } from '../../lib/mockQuestions'

vi.mock('../../lib/storage', () => ({
  subscribeQuestionReports: vi.fn(() => () => {}),
}))

vi.mock('../../lib/mockQuestions', () => ({
  getBrowsableQuestionBank: vi.fn(),
}))

function makeQuestion(id, overrides = {}) {
  return {
    id,
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    topic: 'Hypertension',
    testedConcept: `Concept ${id}`,
    stem: `Clinical stem for ${id}`,
    options: [
      { letter: 'A', text: `Option A ${id}` },
      { letter: 'B', text: `Option B ${id}` },
      { letter: 'C', text: `Option C ${id}` },
      { letter: 'D', text: `Option D ${id}` },
    ],
    correct: 'A',
    explanation: `Hidden explanation for ${id}`,
    ...overrides,
  }
}

const BASE_BANK = [
  makeQuestion('q1', { testedConcept: 'ACE inhibitor cough' }),
  makeQuestion('q2', {
    subject: 'Pathology', system: 'Respiratory', difficulty: 'NBME Difficult',
    topic: 'Pleural disease', testedConcept: 'Spontaneous pneumothorax',
  }),
  makeQuestion('q3', {
    subject: 'Physiology', system: 'Renal / Urinary', difficulty: 'UWorld Challenge',
    topic: 'Acid-base', testedConcept: 'Winter formula',
  }),
  makeQuestion('q4', {
    subject: 'Biochemistry', system: 'Multisystem', difficulty: 'Balanced',
    topic: 'Metabolism', testedConcept: 'TCA cycle',
  }),
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getBrowsableQuestionBank).mockReturnValue(BASE_BANK)
})

describe('QBankPage', () => {
  it('renders the validated inventory without exposing answers or explanations', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'QBank', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('4 validated questions available')).toBeInTheDocument()
    expect(screen.queryByText('Hidden explanation for q1')).not.toBeInTheDocument()
    expect(screen.queryByText(/correct answer/i)).not.toBeInTheDocument()
  })

  it('searches concepts and combines subject, system, and difficulty filters with AND logic', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: 'pneumothorax' } })
    expect(screen.getByText('Spontaneous pneumothorax')).toBeInTheDocument()
    expect(screen.queryByText('ACE inhibitor cough')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Subject' }), { target: { value: 'Pathology' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'System' }), { target: { value: 'Respiratory' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Difficulty' }), { target: { value: 'NBME Difficult' } })
    expect(screen.getByTestId('qbk-match-count')).toHaveTextContent('1 matching question')
  })

  it('does not expose Multisystem as a separate filter choice', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const systemFilter = screen.getByRole('combobox', { name: 'System' })
    expect(systemFilter.querySelector('option[value="Multisystem"]')).toBeNull()
  })

  it('keeps selected questions while filters change', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const checkbox = screen.getByRole('checkbox', { name: 'Select question 1: ACE inhibitor cough' })
    fireEvent.click(checkbox)
    expect(screen.getByText('1', { selector: '.qbk-selection-count strong' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: 'no match' } })
    expect(screen.getByText(/no questions match/i)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search questions' }), { target: { value: '' } })
    expect(screen.getByRole('checkbox', { name: 'Select question 1: ACE inhibitor cough' })).toBeChecked()
  })

  it('starts exactly the selected questions in the chosen mode', () => {
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select question 1: ACE inhibitor cough' }))
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))

    expect(onStartSelected).toHaveBeenCalledTimes(1)
    expect(onStartSelected).toHaveBeenCalledWith({ mode: 'coach', questions: [BASE_BANK[0]] })
  })

  it('enforces the 40-question selection limit', () => {
    const largeBank = Array.from({ length: 45 }, (_, index) => makeQuestion(`large-${index + 1}`))
    vi.mocked(getBrowsableQuestionBank).mockReturnValue(largeBank)
    const onStartSelected = vi.fn()
    render(<QBankPage onStartSelected={onStartSelected} />)

    fireEvent.click(screen.getByRole('button', { name: 'Select filtered (up to 40)' }))
    expect(screen.getByText('40', { selector: '.qbk-selection-count strong' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start Selected Questions' }))
    expect(onStartSelected.mock.calls[0][0].questions).toHaveLength(40)
  })

  it('previews options without answer state and closes with Escape', () => {
    render(<QBankPage onStartSelected={vi.fn()} />)
    const previewButtons = screen.getAllByRole('button', { name: 'Preview' })
    fireEvent.click(previewButtons[0])

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Option A q1')).toBeInTheDocument()
    expect(screen.getByText(/answers and explanations remain hidden/i)).toBeInTheDocument()
    expect(document.activeElement).toHaveClass('qbk-preview-panel')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(previewButtons[0]).toHaveFocus()
  })
})
