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
    total, wrong, percentage,
    medicaScore, readinessLabel, recommendation,
    weakSpotReport,
    subjectBreakdown, systemBreakdown,
  } = results

  const [fcState, setFcState] = useState(null) // null | { added, skipped, total }

  const handleGenerateFlashcards = () => {
    if (!session) return
    const cards = generateFlashcardsFromCoachSession(session)
    const added = appendFlashcards(cards)
    setFcState({ added, skipped: cards.length - added, total: cards.length })
  }

  const sessionTopic = session?.config?.coachSpecificTopic
    || session?.config?.topic
    || session?.config?.subject
    || 'Coach Session'

  const sessionMeta = [
    total && `${total} question${total !== 1 ? 's' : ''}`,
    session?.config?.system && session.config.system !== 'All Systems' ? session.config.system : null,
    session?.config?.subject && session.config.subject !== 'All Subjects' ? session.config.subject : null,
  ].filter(Boolean).join(' · ')

  const barColor = (pct) =>
    pct < 50 ? 'var(--status-critical)' : pct < 70 ? 'var(--status-warn)' : 'var(--status-stable)'

  const pctColor = (pct) =>
    pct < 50 ? 'var(--status-critical)' : pct < 70 ? 'var(--status-warn)' : 'var(--status-stable)'

  return (
    <div className="cr-page">
      <div className="cr-scroll">

        {/* ── Hero header ── */}
        <div className="cr-hero">
          <div className="cr-hero-left">
            <div className="cr-hero-eyebrow">COACH MODE · SESSION COMPLETE</div>
            <h1 className="cr-hero-title">{sessionTopic}</h1>
            {sessionMeta && <p className="cr-hero-meta">{sessionMeta}</p>}
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
            <div className="cr-kpi cr-kpi--readiness">
              <span className="cr-kpi-num">{readinessLabel}</span>
              <span className="cr-kpi-lbl">READINESS</span>
            </div>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="cr-body-grid">

          {/* Left column */}
          <div className="cr-left">

            {/* Main recommendation */}
            <div className="cr-panel cr-panel--rec">
              <div className="cr-panel-label">MAIN RECOMMENDATION</div>
              <p className="cr-rec-text">{recommendation}</p>
            </div>

            {/* Weak spot diagnosis */}
            <div className="cr-panel">
              <WeakSpotDiagnosis weakSpotReport={weakSpotReport} />
            </div>

            {/* Subject + System breakdowns */}
            {subjectBreakdown && subjectBreakdown.length > 1 && (
              <div className="cr-panel cr-panel--breakdown">
                <div className="cr-bd-cols">
                  <div className="cr-bd-col">
                    <div className="cr-panel-label">SUBJECT BREAKDOWN</div>
                    {subjectBreakdown.map(item => (
                      <div key={item.name} className="cr-bd-row">
                        <span className="cr-bd-name">{item.name}</span>
                        <div className="cr-bd-bar-wrap">
                          <div className="cr-bd-bar" style={{ width: `${item.percentage}%`, background: barColor(item.percentage) }} />
                        </div>
                        <span className="cr-bd-pct" style={{ color: pctColor(item.percentage) }}>{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                  {systemBreakdown && systemBreakdown.length > 1 && (
                    <div className="cr-bd-col">
                      <div className="cr-panel-label">SYSTEM BREAKDOWN</div>
                      {systemBreakdown.map(item => (
                        <div key={item.name} className="cr-bd-row">
                          <span className="cr-bd-name">{item.name}</span>
                          <div className="cr-bd-bar-wrap">
                            <div className="cr-bd-bar" style={{ width: `${item.percentage}%`, background: barColor(item.percentage) }} />
                          </div>
                          <span className="cr-bd-pct" style={{ color: pctColor(item.percentage) }}>{item.percentage}%</span>
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

            {/* Flashcard generation */}
            {wrong > 0 && session && (
              <div className="cr-panel cr-panel--fc">
                <div className="cr-panel-label">FLASHCARD GENERATION</div>
                {fcState === null ? (
                  <>
                    <p className="cr-fc-hint">
                      {wrong} missed question{wrong !== 1 ? 's' : ''} · 1–3 high-yield cards per miss
                    </p>
                    <button type="button" className="cr-fc-gen-btn" onClick={handleGenerateFlashcards}>
                      Generate Reinforcement Items
                    </button>
                  </>
                ) : (
                  <>
                    <div className="cr-fc-stats">
                      <div className="cr-fc-stat-row">
                        <span className="cr-fc-stat-lbl">New cards created</span>
                        <span className="cr-fc-stat-val cr-fc-stat-val--new">{fcState.added}</span>
                      </div>
                      <div className="cr-fc-stat-row">
                        <span className="cr-fc-stat-lbl">Duplicates skipped</span>
                        <span className="cr-fc-stat-val">{fcState.skipped}</span>
                      </div>
                    </div>
                    {fcState.added > 0 && (
                      <div className="cr-fc-confirm">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {fcState.added} card{fcState.added !== 1 ? 's' : ''} added to your deck
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Next actions */}
            <div className="cr-panel cr-panel--actions">
              <div className="cr-panel-label">NEXT ACTIONS</div>
              <div className="cr-actions-list">
                {(fcState?.added > 0 && onNavigateToFlashcards) && (
                  <button type="button" className="cr-action-btn cr-action-btn--primary" onClick={onNavigateToFlashcards}>
                    Start Flashcard Review
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onNewQuiz}>
                  New Coach Session
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
