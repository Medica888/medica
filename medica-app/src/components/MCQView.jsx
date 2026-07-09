import { useState } from 'react'
import { ANSWER_LETTERS, normalizeAnswerLetter } from '../lib/answerNormalize'

function MCQQuestion({ question, index }) {
  const [selected, setSelected] = useState(null)
  const options = Array.isArray(question.options)
    ? question.options.slice(0, ANSWER_LETTERS.length)
    : []
  const correctLetter = normalizeAnswerLetter(question.correct)

  const handleSelect = (i) => {
    if (selected !== null) return
    setSelected(i)
  }

  return (
    <div className="mcq-question">
      <div className="mcq-q-top">
        <div className="mcq-q-num">{index + 1}</div>
        <div style={{ flex: 1 }}>
          <div className="mcq-q-field">{question.field}</div>
          <div className="mcq-q-stem">{question.stem}</div>
        </div>
      </div>

      <div className="mcq-options">
        {options.map((opt, i) => {
          const letter = ANSWER_LETTERS[i]
          let cls = 'mcq-option'
          if (selected !== null) {
            if (letter === correctLetter) cls += ' correct'
            else if (i === selected && letter !== correctLetter) cls += ' wrong'
            else cls += ' neutral'
          }
          return (
            <button
              key={i}
              className={cls}
              onClick={() => handleSelect(i)}
              disabled={selected !== null}
            >
              <span className="mcq-opt-letter">{letter}</span>
              <span className="mcq-opt-text">{String(opt).replace(/^[A-L]\.\s*/i, '')}</span>
            </button>
          )
        })}
      </div>

      {selected !== null && (
        <div className="mcq-explanation">
          {(question.explanations || []).slice(0, ANSWER_LETTERS.length).map((exp, i) => (
            <div key={i} className="mcq-exp-item">
              <strong>{ANSWER_LETTERS[i]})</strong> {String(exp).replace(/^[A-L]\s*[—–-]\s*(Correct|Wrong):\s*/i, '')}
            </div>
          ))}
          {question.pearl && (
            <div className="mcq-pearl">
              <strong>High-Yield Pearl:</strong> {question.pearl}
            </div>
          )}
          {question.reference && (
            <div className="mcq-ref">Reference: {question.reference}</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function MCQView({ data }) {
  return (
    <div>
      <div className="mcq-header">
        <div className="mcq-title">{data.title}</div>
        <div className="mcq-count">{data.questions.length} question{data.questions.length !== 1 ? 's' : ''} - click an option to reveal the answer</div>
      </div>
      {data.questions.map((q, i) => (
        <MCQQuestion key={q.id ?? i} question={q} index={i} />
      ))}
    </div>
  )
}
