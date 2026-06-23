import { useState } from 'react'
import { saveQuestionReport } from '../../lib/storage'

const REASONS = [
  ['wrong_answer', 'Wrong answer'],
  ['bad_explanation', 'Bad explanation'],
  ['off_topic', 'Off topic'],
  ['ambiguous_or_insufficient_clues', 'Ambiguous / insufficient clinical clues'],
]

export default function QuestionReportControl({
  question,
  context,
  variant = 'standard',
}) {
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
          <span className="question-report-detail">Hidden from future sessions and sent for review.</span>
        </span>
      )}
    </div>
  )
}
