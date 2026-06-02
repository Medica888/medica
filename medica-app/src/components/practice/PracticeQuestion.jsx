import { useState } from 'react'
import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'
import PracticeAnswerOption from './PracticeAnswerOption'
import PracticeExplanationPanel from './PracticeExplanationPanel'
import { saveQuestionReport } from '../../lib/storage'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   questionNumber: number
 *   answered: import('../../lib/quizTypes').OptionLetter | null
 *   revealed: boolean
 *   onAnswer: (letter: import('../../lib/quizTypes').OptionLetter) => void
 *   onCheckAnswer: () => void
 * }} props
 */
export default function PracticeQuestion({ question, questionNumber, answered, revealed, onAnswer, onCheckAnswer }) {
  const options = normalizeOptions(question.options)
  const normalizedCorrect  = getQuestionCorrectLetter(question)
  const normalizedAnswered = normalizeAnswerLetter(answered)
  const isCorrect = normalizedAnswered === normalizedCorrect
  const [reportReason, setReportReason] = useState('wrong_answer')
  const [reported, setReported] = useState(false)

  const getOptionState = (opt) => {
    if (!normalizedAnswered) return 'default'
    if (!revealed) return opt.letter === normalizedAnswered ? 'selected' : 'default'
    if (opt.letter === normalizedCorrect) return 'correct'
    if (opt.letter === normalizedAnswered && !isCorrect) return 'wrong'
    return 'neutral'
  }

  const handleReport = () => {
    const saved = saveQuestionReport(question, reportReason, { mode: 'practice' })
    if (saved) setReported(true)
  }

  return (
    <div className="pi-question">
      <div className="pi-q-meta">
        <span className="pi-q-num">Q{questionNumber}</span>
        {question.subject && <span className="pi-q-tag">{question.subject}</span>}
        {question.system  && <span className="pi-q-tag">{question.system}</span>}
        {question.difficulty && <span className="pi-q-tag diff">{question.difficulty}</span>}
      </div>

      <div className="pi-stem">
        <p>{question.stem}</p>
      </div>

      <div className="question-report-row">
        <select
          className="question-report-select"
          value={reportReason}
          onChange={e => { setReportReason(e.target.value); setReported(false) }}
          aria-label="Report question reason"
        >
          <option value="wrong_answer">Wrong answer</option>
          <option value="bad_explanation">Bad explanation</option>
          <option value="off_topic">Off topic</option>
        </select>
        <button type="button" className="question-report-btn" onClick={handleReport}>
          Report
        </button>
        {reported && <span className="question-report-status">Saved</span>}
      </div>

      <div className="pi-options" role="group" aria-label="Answer options">
        {options.map(opt => (
          <PracticeAnswerOption
            key={opt.letter}
            option={opt}
            state={getOptionState(opt)}
            disabled={revealed}
            onClick={() => onAnswer(opt.letter)}
          />
        ))}
      </div>

      {answered && !revealed && (
        <button type="button" className="pi-check-btn" onClick={onCheckAnswer}>
          Check Answer
        </button>
      )}

      {revealed && answered && (
        <PracticeExplanationPanel
          question={question}
          answered={answered}
          isCorrect={isCorrect}
        />
      )}

      {!answered && (
        <div className="pi-select-hint">Select an answer to continue</div>
      )}
    </div>
  )
}
