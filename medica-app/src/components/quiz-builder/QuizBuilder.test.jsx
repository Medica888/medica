import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import QuizBuilder from './QuizBuilder.jsx'
import { STANDARDIZED_STEP1_BLOCK } from '../../lib/quizTypes'
import { saveLastQuizConfig } from '../../lib/storage'

vi.mock('../../hooks/useAuthState', () => ({
  useAuthState: () => ({ isAuthenticated: false }),
}))

vi.mock('../../hooks/useMastery', () => ({
  useMasteryAdaptivePreview: () => ({ loading: false, data: null }),
}))

vi.mock('../../lib/storage', () => ({
  getLastQuizConfig: vi.fn(() => null),
  saveLastQuizConfig: vi.fn(),
}))

vi.mock('../../lib/mockQuestions', () => ({
  getLocalQuestionAvailability: vi.fn(() => ({
    available: 240,
    requested: 10,
    requiresBackend: false,
  })),
}))

describe('QuizBuilder current USMLE Step 1 preset', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows three public difficulty choices instead of internal validator labels', () => {
    render(<QuizBuilder onStart={vi.fn()} />)

    expect(screen.getByText('Study Mode')).toBeInTheDocument()
    expect(screen.getByText('Choose the learning experience first. Difficulty only controls how hard the questions are.')).toBeInTheDocument()
    expect(screen.getByText('Session Format')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Custom Set/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Current Step 1 Block/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Foundation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Balanced' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Challenge' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More Easy' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'NBME Difficult' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'UWorld Challenge' })).not.toBeInTheDocument()
  })

  it('routes Challenge to the exam-style engine in Exam mode', () => {
    const onStart = vi.fn()
    render(<QuizBuilder onStart={onStart} />)

    fireEvent.click(screen.getByRole('button', { name: 'Challenge' }))
    fireEvent.click(screen.getByRole('button', { name: /generate quiz/i }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'exam',
      difficulty: 'NBME Difficult',
    }))
  })

  it('routes Challenge to the tutor-depth engine in Coach mode', () => {
    const onStart = vi.fn()
    render(<QuizBuilder onStart={onStart} />)

    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    fireEvent.click(screen.getByRole('button', { name: 'Challenge' }))
    fireEvent.click(screen.getByRole('button', { name: /generate quiz/i }))

    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'coach',
      difficulty: 'UWorld Challenge',
    }))
  })

  it('explains Challenge differently by mode', () => {
    render(<QuizBuilder onStart={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Challenge' }))
    expect(screen.getByText('Harder, concise exam-style questions with review after the block.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    expect(screen.getByText('Harder questions with deep teaching, traps, and weak-spot repair.')).toBeInTheDocument()
  })

  it('exposes a reachable 20-question, 30-minute blueprint-balanced preset', () => {
    render(<QuizBuilder onStart={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /Current Step 1 Block/ }))

    expect(screen.getByRole('button', { name: /Custom Set/ })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: /Current Step 1 Block/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Uses the current 20-question format and a representative Step 1 content blueprint.')).toBeInTheDocument()
    expect(screen.getByText('20 Questions')).toBeInTheDocument()
    expect(screen.getByText('30 Minutes')).toBeInTheDocument()
    expect(screen.getByText('Blueprint-balanced')).toBeInTheDocument()
    expect(screen.getByText('Current Step 1 Block uses Exam mode.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exam' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Practice' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Coach' })).toBeDisabled()
  })

  it('submits the locked current-format configuration', () => {
    const onStart = vi.fn()
    render(<QuizBuilder onStart={onStart} />)

    fireEvent.click(screen.getByRole('button', { name: /Current Step 1 Block/ }))
    fireEvent.click(screen.getByRole('button', { name: /generate quiz/i }))

    expect(saveLastQuizConfig).toHaveBeenCalledWith(expect.objectContaining({
      blockType: STANDARDIZED_STEP1_BLOCK,
      mode: 'exam',
      questionCount: 20,
      subject: '',
      system: '',
      difficulty: 'Balanced',
    }))
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      blockType: STANDARDIZED_STEP1_BLOCK,
      questionCount: 20,
    }))
  })

  it('restores the previous custom setup after previewing the current-format block', () => {
    render(<QuizBuilder onStart={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Coach' }))
    fireEvent.click(screen.getByRole('button', { name: 'Challenge' }))
    fireEvent.click(screen.getByRole('button', { name: /Current Step 1 Block/ }))
    fireEvent.click(screen.getByRole('button', { name: /Custom Set/ }))

    expect(screen.getByRole('button', { name: 'Coach' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Challenge' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Harder questions with deep teaching, traps, and weak-spot repair.')).toBeInTheDocument()
  })
})
