import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ExamResults from './ExamResults.jsx'

const baseResults = {
  total: 12,
  correct: 9,
  percentage: 75,
  subjectBreakdown: [],
  systemBreakdown: [],
  weakAreas: [],
  medicaScore: 80,
  readinessLabel: 'Ready',
  recommendation: 'Keep practicing.',
}

const baseSession = { answers: {}, questions: [], marked: {}, config: {} }

const noop = vi.fn()

describe('ExamResults — integrity status banner', () => {
  it('shows no unverified banner when integrityStatus is absent (not yet synced)', () => {
    render(
      <ExamResults results={baseResults} session={baseSession} onReview={noop} onNewQuiz={noop} onBackToBuilder={noop} />,
    )
    expect(screen.queryByText(/couldn't be fully verified/i)).not.toBeInTheDocument()
  })

  it('shows no unverified banner for a trusted (client_selected_verified) session', () => {
    render(
      <ExamResults
        results={{ ...baseResults, integrityStatus: 'client_selected_verified' }}
        session={baseSession}
        onReview={noop} onNewQuiz={noop} onBackToBuilder={noop}
      />,
    )
    expect(screen.queryByText(/couldn't be fully verified/i)).not.toBeInTheDocument()
  })

  it('shows the unverified banner for an unverified_local session', () => {
    render(
      <ExamResults
        results={{ ...baseResults, integrityStatus: 'unverified_local' }}
        session={baseSession}
        onReview={noop} onNewQuiz={noop} onBackToBuilder={noop}
      />,
    )
    expect(screen.getByText(/couldn't be fully verified/i)).toBeInTheDocument()
  })

  it('shows the unverified banner for a legacy_unverified session', () => {
    render(
      <ExamResults
        results={{ ...baseResults, integrityStatus: 'legacy_unverified' }}
        session={baseSession}
        onReview={noop} onNewQuiz={noop} onBackToBuilder={noop}
      />,
    )
    expect(screen.getByText(/couldn't be fully verified/i)).toBeInTheDocument()
  })
})
