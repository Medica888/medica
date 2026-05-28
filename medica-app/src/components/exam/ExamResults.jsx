import { isQuestionAnswered, isQuestionCorrect } from '../../lib/examReviewHelpers'

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

  const readinessColor = {
    'Strong':           'var(--green)',
    'Ready':            'var(--blue)',
    'Borderline':       'var(--orange)',
    'Building':         'var(--orange)',
    'Needs Foundation': 'var(--red)',
  }[readinessLabel] ?? 'var(--t3)'

  return (
    <div className="er-page">
      <div className="er-scroll">
        <div className="er-content">

          {/* Hero card */}
          <div className="er-hero-card">
            <div className="er-hero-top">
              <div className="er-mode-badge">
                Exam Mode · Complete
                {duration !== null && (
                  <span className="er-duration">
                    {' · '}{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}
                  </span>
                )}
              </div>

              <div className="er-score-wrap">
                {/* Score circle */}
                <div className="er-score-circle">
                  <svg width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
                    <circle
                      cx="60" cy="60" r="52" fill="none"
                      stroke={percentage >= 60 ? 'var(--blue)' : 'var(--orange)'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 52}`}
                      strokeDashoffset={`${2 * Math.PI * 52 * (1 - percentage / 100)}`}
                      style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dashoffset .6s ease' }}
                    />
                  </svg>
                  <div className="er-score-inner">
                    <span className="er-score-pct">{percentage}%</span>
                    <span className="er-score-sub">{correct}/{total}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="er-stats">
                  <div className="er-stat">
                    <span className="er-stat-val correct">{correct}</span>
                    <span className="er-stat-lbl">Correct</span>
                  </div>
                  <div className="er-stat-div" />
                  <div className="er-stat">
                    <span className="er-stat-val wrong">{wrongCount}</span>
                    <span className="er-stat-lbl">Wrong</span>
                  </div>
                  <div className="er-stat-div" />
                  <div className="er-stat">
                    <span className="er-stat-val skipped">{skippedCount}</span>
                    <span className="er-stat-lbl">Skipped</span>
                  </div>
                  <div className="er-stat-div" />
                  <div className="er-stat">
                    <span className="er-stat-val">{total}</span>
                    <span className="er-stat-lbl">Total</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Medica Score */}
            <div className="er-medica-row">
              <div className="er-medica-label-row">
                <span className="er-medica-lbl">Medica Score</span>
                <span className="er-medica-hint">Internal readiness estimate — not an official USMLE prediction</span>
              </div>
              <div className="er-medica-bar-row">
                <div className="er-medica-bar-wrap">
                  <div className="er-medica-bar" style={{ width: `${medicaScore}%`, background: readinessColor }} />
                </div>
                <span className="er-medica-num" style={{ color: readinessColor }}>{medicaScore}</span>
              </div>
              <div className="er-readiness-badge" style={{ color: readinessColor, borderColor: readinessColor }}>
                {readinessLabel}
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="er-recommendation">
            <div className="er-rec-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L9.4 5.3L13 5.5L10.3 7.9L11.1 11.5L8 9.8L4.9 11.5L5.7 7.9L3 5.5L6.6 5.3L8 2Z" stroke="var(--blue)" strokeWidth="1.4" strokeLinejoin="round" fill="var(--blue-10)" />
              </svg>
            </div>
            <p>{recommendation}</p>
          </div>

          {/* Weak areas */}
          {weakAreas.length > 0 && (
            <div className="er-section">
              <div className="er-section-title">Instability Signals</div>
              <div className="er-weak-list">
                {weakAreas.map((w, i) => (
                  <div key={i} className="er-weak-item">
                    <span className="er-weak-type">{w.type}</span>
                    <span className="er-weak-name">{w.name}</span>
                    <div className="er-weak-bar-wrap">
                      <div className="er-weak-bar" style={{ width: `${w.percentage}%` }} />
                    </div>
                    <span className="er-weak-pct">{w.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subject breakdown */}
          {subjectBreakdown.length > 0 && (
            <div className="er-section">
              <div className="er-section-title">By Subject</div>
              <div className="er-breakdown-list">
                {subjectBreakdown.map((s, i) => (
                  <BreakdownRow key={i} item={s} />
                ))}
              </div>
            </div>
          )}

          {/* System breakdown */}
          {systemBreakdown.length > 0 && (
            <div className="er-section">
              <div className="er-section-title">By System</div>
              <div className="er-breakdown-list">
                {systemBreakdown.map((s, i) => (
                  <BreakdownRow key={i} item={s} />
                ))}
              </div>
            </div>
          )}

          {/* Review shortcuts */}
          <div className="er-section">
            <div className="er-section-title">Review Answers</div>
            <div className="er-review-btns">
              <button type="button" className="er-review-btn" onClick={() => onReview('all')}>
                <span className="er-review-btn-label">All Questions</span>
                <span className="er-review-btn-count">{total}</span>
              </button>
              <button type="button" className="er-review-btn wrong" onClick={() => onReview('incorrect')}>
                <span className="er-review-btn-label">Incorrect</span>
                <span className="er-review-btn-count">{wrongCount}</span>
              </button>
              {markedCount > 0 && (
                <button type="button" className="er-review-btn marked" onClick={() => onReview('marked')}>
                  <span className="er-review-btn-label">Marked</span>
                  <span className="er-review-btn-count">{markedCount}</span>
                </button>
              )}
              {skippedCount > 0 && (
                <button type="button" className="er-review-btn skipped" onClick={() => onReview('unanswered')}>
                  <span className="er-review-btn-label">Unanswered</span>
                  <span className="er-review-btn-count">{skippedCount}</span>
                </button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="er-actions">
            {onViewAnalytics && (
              <button type="button" className="er-btn secondary" onClick={onViewAnalytics}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 10V7M5 10V4M8 10V6M11 10V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                View Analytics
              </button>
            )}
            <button type="button" className="er-btn primary" onClick={onNewQuiz}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 2v2m0 6v2M2 7h2m6 0h2M4.22 4.22l1.42 1.42m2.72 2.72l1.42 1.42M4.22 9.78l1.42-1.42m2.72-2.72l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New Quiz
            </button>
            <button type="button" className="er-btn ghost" onClick={onBackToBuilder}>
              Back to Builder
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ item }) {
  const barColor = item.percentage >= 70 ? 'var(--green)' : item.percentage >= 50 ? 'var(--orange)' : 'var(--red)'
  return (
    <div className="er-breakdown-row">
      <span className="er-bd-name">{item.name}</span>
      <div className="er-bd-bar-wrap">
        <div className="er-bd-bar" style={{ width: `${item.percentage}%`, background: barColor }} />
      </div>
      <span className="er-bd-stat">{item.correct}/{item.total}</span>
      <span className="er-bd-pct" style={{ color: barColor }}>{item.percentage}%</span>
    </div>
  )
}
