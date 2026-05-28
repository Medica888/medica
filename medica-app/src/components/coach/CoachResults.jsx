import { useState } from 'react'
import WeakSpotDiagnosis from './WeakSpotDiagnosis'
import { generateFlashcardsFromCoachSession } from '../../lib/flashcardGenerator'
import { appendFlashcards } from '../../lib/storage'

/**
 * @param {{
 *   results: import('../../lib/coachScoring').CoachResults
 *   session: import('../../lib/quizTypes').QuizSession
 *   onNewQuiz: () => void
 *   onBackToBuilder: () => void
 *   onViewAnalytics?: () => void
 *   onNavigateToFlashcards?: () => void
 * }} props
 */
export default function CoachResults({ results, session, onNewQuiz, onBackToBuilder, onViewAnalytics, onNavigateToFlashcards }) {
  const {
    total, correct, wrong, percentage,
    medicaScore, readinessLabel, recommendation,
    weakSpotReport,
    subjectBreakdown, systemBreakdown,
  } = results

  const [generatedCount, setGeneratedCount] = useState(null)

  const handleGenerateFlashcards = () => {
    if (!session) return
    const cards = generateFlashcardsFromCoachSession(session)
    const added = appendFlashcards(cards)
    setGeneratedCount(added)
  }

  const hasFlashcardsAdded = generatedCount !== null && generatedCount > 0
  const showReviewFirst    = hasFlashcardsAdded && onNavigateToFlashcards

  return (
    <div className="cr-page">
      <div className="cr-scroll">
      <div className="cr-card">
        {/* Header */}
        <div className="cr-hdr">
          <div className="cr-badge">Coach Mode · Session Complete</div>
          <h2 className="cr-title">Performance Diagnosis</h2>
        </div>

        {/* Score row */}
        <div className="cr-score-row">
          <div className="cr-score-block">
            <span className="cr-score-num">{percentage}%</span>
            <span className="cr-score-lbl">Accuracy</span>
          </div>
          <div className="cr-score-block">
            <span className="cr-score-num">{correct}/{total}</span>
            <span className="cr-score-lbl">Correct</span>
          </div>
          <div className="cr-score-block">
            <span className="cr-score-num medica">{medicaScore}</span>
            <span className="cr-score-lbl">Medica Score</span>
          </div>
          <div className="cr-score-block">
            <span className="cr-score-num readiness">{readinessLabel}</span>
            <span className="cr-score-lbl">Readiness</span>
          </div>
        </div>

        {/* Recommendation */}
        <div className="cr-recommendation">{recommendation}</div>

        {/* Weak spot diagnosis */}
        <WeakSpotDiagnosis weakSpotReport={weakSpotReport} />

        {/* Subject breakdown */}
        {subjectBreakdown && subjectBreakdown.length > 1 && (
          <div className="cr-breakdown">
            <div className="cr-section-hdr">By Subject</div>
            <div className="cr-bd-list">
              {subjectBreakdown.map(item => (
                <div key={item.name} className="cr-bd-row">
                  <span className="cr-bd-name">{item.name}</span>
                  <div className="cr-bd-bar-wrap">
                    <div
                      className="cr-bd-bar"
                      style={{
                        width: `${item.percentage}%`,
                        background: item.percentage < 50 ? 'var(--red)' : item.percentage < 70 ? 'var(--yellow, #f59e0b)' : 'var(--green)',
                      }}
                    />
                  </div>
                  <span className="cr-bd-stat">{item.correct}/{item.total}</span>
                  <span
                    className="cr-bd-pct"
                    style={{ color: item.percentage < 50 ? 'var(--red)' : item.percentage < 70 ? 'var(--yellow, #f59e0b)' : 'var(--green)' }}
                  >
                    {item.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* System breakdown */}
        {systemBreakdown && systemBreakdown.length > 1 && (
          <div className="cr-breakdown">
            <div className="cr-section-hdr">By System</div>
            <div className="cr-bd-list">
              {systemBreakdown.map(item => (
                <div key={item.name} className="cr-bd-row">
                  <span className="cr-bd-name">{item.name}</span>
                  <div className="cr-bd-bar-wrap">
                    <div
                      className="cr-bd-bar"
                      style={{
                        width: `${item.percentage}%`,
                        background: item.percentage < 50 ? 'var(--red)' : item.percentage < 70 ? 'var(--yellow, #f59e0b)' : 'var(--green)',
                      }}
                    />
                  </div>
                  <span className="cr-bd-stat">{item.correct}/{item.total}</span>
                  <span
                    className="cr-bd-pct"
                    style={{ color: item.percentage < 50 ? 'var(--red)' : item.percentage < 70 ? 'var(--yellow, #f59e0b)' : 'var(--green)' }}
                  >
                    {item.percentage}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Flashcard generation */}
        {wrong > 0 && session && (
          <div className="cr-flashcards">
            <div className="cr-section-hdr">Reinforcement Queue</div>
            {generatedCount === null ? (
              <>
                <p className="cr-fc-desc">
                  {wrong} missed question{wrong !== 1 ? 's' : ''} · 1–3 high-yield cards per missed question
                </p>
                <button type="button" className="cr-btn primary" onClick={handleGenerateFlashcards}>
                  Generate Reinforcement Cards
                </button>
              </>
            ) : generatedCount === 0 ? (
              <p className="cr-fc-result--none">
                No new cards — these concepts already exist in your deck.
              </p>
            ) : (
              <>
                <p className="cr-fc-result--added">
                  {generatedCount} reinforcement card{generatedCount !== 1 ? 's' : ''} added.
                </p>
                {onNavigateToFlashcards && (
                  <button type="button" className="cr-btn secondary" onClick={onNavigateToFlashcards}>
                    Review Cards
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <p className="cr-disclaimer">
          Medica Score is an internal learning estimate and is not an official USMLE score prediction.
        </p>

        {/* Actions — Review Flashcards first when cards were just added */}
        <div className="cr-actions">
          {showReviewFirst && (
            <button type="button" className="cr-btn primary" onClick={onNavigateToFlashcards}>
              Review Flashcards
            </button>
          )}
          <button type="button" className={`cr-btn ${showReviewFirst ? 'secondary' : 'primary'}`} onClick={onNewQuiz}>
            New Quiz
          </button>
          {onViewAnalytics && (
            <button type="button" className="cr-btn secondary" onClick={onViewAnalytics}>
              View Analytics
            </button>
          )}
          <button type="button" className="cr-btn secondary" onClick={onBackToBuilder}>
            Back to Builder
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
