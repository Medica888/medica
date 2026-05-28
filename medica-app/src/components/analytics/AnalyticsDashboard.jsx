import { useMemo, useState } from 'react'
import { buildAnalyticsData } from '../../lib/analyticsEngine'
import MedicaScoreCard from './MedicaScoreCard'
import AccuracyOverview from './AccuracyOverview'
import SubjectBreakdown from './SubjectBreakdown'
import SystemBreakdown from './SystemBreakdown'
import TopicBreakdown from './TopicBreakdown'
import MistakeDiagnosis from './MistakeDiagnosis'
import StudyPrescription from './StudyPrescription'
import ProgressTrends from './ProgressTrends'
import NextSessionRecommendation from './NextSessionRecommendation'
import ProgressGainsChart from './ProgressGainsChart'
import BenchmarkIntelligence from './BenchmarkIntelligence'
import ClinicalReasoningPattern from './ClinicalReasoningPattern'
import FlashcardRecommendationSummary from './FlashcardRecommendationSummary'

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'breakdown',  label: 'Breakdown' },
  { id: 'insights',   label: 'Insights' },
]

export default function AnalyticsDashboard({ onNavigate }) {
  const data = useMemo(() => buildAnalyticsData(), [])
  const [activeTab, setActiveTab] = useState('overview')

  if (data.empty) {
    return (
      <div className="an-page">
        <div className="an-scroll">
          <div className="an-empty">
            <div className="an-empty-icon">📊</div>
            <div className="an-empty-title">No Session Data Yet</div>
            <p className="an-empty-body">
              Complete a Practice, Coach, or Exam session to unlock your Analytics dashboard.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const {
    sessions, overview, subjectBreakdown, systemBreakdown, topicBreakdown,
    weaknesses, mistakeDiagnosis, studyPrescription, trends, nextSession,
    sessionComparison, repeatedMistakes, repeatedPatterns, improvingTopics,
    flashcardSummary,
  } = data

  const allWeaknesses = [
    ...weaknesses.critical,
    ...weaknesses.moderate,
    ...weaknesses.mild,
  ]

  const avgPerSession = overview.totalSessions > 0
    ? Math.round(overview.totalQuestions / overview.totalSessions)
    : 0

  const qualifiedSubjects = subjectBreakdown.filter(s => s.total >= 3)
  const strongestSubject = qualifiedSubjects.length > 0
    ? qualifiedSubjects.reduce((a, b) => a.percentage >= b.percentage ? a : b)
    : null
  const weakestSubject = qualifiedSubjects.length > 1
    ? qualifiedSubjects.reduce((a, b) => a.percentage <= b.percentage ? a : b)
    : null

  function accColor(pct) {
    return pct >= 70 ? 'an-kpi-val--green' : pct >= 55 ? 'an-kpi-val--orange' : 'an-kpi-val--red'
  }

  const trajectoryLabel = sessionComparison?.available
    ? sessionComparison.deltaAccuracy > 0 ? 'Improving'
      : sessionComparison.deltaAccuracy < 0 ? 'Declining'
      : 'Stable'
    : null

  const trajectoryClass = sessionComparison?.available
    ? sessionComparison.deltaAccuracy > 0 ? 'an-delta-up'
      : sessionComparison.deltaAccuracy < 0 ? 'an-delta-down'
      : 'an-delta-neu'
    : null

  return (
    <div className="an-page">
      <div className="an-scroll">

        {/* Header */}
        <div className="an-header-modern">
          <div>
            <h2 className="an-title">Performance Analytics</h2>
            <p className="an-subtitle">
              {overview.totalSessions} session{overview.totalSessions !== 1 ? 's' : ''} · {overview.totalQuestions} questions
            </p>
          </div>
          {overview.studyStreak > 0 && (
            <div className="an-streak-badge">
              <span className="an-streak-val">{overview.studyStreak}</span>
              <span className="an-streak-lbl">day streak</span>
            </div>
          )}
        </div>

        {/* KPI bar */}
        <div className="an-kpi-row">
          <div className="an-kpi-pill">
            <span className="an-kpi-lbl">Sessions</span>
            <span className="an-kpi-val">{overview.totalSessions}</span>
          </div>
          <div className="an-kpi-pill">
            <span className="an-kpi-lbl">Questions</span>
            <span className="an-kpi-val">{overview.totalQuestions}</span>
          </div>
          <div className="an-kpi-pill">
            <span className="an-kpi-lbl">Accuracy</span>
            <span className={`an-kpi-val ${accColor(overview.overallAccuracy)}`}>
              {overview.overallAccuracy}%
            </span>
          </div>
          <div className="an-kpi-pill">
            <span className="an-kpi-lbl">Medica Score</span>
            <span className={`an-kpi-val ${accColor(overview.latestMedicaScore)}`}>
              {overview.latestMedicaScore}
            </span>
          </div>
          <div className="an-kpi-pill">
            <span className="an-kpi-lbl">Strongest</span>
            {strongestSubject
              ? <span className="an-kpi-val an-kpi-val--green an-kpi-val--small">{strongestSubject.name}</span>
              : <span className="an-kpi-val an-kpi-val--small" style={{ color: 'var(--t4)' }}>—</span>
            }
          </div>
          <div className="an-kpi-pill">
            <span className="an-kpi-lbl">Weakest</span>
            {weakestSubject
              ? <span className="an-kpi-val an-kpi-val--red an-kpi-val--small">{weakestSubject.name}</span>
              : <span className="an-kpi-val an-kpi-val--small" style={{ color: 'var(--t4)' }}>—</span>
            }
          </div>
        </div>

        {/* Tab bar */}
        <div className="an-tab-bar" role="tablist">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              className={`an-tab-btn${activeTab === t.id ? ' an-tab-btn--active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Overview ── */}
        {activeTab === 'overview' && (
          <>
            <div className="an-summary-grid">
              <MedicaScoreCard overview={overview} />
              <AccuracyOverview overview={overview} />
              <NextSessionRecommendation nextSession={nextSession} />

              {/* Study Volume */}
              <div className="an-card">
                <div className="an-card-title">Study Volume</div>
                <div className="an-vol-main">{overview.totalQuestions}</div>
                <div className="an-vol-sub">total questions answered</div>
                <div className="an-vol-row">
                  <div className="an-vol-pair">
                    <span className="an-vol-val" style={{ color: 'var(--status-stable)' }}>{overview.totalCorrect}</span>
                    <span className="an-vol-lbl">Correct</span>
                  </div>
                  <div className="an-vol-pair">
                    <span className="an-vol-val" style={{ color: 'var(--status-critical)' }}>{overview.totalQuestions - overview.totalCorrect}</span>
                    <span className="an-vol-lbl">Incorrect</span>
                  </div>
                  <div className="an-vol-pair">
                    <span className="an-vol-val">{avgPerSession}</span>
                    <span className="an-vol-lbl">Avg / Session</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Benchmark Intelligence — 40Q exam sessions only */}
            <BenchmarkIntelligence sessions={sessions} />

            {/* Focus Queue */}
            {studyPrescription.length > 0 && (
              <div className="an-section">
                <div className="an-section-label">Focus Queue</div>
                <div className="an-fq-list">
                  {studyPrescription.slice(0, 3).map((item, i) => (
                    <div key={i} className="an-fq-item">
                      <span className={`an-fq-badge an-fq-badge--${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                        {item.label}
                      </span>
                      <span className="an-fq-action">{item.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Retention Queue */}
            {flashcardSummary.topics.length > 0 && (
              <div className="an-section">
                <div className="an-section-label">Retention Queue</div>
                <FlashcardRecommendationSummary flashcardSummary={flashcardSummary} />
              </div>
            )}

            {/* Session Trajectory */}
            {sessionComparison.available && (
              <div className="an-section">
                <div className="an-section-label">Session Trajectory</div>
                <div className="an-delta-row">
                  <div className="an-delta-block">
                    <span className="an-delta-lbl">Latest</span>
                    <span className="an-delta-mode">{sessionComparison.latest.mode}</span>
                    <span className="an-delta-pct">{sessionComparison.latest.accuracy}%</span>
                  </div>
                  <div className="an-delta-arrow">
                    <span className={`an-traj-label ${trajectoryClass}`}>{trajectoryLabel}</span>
                    <span className={`an-delta-num ${trajectoryClass}`}>
                      {sessionComparison.deltaAccuracy > 0 ? '+' : ''}{sessionComparison.deltaAccuracy}%
                    </span>
                  </div>
                  <div className="an-delta-block">
                    <span className="an-delta-lbl">Previous</span>
                    <span className="an-delta-mode">{sessionComparison.previous.mode}</span>
                    <span className="an-delta-pct">{sessionComparison.previous.accuracy}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Progress trends */}
            {trends.length >= 2 && (
              <div className="an-section">
                <div className="an-section-label">Score History</div>
                <ProgressTrends trends={trends} />
              </div>
            )}

            {/* Flashcards due callout */}
            {overview.flashcardsDue > 0 && onNavigate && (
              <div className="an-fc-callout">
                <span className="an-fc-callout-text">
                  {overview.flashcardsDue} flashcard{overview.flashcardsDue !== 1 ? 's' : ''} due for review
                </span>
                <button type="button" className="an-fc-callout-btn" onClick={() => onNavigate('flashcards')}>
                  Review Now
                </button>
              </div>
            )}

            {/* Next session CTA */}
            {onNavigate && nextSession.mode && (
              <div className="an-next-cta">
                <button
                  type="button"
                  className="an-next-cta-btn"
                  onClick={() => onNavigate(nextSession.mode === 'coach' ? 'quiz' : nextSession.mode)}
                >
                  Start {nextSession.mode === 'coach' ? 'Coach' : 'Practice'} Session
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Tab: Breakdown ── */}
        {activeTab === 'breakdown' && (
          <>
            {(subjectBreakdown.length > 0 || systemBreakdown.length > 0) && (
              <div className="an-section">
                <div className="an-section-label">By Subject &amp; System</div>
                <div className="an-two-col">
                  {subjectBreakdown.length > 0 && (
                    <SubjectBreakdown
                      subjectBreakdown={subjectBreakdown.slice(0, 5)}
                      onViewAll={() => {}}
                    />
                  )}
                  {systemBreakdown.length > 0 && (
                    <SystemBreakdown
                      systemBreakdown={systemBreakdown.slice(0, 5)}
                      onViewAll={() => {}}
                    />
                  )}
                </div>
              </div>
            )}

            <div className="an-section">
              <div className="an-section-label">Topic Analysis</div>
              <div className="an-two-col">
                {topicBreakdown.length > 0 ? (
                  <TopicBreakdown
                    topicBreakdown={topicBreakdown.slice(0, 5)}
                    onViewAll={() => {}}
                  />
                ) : (
                  <div className="an-card an-soft-empty-inline">
                    <span className="an-muted">No topic data yet — complete a Coach session.</span>
                  </div>
                )}

                <div className="an-card">
                  <div className="an-card-title">Primary Instability Areas</div>
                  {allWeaknesses.length === 0 ? (
                    <p className="an-wk-empty">No weak areas detected — great work!</p>
                  ) : (
                    <div className="an-weakest-list">
                      {allWeaknesses.slice(0, 5).map((w, i) => {
                        const severity = weaknesses.critical.includes(w) ? 'critical'
                          : weaknesses.moderate.includes(w) ? 'moderate' : 'mild'
                        return (
                          <div key={i} className="an-weakest-row">
                            <span className={`an-weakest-dot an-weakest-dot--${severity}`} />
                            <span className="an-weakest-name">{w.name}</span>
                            <span className="an-weakest-pct" style={{
                              color: severity === 'critical' ? 'var(--status-critical)'
                                : severity === 'moderate' ? 'var(--status-warn)' : 'var(--blue)',
                            }}>{w.percentage}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Tab: Insights ── */}
        {activeTab === 'insights' && (
          <>
            <div className="an-section">
              <div className="an-section-label">Clinical Reasoning</div>
              <ClinicalReasoningPattern
                repeatedPatterns={repeatedPatterns}
                repeatedMistakes={repeatedMistakes}
                mistakeDiagnosis={mistakeDiagnosis}
                studyPrescription={studyPrescription}
              />
            </div>

            <div className="an-section">
              <div className="an-section-label">Mistake Intelligence</div>
              <div className="an-two-col">
                <MistakeDiagnosis mistakeDiagnosis={mistakeDiagnosis} />
                <StudyPrescription studyPrescription={studyPrescription} />
              </div>
            </div>

            {(repeatedPatterns.length > 0 || repeatedMistakes.length > 0) && (
              <div className="an-section">
                <div className="an-section-label">Retrieval Failure Patterns</div>
                <div className="an-two-col">
                  {repeatedPatterns.length > 0 && (
                    <div className="an-card">
                      <div className="an-card-title">Recurring Miss Patterns</div>
                      <div className="an-repeat-list">
                        {repeatedPatterns.slice(0, 6).map((r, i) => (
                          <div key={i} className="an-repeat-row">
                            <div className="an-repeat-meta">
                              <span className={`an-repeat-type an-repeat-type--${r.type}`}>{r.type}</span>
                              <span className="an-repeat-name">{r.name}</span>
                            </div>
                            <span className="an-repeat-count">{r.count}×</span>
                          </div>
                        ))}
                      </div>
                      <p className="an-repeat-hint">Recurring miss clusters across concepts, categories, and topics.</p>
                    </div>
                  )}

                  {repeatedMistakes.length > 0 && (
                    <div className="an-card">
                      <div className="an-card-title">Retrieval Failures</div>
                      <div className="an-repeat-list">
                        {repeatedMistakes.slice(0, 6).map((r, i) => (
                          <div key={i} className="an-repeat-row">
                            <div className="an-repeat-meta">
                              {r.subject && <span className="an-repeat-tag">{r.subject}</span>}
                              {r.system  && <span className="an-repeat-tag">{r.system}</span>}
                            </div>
                            <span className="an-repeat-count">{r.count}×</span>
                          </div>
                        ))}
                      </div>
                      <p className="an-repeat-hint">Questions missed on repeated attempts — priority for spaced review.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="an-section">
              <div className="an-section-label">Stabilizing Domains</div>
              <ProgressGainsChart items={improvingTopics} />
            </div>
          </>
        )}

        <p className="an-footer-disclaimer">
          Medica Score is an internal readiness estimate, not an official USMLE prediction.
        </p>

      </div>
    </div>
  )
}
