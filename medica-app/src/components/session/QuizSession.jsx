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
    requested_count_reached:     'target reached',
    max_candidates_reached:      'candidate limit reached',
    max_refill_rounds_reached:   'round limit reached',
    generation_error:            'generation stopped',
    rate_limited:                'rate limited',
    unknown:                     'unknown stop',
  }
  return labels[reason] || null
}

function getMedicalReviewLabel(telemetry) {
  if (!telemetry || !telemetry.medicalReviewRequested) return null
  return `${telemetry.medicalReviewPassed}/${telemetry.medicalReviewRequested} medically reviewed`
}

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
  const [marked, setMarked] = useState({})
  const [reportReason, setReportReason] = useState('wrong_answer')
  const [reportedQuestionId, setReportedQuestionId] = useState(null)
  const timerRef      = useRef(null)
  const onCompleteRef = useRef(onComplete)
  const markedRef     = useRef({})
  useEffect(() => { onCompleteRef.current = onComplete })
  useEffect(() => { markedRef.current = marked }, [marked])

  const { mode, questions, answers, currentIndex } = session
  const isExam  = mode === 'exam'
  const totalQ  = questions?.length ?? 0
  const question = questions?.[currentIndex] ?? questions?.[0]
  const sourceLabel = getSessionSourceLabel(initialSession)
  const fallbackReasonLabel = formatFallbackReason(initialSession.config?.fallbackReason)
  const medicalReviewLabel = getMedicalReviewLabel(initialSession.generationTelemetry)
  const stopReasonLabel = formatStopReason(initialSession.generationTelemetry?.stoppedReason)

  // Persist session on every state change - BEFORE early return
  useEffect(() => {
    saveQuizSession(session)
  }, [session])

  // Timer countdown - only decrements, never submits directly
  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft === null || secondsLeft <= 0) return
    timerRef.current = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [secondsLeft, examSubmitted, isExam])

  // Auto-submit when timer reaches 0 (intentional setState in effect - timer-driven, not render-driven)
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
  const correctLetter = getQuestionCorrectLetter(question)
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
    <div className="qs-page">
      {/* Session header */}
      <div className="qs-hdr">
        <div className="qs-hdr-left">
          <button className="qs-exit-btn" onClick={onExit} aria-label="Exit session">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Exit
          </button>
          <div className="qs-hdr-sep" />
          <div className={`qs-mode-badge ${mode}`}>
            {mode === 'exam' ? 'Exam' : mode === 'practice' ? 'Practice' : 'Coach'} Mode
          </div>
          {sourceLabel && (
            <span
              title={initialSession.config?.fallbackReason ? `Fallback reason: ${initialSession.config.fallbackReason}` : undefined}
              style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em', fontWeight: 500 }}
            >
              {sourceLabel}
            </span>
          )}
          {fallbackReasonLabel && (
            <span style={{ fontSize: 10, color: 'var(--status-warn)', background: 'rgba(230,170,60,.1)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em', fontWeight: 500 }}>
              Fallback: {fallbackReasonLabel}
            </span>
          )}
          {medicalReviewLabel && (
            <span style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em', fontWeight: 500 }}>
              {medicalReviewLabel}
            </span>
          )}
          {stopReasonLabel && (
            <span style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em', fontWeight: 500 }}>
              {stopReasonLabel}
            </span>
          )}
        </div>

        <div className="qs-progress-wrap">
          <div className="qs-progress-bar">
            <div
              className="qs-progress-fill"
              style={{ width: `${((currentIndex + 1) / totalQ) * 100}%` }}
            />
          </div>
          <span className="qs-progress-lbl">
            {currentIndex + 1} / {totalQ}
          </span>
        </div>

        <div className="qs-hdr-right">
          {isExam && !examSubmitted && question && (
            <button
              className={`qs-mark-btn${marked[question.id] ? ' active' : ''}`}
              onClick={toggleMark}
              aria-label={marked[question.id] ? 'Unmark question' : 'Mark for review'}
              title={marked[question.id] ? 'Unmark' : 'Mark for review'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2.5 1.5C2.5 1.22 2.72 1 3 1h6c.28 0 .5.22.5.5v8.72a.5.5 0 0 1-.78.41L6 8.6 3.28 10.63A.5.5 0 0 1 2.5 10.22V1.5z" stroke="currentColor" strokeWidth="1.3" fill={marked[question.id] ? 'currentColor' : 'none'} />
              </svg>
              {marked[question.id] ? 'Marked' : 'Mark'}
            </button>
          )}
          {isExam && !examSubmitted && secondsLeft !== null && (
            <div className={`qs-timer${secondsLeft < 60 ? ' urgent' : ''}`}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M6.5 4V6.5L8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {formatTime(secondsLeft)}
            </div>
          )}
          {isExam && !examSubmitted && (
            <button className={`qs-submit-btn${allAnswered ? ' ready' : ''}`} onClick={handleExamSubmit}>
              {allAnswered ? 'Submit Exam' : 'Submit All'}
            </button>
          )}
          {examSubmitted && score !== null && (
            <div className="qs-score-badge">
              {score}/{totalQ} correct
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="qs-body">
        <div className="qs-content">
          {/* Question meta */}
          <div className="qs-q-meta">
            <span className="qs-q-tag">{question.subject}</span>
            <span className="qs-q-tag">{question.system}</span>
            <span className="qs-q-tag qs-q-tag-diff">{question.difficulty}</span>
          </div>

          {/* Stem */}
          <div className="qs-stem" role="article">
            <p>{question.stem}</p>
          </div>

          <div className="question-report-row">
            <select
              className="question-report-select"
              value={reportReason}
              onChange={e => { setReportReason(e.target.value); setReportedQuestionId(null) }}
              aria-label="Report question reason"
            >
              <option value="wrong_answer">Wrong answer</option>
              <option value="bad_explanation">Bad explanation</option>
              <option value="off_topic">Off topic</option>
              <option value="ambiguous_or_insufficient_clues">Ambiguous / insufficient clinical clues</option>
            </select>
            <button type="button" className="question-report-btn" onClick={handleReport}>
              Report
            </button>
            {reportedQuestionId === question.id && <span className="question-report-status">Saved</span>}
          </div>

          {/* Options */}
          <div className="qs-options" role="group" aria-label="Answer choices">
            {question.options.map(opt => {
              let state = ''
              if (answered) {
                if (isExam && !examSubmitted) {
                  state = opt.letter === normalizedAnswer ? 'selected' : ''
                } else {
                  if (opt.letter === correctLetter) state = 'correct'
                  else if (opt.letter === normalizedAnswer && normalizedAnswer !== correctLetter) state = 'wrong'
                  else state = 'neutral'
                }
              }
              return (
                <button
                  key={opt.letter}
                  className={`qs-option ${state}`}
                  onClick={() => handleAnswer(opt.letter)}
                  disabled={isExam ? examSubmitted : !!showExplanation}
                  aria-pressed={normalizedAnswer === opt.letter}
                >
                  <span className="qs-opt-letter">{opt.letter}</span>
                  <span className="qs-opt-text">{opt.text}</span>
                  {state === 'correct' && (
                    <svg className="qs-opt-icon correct" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8L6.5 11.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {state === 'wrong' && (
                    <svg className="qs-opt-icon wrong" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>

          {/* Explanation */}
          {showExplanation && answered && (
            <ExplanationPanel
              question={question}
              answered={answered}
              correctLetter={correctLetter}
              isCorrect={isCorrect}
              mode={mode}
            />
          )}

          {isExam && answered && !examSubmitted && (
            <div className="qs-exam-hint">
              Answer selected. You can change it any time before submitting.
            </div>
          )}
        </div>
      </div>

      {/* Question Navigator */}
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

      {/* Navigation footer */}
      <div className="qs-nav">
        <button
          className="qs-nav-btn secondary"
          onClick={() => handleNav(-1)}
          disabled={currentIndex === 0}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M8.5 2.5L4 7L8.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Previous
        </button>

        <button
          className="qs-nav-btn primary"
          onClick={() => handleNav(1)}
          disabled={currentIndex === totalQ - 1}
        >
          Next
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M5.5 2.5L10 7L5.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
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
              <circle cx="8" cy="8" r="7" fill="var(--green)" opacity=".15" />
              <path d="M4 8L6.5 10.5L12 5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="qs-exp-correct">Correct - {correctLetter} is right</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--red)" opacity=".12" />
              <path d="M5 5L11 11M11 5L5 11" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" />
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
              <rect x="1.5" y="1.5" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4 5h5M4 7h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Add to Notes
          </button>
          <button className="qs-coach-btn">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M6.5 2L7.9 5.2L11.5 5.5L9 7.7L9.8 11.3L6.5 9.5L3.2 11.3L4 7.7L1.5 5.5L5.1 5.2L6.5 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            Create Flashcard
          </button>
        </div>
      )}
    </div>
  )
}
