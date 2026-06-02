import { useEffect, useState, useRef } from 'react'
import { getGenerationTimeoutMs, isHardMedicalReviewGeneration } from '../../lib/ai/generateAIQuestions'

const STAGES = [
  'Analyzing your configuration',
  'Selecting clinical vignettes',
  'Calibrating difficulty level',
  'Applying NBME question format',
  'Assessment ready',
]

const STAGE_DELAYS   = [100, 650, 1250, 1850, 2400]
const COMPLETE_DELAY = 3000
const MODE_LABELS = { exam: 'Exam', practice: 'Practice', coach: 'Coach' }

/**
 * @param {{
 *   config: import('../../lib/quizTypes').QuizConfig
 *   session: import('../../lib/quizTypes').QuizSession | null
 *   onComplete: () => void
 *   onError?: () => void
 * }} props
 */
export default function ExamLoadingScreen({ config, session, onComplete, onError }) {
  const [stagesDone, setStagesDone]   = useState(0)
  const [animationDone, setAnimDone]  = useState(false)
  const [hasError, setHasError]       = useState(false)

  const onCompleteRef  = useRef(onComplete)
  const onErrorRef     = useRef(onError)
  const completedRef   = useRef(false)
  const isHardMode     = isHardMedicalReviewGeneration(config)
  const timeoutMs      = getGenerationTimeoutMs(config)
  useEffect(() => {
    onCompleteRef.current = onComplete
    onErrorRef.current    = onError
  })

  // Stage animation + animation-done signal
  useEffect(() => {
    let cancelled = false

    const stageTimers = STAGE_DELAYS.map((delay, i) =>
      setTimeout(() => { if (!cancelled) setStagesDone(i + 1) }, delay)
    )

    const doneTimer = setTimeout(() => {
      if (!cancelled) setAnimDone(true)
    }, COMPLETE_DELAY)

    // Aligns the visual timeout with the active generation request timeout.
    const failTimer = setTimeout(() => {
      if (!cancelled) setHasError(true)
    }, timeoutMs)

    return () => {
      cancelled = true
      stageTimers.forEach(clearTimeout)
      clearTimeout(doneTimer)
      clearTimeout(failTimer)
    }
  }, [timeoutMs])

  // Fire onComplete exactly once when both animation and session are ready
  useEffect(() => {
    if (animationDone && session && !completedRef.current) {
      completedRef.current = true
      onCompleteRef.current()
    }
  }, [animationDone, session])

  const isSessionReady    = Boolean(session)
  const waitingForSession = animationDone && !isSessionReady && !hasError

  // Clamp visible stage completions: last stage only appears done once session exists
  const visibleStagesDone = isSessionReady
    ? STAGES.length
    : Math.min(stagesDone, STAGES.length - 1)

  // Progress never goes backward: holds at 95 while waiting, hits 100 only on session ready
  const rawProgress = Math.round((visibleStagesDone / STAGES.length) * 100)
  const progress    = isSessionReady
    ? 100
    : waitingForSession
      ? 95
      : Math.min(rawProgress, 94)

  const modeLabel = MODE_LABELS[config.mode] || config.mode
  const source    = session?.source

  if (hasError) {
    return (
      <div className="els-overlay">
        <div className="els-card">
          <div className="els-error-ico" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="#CC3A3A" strokeWidth="1.5" opacity=".4" />
              <path d="M13 13L27 27M27 13L13 27" stroke="#CC3A3A" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <div className="els-error-title">Unable to prepare exam block</div>
          <div className="els-error-msg">
            {isHardMode
              ? 'Hard-mode generation is taking longer than expected. These questions are medically reviewed, so a full block can take several minutes.'
              : 'Something went wrong while generating your quiz session. Please try again or return to the builder.'}
          </div>
          <div className="els-error-actions">
            <button className="els-err-btn primary" onClick={() => onErrorRef.current?.()}>
              Try Again
            </button>
            <button className="els-err-btn secondary" onClick={() => onErrorRef.current?.()}>
              Back to Builder
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="els-overlay" role="status" aria-live="polite" aria-label="Preparing your assessment">
      <div className="els-card">

        {/* Header row */}
        <div className="els-top">
          <div className="els-logo">
            <svg width="20" height="23" viewBox="0 0 28 32" fill="none" aria-hidden="true">
              <defs>
                <linearGradient id="els-lg" x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2A82E0" />
                  <stop offset="1" stopColor="#1250A0" />
                </linearGradient>
              </defs>
              <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" fill="url(#els-lg)" />
              <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" stroke="rgba(255,255,255,.12)" strokeWidth=".6" fill="none" />
              <rect x="13.2" y="9.5" width="1.6" height="14" rx=".8" fill="white" />
              <path d="M14 9.5C14 9.5 11.2 7.2 11.8 4.8C12.2 3.2 14 1.8 14 1.8s1.8 1.4 2.2 3c.6 2.4-2.2 4.7-2.2 4.7Z" fill="white" />
              <path d="M10 13.5c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
              <path d="M10 18c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
            </svg>
            <span className="els-logo-text">MEDICA</span>
          </div>
          <div className="els-mode-badge" data-mode={config.mode}>{modeLabel} Mode</div>
        </div>

        <div className="els-heading">Preparing Your Assessment</div>
        <div className="els-sub">
          {config.questionCount} questions · {config.difficulty} · {config.system}
        </div>

        {/* Stage list */}
        <div className="els-stages" role="list">
          {STAGES.map((label, i) => {
            const done   = i < visibleStagesDone
            const active = !isSessionReady && i === visibleStagesDone && visibleStagesDone < STAGES.length
            return (
              <div
                key={i}
                role="listitem"
                className={`els-stage${done ? ' done' : active ? ' active' : ''}`}
              >
                <div className="els-stage-icon" aria-hidden="true">
                  {done ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" fill="rgba(63,232,160,.15)" />
                      <path d="M4.5 8L7 10.5L11.5 5.5" stroke="#3FE8A0" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <div className={`els-stage-dot${active ? ' els-stage-dot-active' : ''}`} />
                  )}
                </div>
                <span className="els-stage-lbl">{label}</span>
              </div>
            )
          })}
        </div>

        {/* Finalizing state — animation done but session still arriving */}
        {waitingForSession && (
          <div className="els-finalizing" aria-live="polite">
            {isHardMode
              ? 'Building validated hard-mode questions. This can take several minutes.'
              : 'Finalizing assessment&hellip;'}
          </div>
        )}

        {/* Progress bar */}
        <div className="els-bar-row">
          <div className="els-bar-wrap" aria-hidden="true">
            <div className="els-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className={`els-percent${progress >= 100 ? ' els-percent-done' : ''}`}>
            {progress}%
          </span>
        </div>

        <div className="els-footer">
          USMLE Step 1 · NBME-style · Clinical Vignettes
          {source && (
            <span className="els-source-tag" style={{ marginLeft: 8, opacity: 0.5, fontSize: '0.85em' }}>
              · {source === 'ai' ? 'Live AI' : 'Validated Local Bank'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
