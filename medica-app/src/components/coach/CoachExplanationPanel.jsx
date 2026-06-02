import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from '../../lib/answerNormalize'

/**
 * @param {{
 *   question: import('../../lib/quizTypes').QuizQuestion
 *   userAnswer: string | null
 * }} props
 */
export default function CoachExplanationPanel({ question, userAnswer }) {
  const options = normalizeOptions(question.options)

  const normalizedCorrect    = getQuestionCorrectLetter(question)
  const normalizedUserAnswer = normalizeAnswerLetter(userAnswer)
  const hasAnswer = normalizedUserAnswer !== ''
  const isCorrect = hasAnswer && normalizedUserAnswer === normalizedCorrect

  const correctOption = options.find(o => o.letter === normalizedCorrect)
  const chosenOption  = options.find(o => o.letter === normalizedUserAnswer)

  const optExpl  = question.optionExplanations ?? null
  const pearl    = question.highYieldPearl || question.pearl

  return (
    <div className="ci-exp" aria-label="Question explanation">

      {/* ── 1. Verdict ─────────────────────────────────────────── */}
      <div
        className={`ci-exp-verdict ${isCorrect ? 'correct' : 'wrong'}`}
        role="status"
        aria-live="polite"
      >
        {isCorrect ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--green)" opacity=".15" />
              <path d="M4.5 8L6.5 10L11.5 5.5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Correct
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--red)" opacity=".15" />
              <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            {hasAnswer ? 'Incorrect' : 'Not answered'}
          </>
        )}
      </div>

      {/* ── 2. Answer comparison — always shown ────────────────── */}
      <div className="ci-exp-answer-compare">
        <div className={`ci-exp-ans-row ${isCorrect ? 'ci-exp-ans-row--correct' : 'ci-exp-ans-row--wrong'}`}>
          <span className={`ci-exp-section-lbl ${isCorrect ? 'ci-exp-section-lbl--correct' : 'ci-exp-section-lbl--warn'}`}>
            Your answer
          </span>
          <span className="ci-exp-ans-val">
            {hasAnswer
              ? `${normalizedUserAnswer}. ${chosenOption?.text ?? '—'}`
              : <em className="ci-exp-empty">No answer selected</em>
            }
          </span>
        </div>
        {!isCorrect && (
          <div className="ci-exp-ans-row ci-exp-ans-row--correct">
            <span className="ci-exp-section-lbl ci-exp-section-lbl--correct">Correct answer</span>
            <span className="ci-exp-ans-val">
              {normalizedCorrect
                ? `${normalizedCorrect}. ${correctOption?.text ?? '—'}`
                : <em className="ci-exp-empty">Correct answer unavailable</em>
              }
            </span>
          </div>
        )}
      </div>

      {/* ── 3. Tested concept ──────────────────────────────────── */}
      {question.testedConcept && (
        <div className="ci-exp-concept">
          <span className="ci-exp-section-lbl">Tested Concept</span>
          <span className="ci-exp-concept-text">{question.testedConcept}</span>
        </div>
      )}

      {/* ── 4. Core explanation ────────────────────────────────── */}
      <div className="ci-exp-body">
        <span className="ci-exp-section-lbl" style={{ marginBottom: 8 }}>
          Correct Mechanism
        </span>
        {question.explanation
          ? question.explanation
          : <em className="ci-exp-empty">No explanation available for this question.</em>
        }
      </div>

      {/* ── 5. Option-by-option analysis ───────────────────────── */}
      {options.length > 0 && (
        <div className="ci-opt-analysis">
          <div className="ci-opt-analysis-hdr">Option Dissection</div>
          {options.map(opt => {
            const isOptCorrect = opt.letter === normalizedCorrect
            const isOptChosen  = opt.letter === normalizedUserAnswer && !isCorrect
            const expl = optExpl ? (optExpl[opt.letter] ?? 'No detailed explanation available.') : null
            return (
              <div
                key={opt.letter}
                className={`ci-opt-row${isOptCorrect ? ' correct' : isOptChosen ? ' wrong' : ''}`}
              >
                <span className="ci-opt-row-letter" aria-label={`Option ${opt.letter}`}>{opt.letter}</span>
                <span className="ci-opt-row-body">
                  <span className="ci-opt-option-main">{opt.text}</span>
                  {expl && <span className="ci-opt-option-expl">{expl}</span>}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 6. Common trap ─────────────────────────────────────── */}
      {question.commonTrap && (
        <div className={`ci-exp-trap${!isCorrect ? ' ci-exp-trap--prominent' : ''}`}>
          <span className="ci-exp-section-lbl ci-exp-section-lbl--warn">
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden="true"
              style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}>
              <path d="M4.5 1L8.5 8H.5L4.5 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none"/>
            </svg>
            Common Trap
          </span>
          <p className="ci-exp-trap-text">{question.commonTrap}</p>
        </div>
      )}

      {/* ── 7. Weak spot ───────────────────────────────────────── */}
      {question.weakSpotCategory && (
        <div className={`ci-exp-weakspot${!isCorrect ? ' ci-exp-weakspot--alert' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M2 2h8v5l-4 3-4-3V2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="ci-exp-weakspot-body">
            <span className="ci-exp-weakspot-label">Retrieval Gap</span>
            <span className="ci-exp-weakspot-cat">{question.weakSpotCategory}</span>
          </span>
        </div>
      )}

      {/* ── 8. Memory anchor ───────────────────────────────────── */}
      {question.memoryAnchor && (
        <div className="ci-exp-anchor">
          <span className="ci-exp-section-lbl">Memory Anchor</span>
          <p className="ci-exp-anchor-text">{question.memoryAnchor}</p>
        </div>
      )}

      {/* ── 9. High-yield pearl ────────────────────────────────── */}
      {pearl && (
        <div className="ci-pearl ci-exp-highyield">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M7 1L8.5 5H13L9.5 7.5L11 11.5L7 9L3 11.5L4.5 7.5L1 5H5.5L7 1Z"
              fill="var(--yellow, #f59e0b)" opacity=".9" />
          </svg>
          <span>
            <span className="ci-exp-section-lbl" style={{ marginBottom: 4 }}>High-Yield Pearl</span>
            {pearl}
          </span>
        </div>
      )}

    </div>
  )
}
