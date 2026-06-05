const STATUS_LABEL = {
  unanswered:        'unanswered',
  current:           'current',
  answered:          'answered',
  marked:            'marked for review',
  'marked-answered': 'answered and marked for review',
  correct:           'correct',
  incorrect:         'incorrect',
  selected:          'answer selected',
  revealed:          'explained',
}

const LEGENDS = {
  exam: [
    { status: 'current',         label: 'Current' },
    { status: 'answered',        label: 'Answered' },
    { status: 'marked-answered', label: 'Marked' },
    { status: 'unanswered',      label: 'Not answered' },
  ],
  'exam-submitted': [
    { status: 'current',    label: 'Current' },
    { status: 'correct',    label: 'Correct' },
    { status: 'incorrect',  label: 'Incorrect' },
    { status: 'unanswered', label: 'Not answered' },
  ],
  practice: [
    { status: 'current',    label: 'Current' },
    { status: 'revealed',   label: 'Explained' },
    { status: 'selected',   label: 'Selected' },
    { status: 'unanswered', label: 'Not started' },
  ],
  coach: [
    { status: 'current',    label: 'Current' },
    { status: 'revealed',   label: 'Explained' },
    { status: 'selected',   label: 'Selected' },
    { status: 'unanswered', label: 'Not started' },
  ],
  review: [
    { status: 'correct',    label: 'Correct' },
    { status: 'incorrect',  label: 'Incorrect' },
    { status: 'marked',     label: 'Marked' },
    { status: 'unanswered', label: 'Unanswered' },
  ],
}

/**
 * Calendar-style question grid used across Exam, Practice, Coach, and Review.
 *
 * @param {{
 *   questions:    object[]
 *   currentIndex: number | null
 *   onSelect:     (index: number) => void
 *   getStatus:    (question: object, index: number) => string
 *   mode:         'exam'|'exam-submitted'|'practice'|'coach'|'review'
 * }} props
 */
export default function QuestionNavigator({ questions, currentIndex, onSelect, getStatus, mode }) {
  const legend = LEGENDS[mode] ?? []

  return (
    <div className="qn-wrap">
      <div
        className="qn-grid"
        role="group"
        aria-label="Question navigator"
      >
        {questions.map((q, i) => {
          const status = getStatus(q, i)
          const label  = STATUS_LABEL[status] ?? status
          return (
            <button
              key={q.id ?? i}
              type="button"
              className={`qn-tile ${status}`}
              onClick={() => onSelect(i)}
              aria-label={`Question ${i + 1}, ${label}`}
              aria-current={currentIndex != null && i === currentIndex ? 'true' : undefined}
            >
              {i + 1}
            </button>
          )
        })}
      </div>

      {legend.length > 0 && (
        <div className="qn-legend" aria-hidden="true">
          {legend.map(item => (
            <span key={item.status} className="qn-legend-item">
              <span className={`qn-legend-swatch ${item.status}`} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
