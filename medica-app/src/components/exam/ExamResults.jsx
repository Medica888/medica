import { isQuestionAnswered, isQuestionCorrect } from '../../lib/examReviewHelpers'

const READINESS_COLOR = {
  'Strong':           'var(--status-stable)',
  'Ready':            '#2E64C8',
  'Borderline':       'var(--status-warn)',
  'Building':         'var(--status-warn)',
  'Needs Foundation': 'var(--status-critical)',
}

function barColor(pct) {
  return pct < 50 ? 'var(--status-critical)' : pct < 70 ? 'var(--status-warn)' : 'var(--status-stable)'
}

/**
 * @param {{
 *   results: import('../../lib/practiceScoring').PracticeResults
 *   session: import('../../lib/quizTypes').QuizSession & { marked?: object }
 *   onReview: (filter: string) => void
 *   onNewQuiz: () => void
 *   onBackToBuilder: () => void
 *   onViewAnalytics?: () => void
 * }} props
 */
export default function ExamResults({ results, session, onReview, onNewQuiz, onBackToBuilder, onViewAnalytics }) {
  const {
    total, correct, percentage,
    subjectBreakdown, systemBreakdown,
    weakAreas, medicaScore, readinessLabel, recommendation,
  } = results

  const answers   = session?.answers ?? {}
  const questions = session?.questions ?? []
  const marked    = session?.marked ?? {}

  const wrongCount   = questions.filter(q => isQuestionAnswered(answers[q.id]) && !isQuestionCorrect(q, answers[q.id])).length
  const skippedCount = questions.filter(q => !isQuestionAnswered(answers[q.id])).length
  const markedCount  = questions.filter(q => marked[q.id]).length

  const duration = (results?.completedAt && session?.startedAt)
    ? Math.max(0, Math.round((new Date(results.completedAt) - new Date(session.startedAt)) / 1000))
    : null

  const rdColor = READINESS_COLOR[readinessLabel] ?? 'var(--t3)'

  const durationStr = duration !== null
    ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
    : null

  return (
    <div className="cr-page">
      <div className="cr-scroll">

        {/* ── Hero header ── */}
        <div className="cr-hero">
          <div className="cr-hero-left">
            <div className="cr-hero-eyebrow">
              EXAM MODE · SESSION COMPLETE{durationStr ? ` · ${durationStr}` : ''}
            </div>
            <h1 className="cr-hero-title">
              {session?.config?.subject && session.config.subject !== 'All Subjects'
                ? session.config.subject
                : session?.config?.system && session.config.system !== 'All Systems'
                  ? session.config.system
                  : 'Exam Session'}
            </h1>
            <p className="cr-hero-meta">
              {correct}/{total} correct · {wrongCount} wrong{skippedCount > 0 ? ` · ${skippedCount} unanswered` : ''}
            </p>
          </div>
          <div className="cr-hero-kpis">
            <div className="cr-kpi cr-kpi--accuracy">
              <span className="cr-kpi-num">{percentage}%</span>
              <span className="cr-kpi-lbl">ACCURACY</span>
            </div>
            <div className="cr-kpi-sep" />
            <div className="cr-kpi cr-kpi--score">
              <span className="cr-kpi-num">{medicaScore}</span>
              <span className="cr-kpi-lbl">MEDICA SCORE</span>
            </div>
            <div className="cr-kpi-sep" />
            <div className="cr-kpi">
              <span className="cr-kpi-num" style={{ color: rdColor }}>{readinessLabel}</span>
              <span className="cr-kpi-lbl">READINESS</span>
            </div>
          </div>
        </div>

        {/* ── Two-column body ── */}
        {total < 10 && (
          <p className="cr-sample-note" role="note">
            Early snapshot from {total} question{total !== 1 ? 's' : ''}. Use this session for review, not as a stable readiness estimate.
          </p>
        )}

        <div className="cr-body-grid">

          {/* Left column */}
          <div className="cr-left">

            {/* Recommendation */}
            <div className="cr-panel cr-panel--rec">
              <div className="cr-panel-label">RECOMMENDATION</div>
              <p className="cr-rec-text">{recommendation}</p>
            </div>

            {/* Instability signals */}
            {weakAreas.length > 0 && (
              <div className="cr-panel">
                <div className="cr-panel-label">WEAK AREAS</div>
                <div className="cr-wsd">
                  {weakAreas.map((w, i) => {
                    const sev = w.percentage < 50 ? 'priority' : w.percentage < 70 ? 'focus' : 'reinforced'
                    const lbl = w.percentage < 50 ? 'PRIORITY' : w.percentage < 70 ? 'FOCUS' : 'REINFORCED'
                    return (
                      <div key={i} className={`cr-wsd-row cr-wsd-row--${sev}`}>
                        <div className="cr-wsd-top">
                          <div className="cr-wsd-left">
                            <span className="cr-wsd-cat">{w.name}</span>
                            <span className="cr-wsd-detail">{w.type}</span>
                          </div>
                          <span className={`cr-wsd-badge cr-wsd-badge--${sev}`}>{lbl}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Subject + System breakdowns */}
            {(subjectBreakdown.length > 0 || systemBreakdown.length > 0) && (
              <div className="cr-panel cr-panel--breakdown">
                <div className="cr-bd-cols">
                  {subjectBreakdown.length > 0 && (
                    <div className="cr-bd-col">
                      <div className="cr-panel-label">BY SUBJECT</div>
                      {subjectBreakdown.map((s, i) => (
                        <div key={i} className="cr-bd-row">
                          <span className="cr-bd-name">{s.name}</span>
                          <div className="cr-bd-bar-wrap">
                            <div className="cr-bd-bar" style={{ width: `${s.percentage}%`, background: barColor(s.percentage) }} />
                          </div>
                          <span className="cr-bd-pct" style={{ color: barColor(s.percentage) }}>{s.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {systemBreakdown.length > 0 && (
                    <div className="cr-bd-col">
                      <div className="cr-panel-label">BY SYSTEM</div>
                      {systemBreakdown.map((s, i) => (
                        <div key={i} className="cr-bd-row">
                          <span className="cr-bd-name">{s.name}</span>
                          <div className="cr-bd-bar-wrap">
                            <div className="cr-bd-bar" style={{ width: `${s.percentage}%`, background: barColor(s.percentage) }} />
                          </div>
                          <span className="cr-bd-pct" style={{ color: barColor(s.percentage) }}>{s.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right column */}
          <div className="cr-right">

            {/* Review shortcuts */}
            <div className="cr-panel cr-panel--fc">
              <div className="cr-panel-label">REVIEW ANSWERS</div>
              <div className="er-review-grid">
                <button type="button" className="er-review-tile" onClick={() => onReview('all')}>
                  <span className="er-review-tile-num">{total}</span>
                  <span className="er-review-tile-lbl">All Questions</span>
                </button>
                <button type="button" className="er-review-tile er-review-tile--wrong" onClick={() => onReview('incorrect')}>
                  <span className="er-review-tile-num">{wrongCount}</span>
                  <span className="er-review-tile-lbl">Incorrect</span>
                </button>
                {markedCount > 0 && (
                  <button type="button" className="er-review-tile er-review-tile--marked" onClick={() => onReview('marked')}>
                    <span className="er-review-tile-num">{markedCount}</span>
                    <span className="er-review-tile-lbl">Marked</span>
                  </button>
                )}
                {skippedCount > 0 && (
                  <button type="button" className="er-review-tile er-review-tile--skip" onClick={() => onReview('unanswered')}>
                    <span className="er-review-tile-num">{skippedCount}</span>
                    <span className="er-review-tile-lbl">Unanswered</span>
                  </button>
                )}
              </div>
            </div>

            {/* Next actions */}
            <div className="cr-panel cr-panel--actions">
              <div className="cr-panel-label">NEXT ACTIONS</div>
              <div className="cr-actions-list">
                <button type="button" className="cr-action-btn cr-action-btn--primary" onClick={() => onReview('all')}>
                  Review All Answers
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {onViewAnalytics && (
                  <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onViewAnalytics}>
                    View Analytics
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onNewQuiz}>
                  Build Another Block
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onBackToBuilder}>
                  Return to Mission Control
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>

            <p className="cr-disclaimer">
              Medica Score is an internal learning estimate and is not an official USMLE score prediction.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}
