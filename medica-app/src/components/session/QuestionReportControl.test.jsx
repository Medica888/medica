import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import QuestionReportControl from './QuestionReportControl'
import { saveQuestionReport } from '../../lib/storage'
import { useAuth } from '../../context/AuthContext.jsx'
import { useReporterEligibility } from '../../hooks/useReporterEligibility'

vi.mock('../../lib/storage', () => ({
  saveQuestionReport: vi.fn(),
}))

vi.mock('../../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../../hooks/useReporterEligibility', () => ({
  useReporterEligibility: vi.fn(),
}))

const question = { id: 'q1', stem: 'A patient presents with...' }
const verifiedUser = { id: 'u1', email_verified: true }
const unverifiedUser = { id: 'u1', email_verified: false }

function clickReport() {
  fireEvent.click(screen.getByRole('button', { name: 'Report' }))
}

describe('QuestionReportControl', () => {
  beforeEach(() => {
    vi.mocked(saveQuestionReport).mockReturnValue({ id: 'q1:wrong_answer' })
    vi.mocked(useReporterEligibility).mockReturnValue(null)
  })

  it('tells an anonymous user to sign in and verify', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: null })
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/Sign in and verify your email to send it for shared review/)).toBeInTheDocument()
  })

  it('tells an unverified user to verify their email (exact server reason)', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: unverifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue({
      eligible: false, reason: 'email_unverified', eligibleAt: '2026-08-01T00:00:00.000Z',
    })
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText(/Verify your email to unlock shared review sync/)).toBeInTheDocument()
    expect(screen.getByText(/no report is lost/)).toBeInTheDocument()
  })

  it('tells a verified-but-too-new user the exact date sync unlocks (exact server reason)', () => {
    const eligibleAt = '2026-08-15T14:30:00.000Z'
    const expectedDate = new Date(eligibleAt).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    vi.mocked(useAuth).mockReturnValue({ authUser: verifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue({
      eligible: false, reason: 'account_too_new', eligibleAt,
    })
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText('Saved')).toBeInTheDocument()
    const detail = screen.getByText(/Will sync for shared review after/)
    expect(detail.textContent).toContain(expectedDate)
    expect(detail.textContent).toContain('no report is lost')
  })

  it('falls back to a generic message if account_too_new has no usable eligibleAt', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: verifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue({
      eligible: false, reason: 'account_too_new', eligibleAt: null,
    })
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText(/Will sync for shared review once your account is eligible/)).toBeInTheDocument()
  })

  it('tells an eligible user the report was sent for review (exact server reason)', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: verifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue({
      eligible: true, reason: 'eligible', eligibleAt: '2026-01-01T00:00:00.000Z',
    })
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText('Saved')).toBeInTheDocument()
    expect(screen.getByText('Hidden from future sessions and sent for review.')).toBeInTheDocument()
  })

  it('degrades to a generic verified message while eligibility is still loading', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: verifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue(null)
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText('Hidden from future sessions and sent for review.')).toBeInTheDocument()
  })

  it('degrades to a generic unverified message while eligibility is still loading', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: unverifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue(null)
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()

    expect(screen.getByText(/Verify your email to unlock shared review sync/)).toBeInTheDocument()
  })

  it('does not show a saved status before the report button is clicked', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: null })
    render(<QuestionReportControl question={question} context={{}} />)

    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('never blocks reporting when saveQuestionReport throws', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: null })
    vi.mocked(saveQuestionReport).mockImplementation(() => { throw new Error('storage unavailable') })
    render(<QuestionReportControl question={question} context={{}} />)

    expect(() => clickReport()).not.toThrow()
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('resets the saved status when the report reason changes', () => {
    vi.mocked(useAuth).mockReturnValue({ authUser: verifiedUser })
    vi.mocked(useReporterEligibility).mockReturnValue({ eligible: true, reason: 'eligible', eligibleAt: null })
    render(<QuestionReportControl question={question} context={{}} />)

    clickReport()
    expect(screen.getByText('Saved')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Report question reason'), { target: { value: 'off_topic' } })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })
})
