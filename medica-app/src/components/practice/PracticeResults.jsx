import { useState } from 'react'
import { generateFlashcardsFromPracticeMistakes } from '../../lib/flashcardGenerator'
import { appendFlashcards } from '../../lib/storage'

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
    total, wrong, percentage,
    subjectBreakdown, systemBreakdown,
    weakAreas, medicaScore, readinessLabel, recommendation,
  } = results

  const [fcState, setFcState] = useState(null)

  const handleGenerateFlashcards = () => {
    if (!session) return
    const cards = generateFlashcardsFromPracticeMistakes(session)
    const added = appendFlashcards(cards)
    setFcState({ added, skipped: cards.length - added })
  }

  const sessionTopic = session?.config?.topic
    || session?.config?.subject
    || session?.resolvedTopic
    || 'Practice Session'

  const sessionMeta = [
    total && `${total} question${total !== 1 ? 's' : ''}`,
    session?.config?.system && session.config.system !== 'All Systems' ? session.config.system : null,
    session?.config?.subject && session.config.subject !== 'All Subjects' ? session.config.subject : null,
  ].filter(Boolean).join(' · ')

  const rdColor = READINESS_COLOR[readinessLabel] ?? 'var(--t3)'
  const fcAdded = fcState?.added > 0

  return (
    <div className="cr-page">
      <div className="cr-scroll">

        {/* ── Hero header ── */}
        <div className="cr-hero">
          <div className="cr-hero-left">
            <div className="cr-hero-eyebrow">PRACTICE MODE · SESSION COMPLETE</div>
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
            <div className="cr-kpi" style={{ '--kpi-color': rdColor }}>
              <span className="cr-kpi-num" style={{ color: rdColor }}>{readinessLabel}</span>
              <span className="cr-kpi-lbl">READINESS</span>
            </div>
          </div>
        </div>

        {/* ── Two-column body ── */}
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
                <div className="cr-panel-label">INSTABILITY SIGNALS</div>
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
                    {fcAdded && (
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
                <button type="button" className="cr-action-btn cr-action-btn--primary" onClick={onReview}>
                  Review Answers
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {fcAdded && onNavigateToFlashcards && (
                  <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onNavigateToFlashcards}>
                    Start Flashcard Review
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                {onViewAnalytics && (
                  <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onViewAnalytics}>
                    View Analytics
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M3 7h8M8 4l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
                <button type="button" className="cr-action-btn cr-action-btn--ghost" onClick={onNewQuiz}>
                  New Session
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
