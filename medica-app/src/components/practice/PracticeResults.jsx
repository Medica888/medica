import { useState } from 'react'
import { generateFlashcardsFromPracticeMistakes } from '../../lib/flashcardGenerator'
import { appendFlashcards } from '../../lib/storage'

/**
 * @param {{
 *   results: import('../../lib/practiceScoring').PracticeResults
 *   session: import('../../lib/quizTypes').QuizSession
 *   onReview: () => void
 *   onNewQuiz: () => void
 *   onBackToBuilder: () => void
 *   onViewAnalytics?: () => void
 *   onNavigateToFlashcards?: () => void
 * }} props
 */
export default function PracticeResults({ results, session, onReview, onNewQuiz, onBackToBuilder, onViewAnalytics, onNavigateToFlashcards }) {
  const {
    total, correct, wrong, percentage,
    subjectBreakdown, systemBreakdown,
    weakAreas, medicaScore, readinessLabel, recommendation,
  } = results

  const [generatedCount, setGeneratedCount] = useState(null)

  const hasFlashcardsAdded = generatedCount !== null && generatedCount > 0
  const showReviewFirst    = hasFlashcardsAdded && onNavigateToFlashcards

  const handleGenerateFlashcards = () => {
    if (!session) return
    const cards = generateFlashcardsFromPracticeMistakes(session)
    const added = appendFlashcards(cards)
    setGeneratedCount(added)
  }

  const readinessColor = {
    'Strong':           'var(--green)',
    'Ready':            'var(--blue)',
    'Borderline':       'var(--orange)',
    'Building':         'var(--orange)',
    'Needs Foundation': 'var(--red)',
  }[readinessLabel] ?? 'var(--t3)'

  return (
    <div className="pr-page">
      <div className="pr-scroll">
        <div className="pr-content">

          {/* Header card */}
          <div className="pr-hero-card">
            <div className="pr-hero-top">
              <div className="pr-mode-badge">Practice Mode</div>
              <div className="pr-hero-score-wrap">
                <div className="pr-score-circle">
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
                  <div className="pr-score-inner">
                    <span className="pr-score-pct">{percentage}%</span>
                    <span className="pr-score-sub">{correct}/{total}</span>
                  </div>
                </div>

                <div className="pr-hero-stats">
                  <div className="pr-stat">
                    <span className="pr-stat-val correct">{correct}</span>
                    <span className="pr-stat-lbl">Correct</span>
                  </div>
                  <div className="pr-stat-div" />
                  <div className="pr-stat">
                    <span className="pr-stat-val wrong">{wrong}</span>
                    <span className="pr-stat-lbl">Wrong</span>
                  </div>
                  <div className="pr-stat-div" />
                  <div className="pr-stat">
                    <span className="pr-stat-val">{total}</span>
                    <span className="pr-stat-lbl">Total</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Medica Score */}
            <div className="pr-medica-row">
              <div className="pr-medica-score">
                <div className="pr-medica-label-row">
                  <span className="pr-medica-lbl">Medica Score</span>
                  <span className="pr-medica-hint">Internal readiness estimate — not an official USMLE prediction</span>
                </div>
                <div className="pr-medica-bar-row">
                  <div className="pr-medica-bar-wrap">
                    <div
                      className="pr-medica-bar"
                      style={{ width: `${medicaScore}%`, background: readinessColor }}
                    />
                  </div>
                  <span className="pr-medica-num" style={{ color: readinessColor }}>{medicaScore}</span>
                </div>
                <div className="pr-readiness-badge" style={{ color: readinessColor, borderColor: readinessColor }}>
                  {readinessLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Recommendation */}
          <div className="pr-recommendation">
            <div className="pr-rec-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L9.4 5.3L13 5.5L10.3 7.9L11.1 11.5L8 9.8L4.9 11.5L5.7 7.9L3 5.5L6.6 5.3L8 2Z" stroke="var(--blue)" strokeWidth="1.4" strokeLinejoin="round" fill="var(--blue-10)" />
              </svg>
            </div>
            <p>{recommendation}</p>
          </div>

          {/* Weak areas */}
          {weakAreas.length > 0 && (
            <div className="pr-section">
              <div className="pr-section-title">Instability Signals</div>
              <div className="pr-weak-list">
                {weakAreas.map((w, i) => (
                  <div key={i} className="pr-weak-item">
                    <span className="pr-weak-type">{w.type}</span>
                    <span className="pr-weak-name">{w.name}</span>
                    <div className="pr-weak-bar-wrap">
                      <div className="pr-weak-bar" style={{ width: `${w.percentage}%` }} />
                    </div>
                    <span className="pr-weak-pct">{w.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Subject breakdown */}
          {subjectBreakdown.length > 0 && (
            <div className="pr-section">
              <div className="pr-section-title">By Subject</div>
              <div className="pr-breakdown-list">
                {subjectBreakdown.map((s, i) => (
                  <BreakdownRow key={i} item={s} />
                ))}
              </div>
            </div>
          )}

          {/* System breakdown */}
          {systemBreakdown.length > 0 && (
            <div className="pr-section">
              <div className="pr-section-title">By System</div>
              <div className="pr-breakdown-list">
                {systemBreakdown.map((s, i) => (
                  <BreakdownRow key={i} item={s} />
                ))}
              </div>
            </div>
          )}

          {/* Flashcard generation from mistakes */}
          {wrong > 0 && session && (
            <div className="pr-section">
              <div className="pr-section-title">Reinforcement Queue</div>
              {generatedCount === null ? (
                <>
                  <p style={{ fontSize: 12.5, color: 'var(--t3)', margin: '0 0 10px' }}>
                    {wrong} missed question{wrong !== 1 ? 's' : ''} · 1–3 high-yield cards per missed question
                  </p>
                  <button type="button" className="pr-btn secondary" onClick={handleGenerateFlashcards}>
                    Generate Reinforcement Cards
                  </button>
                </>
              ) : generatedCount === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--t3)', margin: 0 }}>
                  No new cards — these concepts already exist in your deck.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 12.5, color: 'var(--green)', margin: '0 0 10px', fontWeight: 500 }}>
                    {generatedCount} reinforcement card{generatedCount !== 1 ? 's' : ''} added.
                  </p>
                  {onNavigateToFlashcards && (
                    <button type="button" className="pr-btn secondary" onClick={onNavigateToFlashcards}>
                      Review Cards
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Actions — Review Flashcards first when cards were just added */}
          <div className="pr-actions">
            {showReviewFirst && (
              <button type="button" className="pr-btn primary" onClick={onNavigateToFlashcards}>
                Review Flashcards
              </button>
            )}
            <button type="button" className={`pr-btn ${showReviewFirst ? 'secondary' : 'primary'}`} onClick={onReview}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 4h10M2 7h6M2 10h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Review Answers
            </button>
            {onViewAnalytics && (
              <button type="button" className="pr-btn secondary" onClick={onViewAnalytics}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 10V7M5 10V4M8 10V6M11 10V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                View Analytics
              </button>
            )}
            <button type="button" className="pr-btn secondary" onClick={onNewQuiz}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 2v2m0 6v2M2 7h2m6 0h2M4.22 4.22l1.42 1.42m2.72 2.72l1.42 1.42M4.22 9.78l1.42-1.42m2.72-2.72l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Create New Quiz
            </button>
            <button type="button" className="pr-btn ghost" onClick={onBackToBuilder}>
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
    <div className="pr-breakdown-row">
      <span className="pr-bd-name">{item.name}</span>
      <div className="pr-bd-bar-wrap">
        <div className="pr-bd-bar" style={{ width: `${item.percentage}%`, background: barColor }} />
      </div>
      <span className="pr-bd-stat">{item.correct}/{item.total}</span>
      <span className="pr-bd-pct" style={{ color: barColor }}>{item.percentage}%</span>
    </div>
  )
}
