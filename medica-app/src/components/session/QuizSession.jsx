import { useState, useEffect, useRef } from 'react'
import { saveQuestionReport, saveQuizSession } from '../../lib/storage'
import { calculatePracticeResults } from '../../lib/practiceScoring'
import { getQuestionCorrectLetter, normalizeAnswerLetter } from '../../lib/answerNormalize'
import QuestionNavigator from './QuestionNavigator'

// Normalize legacy or unexpected mode strings to the canonical three
function normalizeMode(mode) {
  if (mode === 'timed')       return 'exam'
  if (mode === 'unlimited')   return 'practice'
  if (mode === 'explanatory') return 'coach'
  if (['exam', 'practice', 'coach'].includes(mode)) return mode
  return 'exam'
}

function getSessionSourceLabel(session) {
  if (session?.source === 'ai') return 'Live AI'
  if (session?.source === 'mock-fallback') return 'Validated Local Bank'
  return null
}

function formatFallbackReason(reason) {
  const labels = {
    live_ai_timeout:          'live AI timeout',
    live_ai_low_yield:        'live AI low yield',
    live_ai_connection_error: 'live AI connection issue',
    live_ai_empty_result:     'live AI empty result',
    live_ai_unavailable:      'live AI unavailable',
  }
  return labels[reason] || null
}

function formatStopReason(reason) {
  const labels = {
    requested_count_reached:   'target reached',
    max_candidates_reached:    'candidate limit reached',
    max_refill_rounds_reached: 'round limit reached',
    generation_error:          'generation stopped',
    rate_limited:              'rate limited',
    unknown:                   'unknown stop',
  }
  return labels[reason] || null
}

function getMedicalReviewLabel(telemetry) {
  if (!telemetry || !telemetry.medicalReviewRequested) return null
  return `${telemetry.medicalReviewPassed}/${telemetry.medicalReviewRequested} medically reviewed`
}

const LAB_REFERENCE = [
  { name: 'Na⁺',       range: '136–145 mEq/L' },
  { name: 'K⁺',        range: '3.5–5.0 mEq/L' },
  { name: 'Cl⁻',       range: '98–106 mEq/L' },
  { name: 'HCO₃⁻',     range: '22–28 mEq/L' },
  { name: 'BUN',        range: '7–20 mg/dL' },
  { name: 'Creatinine', range: '0.6–1.2 mg/dL' },
  { name: 'Glucose',    range: '70–110 mg/dL' },
  { name: 'Ca²⁺',       range: '8.5–10.5 mg/dL' },
  { name: 'Mg²⁺',       range: '1.5–2.5 mEq/L' },
  { name: 'PO₄³⁻',      range: '2.5–4.5 mg/dL' },
  { name: 'Hgb ♂',      range: '13.5–17.5 g/dL' },
  { name: 'Hgb ♀',      range: '12.0–16.0 g/dL' },
  { name: 'Hct ♂',      range: '41–53%' },
  { name: 'Hct ♀',      range: '36–46%' },
  { name: 'WBC',        range: '4.5–11.0 ×10³/µL' },
  { name: 'Platelets',  range: '150–400 ×10³/µL' },
  { name: 'MCV',        range: '80–100 fL' },
  { name: 'PT',         range: '11–15 s' },
  { name: 'aPTT',       range: '25–35 s' },
  { name: 'INR',        range: '0.8–1.2' },
  { name: 'ALT',        range: '7–40 U/L' },
  { name: 'AST',        range: '10–40 U/L' },
  { name: 'ALP',        range: '25–100 U/L' },
  { name: 'T. Bili',    range: '0.2–1.2 mg/dL' },
  { name: 'Albumin',    range: '3.5–5.0 g/dL' },
  { name: 'TSH',        range: '0.5–5.0 µIU/mL' },
  { name: 'Free T₄',    range: '0.9–2.4 ng/dL' },
  { name: 'HbA1c',      range: '< 5.7%' },
  { name: 'pH (art.)',  range: '7.35–7.45' },
  { name: 'PaO₂',       range: '75–100 mmHg' },
  { name: 'PaCO₂',      range: '35–45 mmHg' },
  { name: 'O₂ sat',     range: '> 95%' },
]

/** @param {{ session: import('../../lib/quizTypes').QuizSession, onExit: () => void, onComplete?: (results: object) => void }} props */
export default function QuizSession({ session: initialSession, onExit, onComplete }) {
  const normalizedInitial = {
    ...initialSession,
    mode: normalizeMode(initialSession.mode),
  }

  const [session, setSession]           = useState(normalizedInitial)
  const [showExplanation, setShowExpl]  = useState(false)
  const [examSubmitted, setSubmitted]   = useState(false)
  const [secondsLeft, setSecondsLeft]   = useState(
    normalizedInitial.mode === 'exam'
      ? (normalizedInitial.questions?.length ?? 0) * 60
      : null
  )
  const [marked, setMarked]             = useState({})
  const [reportReason, setReportReason] = useState('wrong_answer')
  const [reportedQuestionId, setReportedQuestionId] = useState(null)
  const [confidences, setConfidences]   = useState({})
  const [notes, setNotes]               = useState({})
  const timerRef      = useRef(null)
  const onCompleteRef = useRef(onComplete)
  const markedRef     = useRef({})
  useEffect(() => { onCompleteRef.current = onComplete })
  useEffect(() => { markedRef.current = marked }, [marked])

  const { mode, questions, answers, currentIndex } = session
  const isExam  = mode === 'exam'
  const totalQ  = questions?.length ?? 0
  const question = questions?.[currentIndex] ?? questions?.[0]
  const sourceLabel        = getSessionSourceLabel(initialSession)
  const fallbackReasonLabel = formatFallbackReason(initialSession.config?.fallbackReason)
  const medicalReviewLabel  = getMedicalReviewLabel(initialSession.generationTelemetry)
  const stopReasonLabel     = formatStopReason(initialSession.generationTelemetry?.stoppedReason)

  // Persist session on every state change - BEFORE early return
  useEffect(() => {
    saveQuizSession(session)
  }, [session])

  // Timer countdown
  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft === null || secondsLeft <= 0) return
    timerRef.current = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [secondsLeft, examSubmitted, isExam])

  // Auto-submit when timer reaches 0
  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft !== 0 || totalQ === 0) return
    clearTimeout(timerRef.current)
    setSubmitted(true)   // eslint-disable-line react-hooks/set-state-in-effect
    setShowExpl(true)
    const finalSession = { ...session, marked: markedRef.current }
    const results = calculatePracticeResults(finalSession)
    onCompleteRef.current?.({ ...results, mode: 'exam' }, finalSession)
  }, [isExam, examSubmitted, secondsLeft, totalQ, session])

  // Safety guard - AFTER all hooks
  if (!questions || questions.length === 0) {
    return (
      <div className="qs-page" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--t3)', textAlign: 'center', maxWidth: 320 }}>
          No questions could be generated for this configuration.
        </div>
        <button className="qs-exit-btn" onClick={onExit} style={{ marginTop: 8 }}>
          Back to Builder
        </button>
      </div>
    )
  }

  const answered = answers[question.id]
  const correctLetter   = getQuestionCorrectLetter(question)
  const normalizedAnswer = normalizeAnswerLetter(answered)
  const isCorrect = normalizedAnswer === correctLetter

  const updateSession = (patch) => setSession(s => ({ ...s, ...patch }))

  const toggleMark = () => {
    setMarked(m => ({ ...m, [question.id]: !m[question.id] }))
  }

  const handleExamSubmit = () => {
    clearTimeout(timerRef.current)
    setSubmitted(true)
    setShowExpl(true)
    if (onCompleteRef.current) {
      const finalSession = { ...session, marked: markedRef.current }
      const results = calculatePracticeResults(finalSession)
      onCompleteRef.current({ ...results, mode: 'exam' }, finalSession)
    }
  }

  const handleAnswer = (letter) => {
    if (isExam && examSubmitted) return
    const newAnswers = { ...answers, [question.id]: letter }
    updateSession({ answers: newAnswers })
    if (!isExam) setShowExpl(true)
  }

  const handleReport = () => {
    const saved = saveQuestionReport(question, reportReason, { mode })
    if (saved) setReportedQuestionId(question.id)
  }

  const allAnswered = Object.keys(answers).length === totalQ

  const handleNav = (dir) => {
    const next = currentIndex + dir
    if (next < 0 || next >= totalQ) return
    setShowExpl(false)
    updateSession({ currentIndex: next })
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const score = examSubmitted
    ? questions.filter(q => normalizeAnswerLetter(answers[q.id]) === getQuestionCorrectLetter(q)).length
    : null

  return (
    <div className="qs-page exam-layout">

      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <header className="exam-hdr">
        <div className="exam-hdr-left">
          <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true">
            <path d="M11 1L2 4.8V12.5C2 17.7 5.8 22.5 11 24C16.2 22.5 20 17.7 20 12.5V4.8L11 1Z" fill="var(--blue)" fillOpacity="0.18" stroke="var(--blue)" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M7 13L9.5 15.5L15 10" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="exam-hdr-wordmark">MEDICA</span>
          <div className="exam-hdr-sep" />
          <span className="exam-hdr-mode-lbl">Exam Mode</span>

          {/* Provenance / telemetry badges */}
          {sourceLabel && (
            <span className="exam-badge-meta">{sourceLabel}</span>
          )}
          {fallbackReasonLabel && (
            <span className="exam-badge-warn">Fallback: {fallbackReasonLabel}</span>
          )}
          {medicalReviewLabel && (
            <span className="exam-badge-meta">{medicalReviewLabel}</span>
          )}
          {stopReasonLabel && (
            <span className="exam-badge-meta">{stopReasonLabel}</span>
          )}
        </div>

        <div className="exam-hdr-center">
          <span className="exam-hdr-qcount">Q {currentIndex + 1} / {totalQ}</span>
          <div
            className="exam-prog-bar"
            role="progressbar"
            aria-valuenow={Object.keys(answers).length}
            aria-valuemax={totalQ}
            aria-label={`${Object.keys(answers).length} of ${totalQ} answered`}
          >
            <div className="exam-prog-fill" style={{ width: `${(Object.keys(answers).length / totalQ) * 100}%` }} />
          </div>
          <span className="exam-hdr-answered">{Object.keys(answers).length}/{totalQ} answered</span>
        </div>

        <div className="exam-hdr-right">
          {!examSubmitted && secondsLeft !== null && (
            <div className={`exam-timer${secondsLeft < 300 ? ' warn' : ''}${secondsLeft < 60 ? ' urgent' : ''}`} aria-live="off">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M6.5 4V6.5L8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {formatTime(secondsLeft)}
            </div>
          )}
          {examSubmitted && score !== null && (
            <div className="exam-score-badge">{score}/{totalQ} correct</div>
          )}
          {!examSubmitted && (
            <button className={`exam-hdr-finish-btn${allAnswered ? ' ready' : ''}`} onClick={handleExamSubmit}>
              Finish Exam
            </button>
          )}
          <button className="exam-exit-btn" onClick={onExit} aria-label="Exit session">
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Exit
          </button>
        </div>
      </header>

      {/* ── 3-column body ───────────────────────────────────────────────────── */}
      <div className="exam-body">

        {/* Left: question navigator */}
        <aside className="exam-nav-panel" aria-label="Question navigator">
          <div className="exam-nav-title">Questions</div>
          <QuestionNavigator
            questions={questions}
            currentIndex={currentIndex}
            onSelect={(i) => { setShowExpl(false); updateSession({ currentIndex: i }) }}
            getStatus={(q, i) => {
              if (i === currentIndex) return 'current'
              if (examSubmitted) {
                const ua = answers[q.id]
                if (!ua) return 'unanswered'
                return normalizeAnswerLetter(ua) === getQuestionCorrectLetter(q) ? 'correct' : 'incorrect'
              }
              const isAns = !!answers[q.id]
              const isMrk = !!marked[q.id]
              if (isMrk && isAns) return 'marked-answered'
              if (isMrk) return 'marked'
              if (isAns) return 'answered'
              return 'unanswered'
            }}
            mode={examSubmitted ? 'exam-submitted' : 'exam'}
          />
        </aside>

        {/* Center: question content */}
        <main className="exam-center" aria-label="Question">
          <div className="exam-center-inner">

            {/* Subject / system — difficulty hidden in exam mode */}
            <div className="exam-q-meta">
              {question.subject && <span className="exam-q-tag">{question.subject}</span>}
              {question.system  && <span className="exam-q-tag">{question.system}</span>}
            </div>

            {/* Clinical vignette / stem */}
            <div className="exam-stem" role="article" aria-label="Question stem">
              <p>{question.stem}</p>
            </div>

            {/* Answer options */}
            <div className="exam-options" role="group" aria-label="Answer choices">
              {question.options.map(opt => {
                let state = ''
                if (answered) {
                  if (!examSubmitted) {
                    state = opt.letter === normalizedAnswer ? 'selected' : ''
                  } else {
                    if (opt.letter === correctLetter)                                       state = 'correct'
                    else if (opt.letter === normalizedAnswer && normalizedAnswer !== correctLetter) state = 'wrong'
                    else                                                                     state = 'neutral'
                  }
                }
                return (
                  <button
                    key={opt.letter}
                    className={`exam-opt${state ? ` ${state}` : ''}`}
                    onClick={() => handleAnswer(opt.letter)}
                    disabled={examSubmitted}
                    aria-pressed={normalizedAnswer === opt.letter}
                  >
                    <span className="exam-opt-letter">{opt.letter}</span>
                    <span className="exam-opt-text">{opt.text}</span>
                    {state === 'correct' && (
                      <svg className="exam-opt-icon correct" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {state === 'wrong' && (
                      <svg className="exam-opt-icon wrong" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Confidence selector — local state only, not persisted */}
            {answered && !examSubmitted && (
              <div className="exam-confidence">
                <span className="exam-conf-label">Confidence</span>
                <div className="exam-conf-seg" role="group" aria-label="Confidence level">
                  {['Not Sure', 'Likely', 'Confident'].map(lvl => (
                    <button
                      key={lvl}
                      type="button"
                      className={`exam-conf-btn${confidences[question.id] === lvl ? ' active' : ''}`}
                      onClick={() => setConfidences(c => ({ ...c, [question.id]: lvl }))}
                      aria-pressed={confidences[question.id] === lvl}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Answer-recorded hint */}
            {answered && !examSubmitted && (
              <div className="exam-hint">
                Answer recorded — you can change it before submitting.
              </div>
            )}

            {/* Post-submit explanation */}
            {showExplanation && answered && (
              <ExplanationPanel
                question={question}
                answered={answered}
                correctLetter={correctLetter}
                isCorrect={isCorrect}
                mode={mode}
              />
            )}

            {/* Report row */}
            <div className="exam-report-row">
              <select
                className="exam-report-select"
                value={reportReason}
                onChange={e => { setReportReason(e.target.value); setReportedQuestionId(null) }}
                aria-label="Report question reason"
              >
                <option value="wrong_answer">Wrong answer</option>
                <option value="bad_explanation">Bad explanation</option>
                <option value="off_topic">Off topic</option>
                <option value="ambiguous_or_insufficient_clues">Ambiguous / insufficient clinical clues</option>
              </select>
              <button type="button" className="exam-report-btn" onClick={handleReport}>
                Report
              </button>
              {reportedQuestionId === question.id && (
                <span className="exam-report-status">Saved</span>
              )}
            </div>

          </div>
        </main>

        {/* Right: utility sidebar */}
        <aside className="exam-sidebar-panel" aria-label="Exam utilities">

          {/* Scratchpad — local state only, per question, not persisted */}
          <div className="exam-notes-card">
            <div className="exam-notes-hdr">
              <span>Scratch Pad</span>
              <span className="exam-notes-local-tag">local only</span>
            </div>
            <textarea
              className="exam-notes-area"
              placeholder="Notes for this question..."
              value={notes[question.id] || ''}
              onChange={e => setNotes(n => ({ ...n, [question.id]: e.target.value }))}
              aria-label="Question scratch pad"
            />
          </div>

          {/* USMLE lab reference card */}
          <div className="exam-lab-card">
            <div className="exam-lab-hdr">Lab Reference</div>
            <div className="exam-lab-list" aria-label="USMLE normal lab values">
              {LAB_REFERENCE.map(item => (
                <div key={item.name} className="exam-lab-row">
                  <span className="exam-lab-name">{item.name}</span>
                  <span className="exam-lab-range">{item.range}</span>
                </div>
              ))}
            </div>
          </div>

        </aside>
      </div>

      {/* ── Footer navigation ───────────────────────────────────────────────── */}
      <footer className="exam-footer">
        <div className="exam-footer-left">
          <button
            className="exam-foot-btn secondary"
            onClick={() => handleNav(-1)}
            disabled={currentIndex === 0}
            aria-label="Previous question"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M8.5 2.5L4 7L8.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Previous
          </button>
        </div>

        <div className="exam-footer-center">
          <span className="exam-foot-counter">{currentIndex + 1} of {totalQ}</span>
        </div>

        <div className="exam-footer-right">
          {!examSubmitted && (
            <button
              className={`exam-foot-mark-btn${marked[question.id] ? ' active' : ''}`}
              onClick={toggleMark}
              aria-label={marked[question.id] ? 'Unmark question' : 'Mark for review'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2.5 1.5C2.5 1.22 2.72 1 3 1h6c.28 0 .5.22.5.5v8.72a.5.5 0 0 1-.78.41L6 8.6 3.28 10.63A.5.5 0 0 1 2.5 10.22V1.5z" stroke="currentColor" strokeWidth="1.3" fill={marked[question.id] ? 'currentColor' : 'none'}/>
              </svg>
              {marked[question.id] ? 'Marked' : 'Mark'}
            </button>
          )}
          <button
            className="exam-foot-btn secondary"
            onClick={() => handleNav(1)}
            disabled={currentIndex === totalQ - 1}
            aria-label="Next question"
          >
            Next
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M5.5 2.5L10 7L5.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {!examSubmitted && (
            <button
              className={`exam-foot-submit-btn${allAnswered ? ' ready' : ''}`}
              onClick={handleExamSubmit}
            >
              {allAnswered ? 'Submit Exam' : 'Submit All'}
            </button>
          )}
        </div>
      </footer>

    </div>
  )
}

function ExplanationPanel({ question, answered, correctLetter, isCorrect, mode }) {
  return (
    <div className={`qs-explanation${isCorrect ? ' correct' : ' wrong'}`}>
      <div className="qs-exp-verdict">
        {isCorrect ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--green)" opacity=".15"/>
              <path d="M4 8L6.5 10.5L12 5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="qs-exp-correct">Correct - {correctLetter} is right</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--red)" opacity=".12"/>
              <path d="M5 5L11 11M11 5L5 11" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <span className="qs-exp-wrong">
              Incorrect - you chose {normalizeAnswerLetter(answered)}, correct answer is {correctLetter}
            </span>
          </>
        )}
      </div>

      <div className="qs-exp-body">
        <p>{question.explanation}</p>
      </div>

      {question.pearl && (
        <div className="qs-pearl">
          <span className="qs-pearl-label">High-Yield Pearl</span>
          <p>{question.pearl}</p>
        </div>
      )}

      {mode === 'coach' && (
        <div className="qs-coach-actions">
          <button className="qs-coach-btn">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4 5h5M4 7h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            Add to Notes
          </button>
          <button className="qs-coach-btn">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M6.5 2L7.9 5.2L11.5 5.5L9 7.7L9.8 11.3L6.5 9.5L3.2 11.3L4 7.7L1.5 5.5L5.1 5.2L6.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
            Create Flashcard
          </button>
        </div>
      )}
    </div>
  )
}
