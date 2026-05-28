import { useState, useEffect, useRef } from 'react'
import { saveQuizSession } from '../../lib/storage'
import { calculatePracticeResults } from '../../lib/practiceScoring'

// Normalize legacy or unexpected mode strings to the canonical three
function normalizeMode(mode) {
  if (mode === 'timed')       return 'exam'
  if (mode === 'unlimited')   return 'practice'
  if (mode === 'explanatory') return 'coach'
  if (['exam', 'practice', 'coach'].includes(mode)) return mode
  return 'exam'
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
  const timerRef      = useRef(null)
  const onCompleteRef = useRef(onComplete)
  const markedRef     = useRef({})
  useEffect(() => { onCompleteRef.current = onComplete })
  useEffect(() => { markedRef.current = marked }, [marked])

  const { mode, questions, answers, currentIndex } = session
  const isExam  = mode === 'exam'
  const totalQ  = questions?.length ?? 0
  const question = questions?.[currentIndex] ?? questions?.[0]

  // Persist session on every state change — BEFORE early return
  useEffect(() => {
    saveQuizSession(session)
  }, [session])

  // Timer countdown — only decrements, never submits directly
  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft === null || secondsLeft <= 0) return
    timerRef.current = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [secondsLeft, examSubmitted, isExam])

  // Auto-submit when timer reaches 0 (intentional setState in effect — timer-driven, not render-driven)
  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft !== 0 || totalQ === 0) return
    clearTimeout(timerRef.current)
    setSubmitted(true)   // eslint-disable-line react-hooks/set-state-in-effect
    setShowExpl(true)
    const finalSession = { ...session, marked: markedRef.current }
    const results = calculatePracticeResults(finalSession)
    onCompleteRef.current?.({ ...results, mode: 'exam' }, finalSession)
  }, [isExam, examSubmitted, secondsLeft, totalQ, session])

  // Safety guard — AFTER all hooks
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

  const answered  = answers[question.id]
  const isCorrect = answered === question.correct

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
    ? questions.filter(q => answers[q.id] === q.correct).length
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
          {initialSession.source === 'mock-fallback' && (
            <span style={{ fontSize: 10, color: 'var(--t3)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em', fontWeight: 500 }}>
              Practice Bank
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

          {/* Options */}
          <div className="qs-options" role="group" aria-label="Answer choices">
            {question.options.map(opt => {
              let state = ''
              if (answered) {
                if (isExam && !examSubmitted) {
                  state = opt.letter === answered ? 'selected' : ''
                } else {
                  if (opt.letter === question.correct) state = 'correct'
                  else if (opt.letter === answered && answered !== question.correct) state = 'wrong'
                  else state = 'neutral'
                }
              }
              return (
                <button
                  key={opt.letter}
                  className={`qs-option ${state}`}
                  onClick={() => handleAnswer(opt.letter)}
                  disabled={isExam ? examSubmitted : !!showExplanation}
                  aria-pressed={answered === opt.letter}
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

        <div className="qs-nav-dots" aria-hidden="true">
          {questions.map((q, i) => (
            <button
              key={i}
              className={`qs-dot${i === currentIndex ? ' active' : ''}${answers[q.id] ? ' answered' : ''}`}
              onClick={() => { setShowExpl(false); updateSession({ currentIndex: i }) }}
              aria-label={`Question ${i + 1}`}
            />
          ))}
        </div>

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

function ExplanationPanel({ question, answered, isCorrect, mode }) {
  return (
    <div className={`qs-explanation${isCorrect ? ' correct' : ' wrong'}`}>
      <div className="qs-exp-verdict">
        {isCorrect ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--green)" opacity=".15" />
              <path d="M4 8L6.5 10.5L12 5" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="qs-exp-correct">Correct — {question.correct} is right</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="var(--red)" opacity=".12" />
              <path d="M5 5L11 11M11 5L5 11" stroke="var(--red)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="qs-exp-wrong">
              Incorrect — you chose {answered}, correct answer is {question.correct}
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
