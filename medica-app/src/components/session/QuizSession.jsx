import { useState, useRef, useEffect } from 'react'
import { saveQuizSession } from '../../lib/storage'
import { calculatePracticeResults } from '../../lib/practiceScoring'
import { getQuestionCorrectLetter, normalizeAnswerLetter } from '../../lib/answerNormalize'
import QuestionNavigator from './QuestionNavigator'
import HighlightedText from './HighlightedText'
import LabDrawer from './LabDrawer'
import NotesDrawer from './NotesDrawer'
import CalculatorDrawer from './CalculatorDrawer'
import SubmitConfirmModal from './SubmitConfirmModal'
import QuizUtilityBar from './QuizUtilityBar'
import QuizHighlightToolbar from './QuizHighlightToolbar'
import QuestionReportControl from './QuestionReportControl'

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
  const [confidences, setConfidences]   = useState({})
  const [notes, setNotes]               = useState({})
  const [openDrawer, setOpenDrawer]     = useState(null)
  const [highlights, setHighlights]     = useState({})
  const [activeHighlightColor, setActiveHighlightColor] = useState('yellow')
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)

  const timerRef      = useRef(null)
  const onCompleteRef = useRef(onComplete)
  const markedRef     = useRef({})
  const highlightsRef = useRef({})
  useEffect(() => { onCompleteRef.current = onComplete })
  useEffect(() => { markedRef.current = marked }, [marked])
  useEffect(() => { highlightsRef.current = highlights }, [highlights])

  const { mode, questions, answers, currentIndex } = session
  const isExam   = mode === 'exam'
  const totalQ   = questions?.length ?? 0
  const question = questions?.[currentIndex] ?? questions?.[0]
  const sourceLabel         = getSessionSourceLabel(initialSession)
  const fallbackReasonLabel = formatFallbackReason(initialSession.config?.fallbackReason)
  const medicalReviewLabel  = getMedicalReviewLabel(initialSession.generationTelemetry)
  const stopReasonLabel     = formatStopReason(initialSession.generationTelemetry?.stoppedReason)

  useEffect(() => { saveQuizSession(session) }, [session])

  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft === null || secondsLeft <= 0) return
    timerRef.current = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(timerRef.current)
  }, [secondsLeft, examSubmitted, isExam])

  useEffect(() => {
    if (!isExam || examSubmitted || secondsLeft !== 0 || totalQ === 0) return
    clearTimeout(timerRef.current)
    setSubmitted(true)   // eslint-disable-line react-hooks/set-state-in-effect
    setShowExpl(true)
    const finalSession = { ...session, marked: markedRef.current, highlights: highlightsRef.current }
    const results = calculatePracticeResults(finalSession)
    onCompleteRef.current?.({ ...results, mode: 'exam' }, finalSession)
  }, [isExam, examSubmitted, secondsLeft, totalQ, session])

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

  const answered        = answers[question.id]
  const correctLetter   = getQuestionCorrectLetter(question)
  const normalizedAnswer = normalizeAnswerLetter(answered)
  const isCorrect = normalizedAnswer === correctLetter

  const updateSession = (patch) => setSession(s => ({ ...s, ...patch }))
  const toggleMark = () => setMarked(m => ({ ...m, [question.id]: !m[question.id] }))
  const closeDrawer = () => setOpenDrawer(null)
  const allAnswered = Object.keys(answers).length === totalQ
  const markedCount = Object.values(marked).filter(Boolean).length

  const handleSubmitRequest = () => setShowSubmitConfirm(true)

  const handleConfirmSubmit = () => {
    setShowSubmitConfirm(false)
    clearTimeout(timerRef.current)
    setSubmitted(true)
    setShowExpl(true)
    if (onCompleteRef.current) {
      const finalSession = { ...session, marked: markedRef.current, highlights }
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

  const handleNav = (dir) => {
    const next = currentIndex + dir
    if (next < 0 || next >= totalQ) return
    setShowExpl(false)
    updateSession({ currentIndex: next })
  }

  const handleHighlight = (start, end, color) => {
    setHighlights(h => ({
      ...h,
      [question.id]: [...(h[question.id] || []), { start, end, color }],
    }))
  }

  const handleClearHighlights = () => {
    setHighlights(h => ({ ...h, [question.id]: [] }))
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

      {/* ── Top header ─────────────────────────────────────────────────────── */}
      <header className="exam-hdr">
        <div className="exam-hdr-left">
          <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true">
            <path d="M11 1L2 4.8V12.5C2 17.7 5.8 22.5 11 24C16.2 22.5 20 17.7 20 12.5V4.8L11 1Z" fill="var(--blue)" fillOpacity="0.18" stroke="var(--blue)" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M7 13L9.5 15.5L15 10" stroke="var(--blue)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="exam-hdr-wordmark">MEDICA</span>
          <div className="exam-hdr-sep" />
          <span className="exam-hdr-mode-lbl">Exam Mode</span>
          {sourceLabel         && <span className="exam-badge-meta">{sourceLabel}</span>}
          {fallbackReasonLabel && <span className="exam-badge-warn">Fallback: {fallbackReasonLabel}</span>}
          {medicalReviewLabel  && <span className="exam-badge-meta">{medicalReviewLabel}</span>}
          {stopReasonLabel     && <span className="exam-badge-meta">{stopReasonLabel}</span>}
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
            <button className={`exam-hdr-finish-btn${allAnswered ? ' ready' : ''}`} onClick={handleSubmitRequest}>
              Submit Exam
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

      {/* ── 2-column body (nav + full-width center) ─────────────────────────── */}
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

        {/* Center: full-width question content */}
        <section className="exam-center" aria-label="Question">
          <div className="exam-center-inner">

            {/* Meta row: subject / system tags + utility buttons */}
            <div className="exam-q-meta">
              <div className="exam-q-tags">
                {question.subject && <span className="exam-q-tag">{question.subject}</span>}
                {question.system && question.system !== question.subject && <span className="exam-q-tag">{question.system}</span>}
              </div>
              <QuizUtilityBar
                openDrawer={openDrawer}
                onToggle={(d) => setOpenDrawer(prev => prev === d ? null : d)}
                hasNotes={!!notes[question.id]}
              />
            </div>

            {/* Highlight toolbar */}
            {!examSubmitted && (
              <QuizHighlightToolbar
                highlights={highlights[question.id] || []}
                activeColor={activeHighlightColor}
                onChangeColor={setActiveHighlightColor}
                onClear={handleClearHighlights}
              />
            )}

            {/* Clinical vignette */}
            <div className="exam-stem" role="article" aria-label="Question stem">
              <HighlightedText
                text={question.stem}
                highlights={highlights[question.id] || []}
                activeColor={activeHighlightColor}
                onHighlight={handleHighlight}
                enabled={!examSubmitted}
              />
            </div>

            {/* Answer options */}
            <div className="exam-options" role="group" aria-label="Answer choices">
              {question.options.map(opt => {
                let state = ''
                if (answered) {
                  if (!examSubmitted) {
                    state = opt.letter === normalizedAnswer ? 'selected' : ''
                  } else {
                    if (opt.letter === correctLetter)                                             state = 'correct'
                    else if (opt.letter === normalizedAnswer && normalizedAnswer !== correctLetter) state = 'wrong'
                    else                                                                           state = 'neutral'
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

            {/* Confidence selector */}
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

            <QuestionReportControl question={question} context={{ mode }} variant="exam" />

          </div>
        </section>
      </div>

      {/* ── Footer navigation ──────────────────────────────────────────────── */}
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
        </div>
      </footer>

      {/* ── Non-blocking drawers ────────────────────────────────────────────── */}
      <LabDrawer isOpen={openDrawer === 'labs'} onClose={closeDrawer} />
      <CalculatorDrawer isOpen={openDrawer === 'calc'} onClose={closeDrawer} />
      <NotesDrawer
        isOpen={openDrawer === 'notes'}
        onClose={closeDrawer}
        questionId={question.id}
        notes={notes}
        onNotesChange={(id, val) => setNotes(n => ({ ...n, [id]: val }))}
      />

      {/* ── Submit confirmation modal ───────────────────────────────────────── */}
      <SubmitConfirmModal
        isOpen={showSubmitConfirm}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowSubmitConfirm(false)}
        answered={Object.keys(answers).length}
        total={totalQ}
        markedCount={markedCount}
      />

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
