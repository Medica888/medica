import { useState } from 'react'
import { saveQuestionReport } from '../../lib/storage'
import { useAuth } from '../../context/AuthContext.jsx'
import { useReporterEligibility } from '../../hooks/useReporterEligibility'

const REASONS = [
  ['wrong_answer', 'Wrong answer'],
  ['bad_explanation', 'Bad explanation'],
  ['off_topic', 'Off topic'],
  ['ambiguous_or_insufficient_clues', 'Ambiguous / insufficient clinical clues'],
]

function formatEligibleAt(iso) {
  const date = iso ? new Date(iso) : null
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// Backend report submission requires a verified, sufficiently-established account
// (see server getReporterEligibility/isEligibleQuestionReporter — the two source
// values here are the same server response, so this never has to guess).
function describeSaveOutcome(authUser, eligibility) {
  if (!authUser) {
    return 'Hidden from future sessions on this device. Sign in and verify your email to send it for shared review.'
  }
  if (!eligibility) {
    // Eligibility hasn't loaded yet (or the request failed) — degrade to the one
    // signal the client already has, rather than showing nothing.
    return authUser.email_verified
      ? 'Hidden from future sessions and sent for review.'
      : 'Hidden from future sessions on this device. Verify your email to unlock shared review sync — no report is lost.'
  }
  if (eligibility.reason === 'email_unverified') {
    return 'Hidden from future sessions on this device. Verify your email to unlock shared review sync — no report is lost.'
  }
  if (eligibility.reason === 'account_too_new') {
    const when = formatEligibleAt(eligibility.eligibleAt)
    return when
      ? `Hidden from future sessions on this device. Will sync for shared review after ${when} — no report is lost.`
      : 'Hidden from future sessions on this device. Will sync for shared review once your account is eligible — no report is lost.'
  }
  return 'Hidden from future sessions and sent for review.'
}

export default function QuestionReportControl({
  question,
  context,
  variant = 'standard',
}) {
  const { authUser } = useAuth()
  const eligibility = useReporterEligibility()
  const [reportReason, setReportReason] = useState('wrong_answer')
  const [reported, setReported] = useState(false)

  const classes = variant === 'exam'
    ? {
        row: 'exam-report-row',
        select: 'exam-report-select',
        button: 'exam-report-btn',
        status: 'exam-report-status',
      }
    : {
        row: 'question-report-row',
        select: 'question-report-select',
        button: 'question-report-btn',
        status: 'question-report-status',
      }

  const handleReport = () => {
    try {
      const saved = saveQuestionReport(question, reportReason, context)
      if (saved) setReported(true)
    } catch {
      // Reporting must never block answering or reviewing a question.
    }
  }

  return (
    <div className={classes.row}>
      <select
        className={classes.select}
        value={reportReason}
        onChange={e => { setReportReason(e.target.value); setReported(false) }}
        aria-label="Report question reason"
      >
        {REASONS.map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
      <button type="button" className={classes.button} onClick={handleReport}>
        Report
      </button>
      {reported && (
        <span className={classes.status}>
          <strong>Saved</strong>
          <span className="question-report-detail">{describeSaveOutcome(authUser, eligibility)}</span>
        </span>
      )}
    </div>
  )
}
