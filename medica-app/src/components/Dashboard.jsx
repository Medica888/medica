import { useState, useMemo } from 'react'
import { buildAnalyticsData } from '../lib/analyticsEngine'
import { getFlashcards, getFlashcardReviewEvents, getLastPracticeResults, getLastCoachResults, saveLastQuizConfig, clearLastQuizConfig } from '../lib/storage'
import { DEFAULT_CONFIG, STANDARDIZED_STEP1_BLOCK, SUBJECTS, SYSTEMS, getDifficultyDisplayLabel } from '../lib/quizTypes'
import { useSessionHistory } from '../hooks/useSessionHistory'

// ─── Constants ───────────────────────────────────────────────────────────────

const MODE_LABELS = { practice: 'Practice', coach: 'Coach', exam: 'Exam' }
const MODE_COLORS = { practice: 'green',    coach: 'blue',  exam: 'orange' }

const STEP1_BLOCK_CONFIG = {
  ...DEFAULT_CONFIG,
  mode: 'exam',
  questionCount: 20,
  subject: 'All Subjects',
  system: 'All Systems',
  topic: '',
  clinicalFocus: '',
  difficulty: 'Balanced',
  blockType: STANDARDIZED_STEP1_BLOCK,
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function isFlashcardDue(card) {
  if (card.reviewStatus === 'mastered') {
    if (!card.nextReview) return false
    return new Date(card.nextReview) <= new Date()
  }
  return true
}

function getSessionTitle(session) {
  if (session.topic && session.topic !== 'All Topics') return session.topic
  if (session.resolvedTopic) return session.resolvedTopic
  if (session.config?.topic && session.config.topic !== 'All Topics') return session.config.topic
  const sys = session.systemBreakdown?.[0]?.name
  if (sys) return sys
  const sub = session.subjectBreakdown?.[0]?.name
  if (sub) return sub
  if (session.title) return session.title
  const count = session.total ?? session.questionCount
  return count != null ? `${count} question${count !== 1 ? 's' : ''}` : 'Session'
}

function getSessionScore(session) {
  if (session.percentage != null)  return `${Math.round(session.percentage)}%`
  if (session.scorePercent != null) return `${Math.round(session.scorePercent)}%`
  if (session.medicaScore != null)  return String(session.medicaScore)
  if (session.correct != null && session.total) {
    return `${Math.round((session.correct / session.total) * 100)}%`
  }
  return null
}

function getSessionDate(session) {
  const iso = session.completedAt || session.submittedAt || session.createdAt || session.startedAt
  if (!iso) return ''
  const d    = new Date(iso)
  const now  = new Date()
  const diff = Math.floor((now - d) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return `${diff}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Build a QuizBuilder-compatible prefill config from analytics.nextSession.
 * Maps the `area` (subject/system name) to the correct field.
 */
function buildRecommendedConfig(ns) {
  const mode = ns.mode || 'coach'
  const area = ns.area || ''
  const topic = ns.topic || area
  const matchedSystem  = SYSTEMS.find(s  => s !== 'All Systems'  && s.toLowerCase() === area.toLowerCase())
  const matchedSubject = SUBJECTS.find(s => s !== 'All Subjects' && s.toLowerCase() === area.toLowerCase())
  const explicitSystem = SYSTEMS.includes(ns.system) ? ns.system : null
  const explicitSubject = SUBJECTS.includes(ns.subject) ? ns.subject : null
  return {
    ...DEFAULT_CONFIG,
    mode,
    subject:       explicitSubject || matchedSubject || 'All Subjects',
    system:        explicitSystem  || matchedSystem  || 'All Systems',
    topic:         mode === 'coach' ? (topic || '') : ((!matchedSystem && !matchedSubject && topic) ? topic : ''),
    difficulty:    ns.difficulty  || 'Balanced',
    questionCount: ns.questionCount || 10,
    clinicalFocus: '',
  }
}

/**
 * Build a "similar" prefill config from last saved session or most recent history.
 */
// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard({ onNavigate }) {
  const { sessions } = useSessionHistory()
  const flashcards   = useMemo(() => getFlashcards(), [])
  const flashcardReviewEvents = useMemo(() => getFlashcardReviewEvents(), [])
  const lastPractice = useMemo(() => getLastPracticeResults(), [])
  const lastCoach    = useMemo(() => getLastCoachResults(), [])
  const analytics    = useMemo(
    () => buildAnalyticsData({ sessions, lastPractice, lastCoach, flashcards, flashcardReviewEvents }),
    [sessions, lastPractice, lastCoach, flashcards, flashcardReviewEvents]
  )

  const recentSessions = useMemo(() => sessions.slice(0, 3), [sessions])

  const flashcardsDue = useMemo(
    () => flashcards.filter(isFlashcardDue).length,
    [flashcards]
  )

  const todayTasks = useMemo(() => {
    if (analytics.empty) {
      return [
        { id: 'a', text: 'Start your first block' },
        { id: 'b', text: 'Complete one Practice session' },
        { id: 'c', text: 'Review your results' },
      ]
    }
    const tasks = []
    const ns = analytics.nextSession

    // 1 — Recommended session
    if (ns?.area) {
      const label = MODE_LABELS[ns.mode] || 'Practice'
      const count = ns.questionCount || 10
      tasks.push({ id: 'rec', text: `${label}: ${ns.area} (${count} question${count !== 1 ? 's' : ''})` })
    }

    // 2 — Flashcard review
    if (flashcardsDue > 0) {
      const n = Math.min(flashcardsDue, 20)
      tasks.push({ id: 'fc', text: `Reinforce ${n} due card${n !== 1 ? 's' : ''}` })
    }

    // 3 — Weak area, deduped against the recommended session
    const allWeak = [
      ...(analytics.weaknesses?.critical || []),
      ...(analytics.weaknesses?.moderate || []),
    ]
    if (allWeak.length > 0) {
      const weakName       = allWeak[0].name
      const alreadyCovered = ns?.area && ns.area.toLowerCase() === weakName.toLowerCase()
      if (!alreadyCovered) {
        tasks.push({ id: 'weak', text: `Coach weak area: ${weakName}` })
      } else if (tasks.length < 3) {
        tasks.push({ id: 'practice', text: 'Practice incorrect questions' })
      }
    } else if (tasks.length < 3) {
      tasks.push({ id: 'practice', text: 'Practice incorrect questions' })
    }

    return tasks.slice(0, 3)
  }, [analytics, flashcardsDue])

  const [checkedTasks, setCheckedTasks] = useState({})
  const toggleTask = (id) => setCheckedTasks(prev => ({ ...prev, [id]: !prev[id] }))

  const hasData = !analytics.empty
  const ns      = analytics.nextSession

  function startRecommended() {
    if (ns) saveLastQuizConfig(buildRecommendedConfig(ns))
    onNavigate('create-quiz')
  }

  function startCustomQuiz() {
    clearLastQuizConfig()
    onNavigate('create-quiz')
  }

  function startStep1Block() {
    saveLastQuizConfig(STEP1_BLOCK_CONFIG)
    onNavigate('create-quiz')
  }

  return (
    <div className="db-scroll">
      <div className="db-content">

        {/* 1 — Welcome Header */}
        <section className="db-welcome">
          <div className="db-welcome-text">
            <div className="db-welcome-brand">
              <IconMedicaShield />
              <span className="db-eyebrow">MEDICA · STEP 1 MASTERY ENGINE</span>
            </div>
            <h1 className="db-heading">{getGreeting()} — let's get to work.</h1>
            <p className="db-sub">
              {hasData
                ? `${sessions.length} session${sessions.length !== 1 ? 's' : ''} completed. Keep the momentum going.`
                : 'Your personalized Step 1 study hub. Start a session to unlock your Medica Score and insights.'}
            </p>
          </div>
        </section>

        {/* 2 — Recommended / First Session Hero */}
        {/* key differentiates the two branches so React fully remounts instead of
            reconciling shared <section>/<button> positions when hasData flips async
            (e.g. useSessionHistory resolving) - without it, a click that starts
            while this section is mid-transition can fire the post-update handler
            (startRecommended) even though it read the pre-update button. */}
        {hasData && ns ? (
          <section className="db-hero" key="recommended">
            <div className="db-hero-left">
              <div className="db-hero-eyebrow">Recommended Next Session</div>
              <div className="db-hero-badges">
                <span className={`db-mode-badge db-mode-badge--${MODE_COLORS[ns.mode] || 'blue'}`}>
                  {MODE_LABELS[ns.mode] || ns.mode}
                </span>
                {ns.difficulty && (
                  <span className="db-diff-pill">{getDifficultyDisplayLabel(ns.difficulty)}</span>
                )}
                <span className="db-diff-pill">{ns.questionCount || 10} question{(ns.questionCount || 10) !== 1 ? 's' : ''}</span>
              </div>
              <h2 className="db-hero-topic">{ns.area || 'High-yield Step 1 review'}</h2>
              <p className="db-hero-why">
                {ns.reasoning || 'Recommended based on your recent performance.'}
              </p>
            </div>
            <div className="db-hero-actions">
              <button type="button" className="db-btn db-btn--primary" onClick={startRecommended}>
                Start Recommended Session
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M5 2L10 6.5L5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="db-btn db-btn--ghost" onClick={startCustomQuiz}>
                Build Custom Set
              </button>
              <button type="button" className="db-btn db-btn--ghost" onClick={startStep1Block}>
                Step 1 Block
              </button>
            </div>
          </section>
        ) : (
          <section className="db-hero db-hero--first" key="first-session">
            <div className="db-hero-left">
              <div className="db-hero-eyebrow">Ready to begin?</div>
              <h2 className="db-hero-topic">Start your first Step 1 session</h2>
              <p className="db-hero-why">
                Complete a short Practice session to unlock recommendations, analytics, and your Medica Score.
              </p>
            </div>
            <div className="db-hero-actions">
              <button type="button" className="db-btn db-btn--primary" onClick={startCustomQuiz}>
                Start First Session
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                  <path d="M5 2L10 6.5L5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <button type="button" className="db-btn db-btn--ghost" onClick={() => onNavigate('qbank')}>
                Browse QBank
              </button>
              <button type="button" className="db-btn db-btn--ghost" onClick={startStep1Block}>
                Step 1 Block
              </button>
            </div>
          </section>
        )}

        {/* 3 — Study Snapshot */}
        <section className="db-section">
          <h2 className="db-section-title">Study Snapshot</h2>
          <div className="db-snap-grid">
            <SnapCard
              value={hasData && analytics.overview?.latestMedicaScore != null
                ? analytics.overview.latestMedicaScore
                : '—'}
              label="Medica Score"
              accent="blue"
            />
            <SnapCard
              value={hasData && analytics.overview?.overallAccuracy != null
                ? `${Math.round(analytics.overview.overallAccuracy)}%`
                : '—'}
              label="Average Accuracy"
              accent="green"
            />
            <SnapCard
              value={flashcards.length > 0 ? flashcardsDue : '—'}
              label="Cards Due"
              accent="orange"
            />
            <SnapCard
              value={sessions.length}
              label="Sessions Completed"
              accent="purple"
            />
          </div>
          <p className="db-snap-note">
            {sessions.length === 0
              ? 'Complete your first session to unlock personalized progress metrics.'
              : 'Medica Score is an internal readiness estimate, not an official USMLE prediction.'}
          </p>
        </section>

        {/* 4 — Quick Actions */}
        {hasData && (
          <section className="db-section">
            <h2 className="db-section-title">Quick Actions</h2>
            <div className="db-qa-grid">
              <QuickAction
                icon={<Step1BlockIcon />}
                label="Step 1 Block"
                desc="Timed 20-question benchmark"
                color="blue"
                onClick={startStep1Block}
              />
              <QuickAction
                icon={<QBankIcon />}
                label="Browse QBank"
                desc="Choose reviewed questions from the bank"
                color="purple"
                onClick={() => onNavigate('qbank')}
              />
              <QuickAction
                icon={<FlashcardsIcon />}
                label="Reinforce Cards"
                desc={
                  flashcardsDue > 0
                    ? `${flashcardsDue} card${flashcardsDue !== 1 ? 's' : ''} due for reinforcement`
                    : flashcards.length > 0 ? 'All cards up to date' : 'Start clinical reinforcement'
                }
                badge={flashcardsDue > 0 ? flashcardsDue : null}
                color="orange"
                onClick={() => onNavigate('flashcards')}
              />
              <QuickAction
                icon={<AnalyticsIcon />}
                label="View Analytics"
                desc="Track performance and find weak areas"
                color="green"
                onClick={() => onNavigate('analytics')}
              />
            </div>
          </section>
        )}

        {/* 5 — Next Focus (weakness card) */}
        {hasData && (
          <FocusCard analytics={analytics} onNavigate={onNavigate} />
        )}

        {/* 6 — Lower 2-column grid: Recent Sessions + Today's Plan */}
        <div className="db-lower-grid">

          <section className="db-section">
            <div className="db-section-hdr">
              <h2 className="db-section-title">Recent Sessions</h2>
              {sessions.length > 3 && (
                <button type="button" className="db-link" onClick={() => onNavigate('analytics')}>
                  View All
                </button>
              )}
            </div>
            {recentSessions.length === 0 ? (
              <div className="db-empty">
                <div className="db-empty-icon">
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                    <rect x="4" y="8" width="24" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" opacity=".35"/>
                    <rect x="7" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.4" opacity=".2"/>
                    <path d="M10 17h12M10 20.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".4"/>
                  </svg>
                </div>
                <p>No sessions yet. Start one above to see your history.</p>
              </div>
            ) : (
              <div className="db-recent-list">
                {recentSessions.map((s, i) => {
                  const score = getSessionScore(s)
                  const date  = getSessionDate(s)
                  const title = getSessionTitle(s)
                  return (
                    <div key={i} className="db-session-row">
                      <div className="db-session-left">
                        <span className={`db-mode-badge db-mode-badge--${MODE_COLORS[s.mode] || 'blue'}`}>
                          {MODE_LABELS[s.mode] || 'Session'}
                        </span>
                        <div className="db-session-meta">
                          <span className="db-session-topic">{title}</span>
                          {date && <span className="db-session-date">{date}</span>}
                        </div>
                      </div>
                      {score && (
                        <span className="db-session-score">{score}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="db-section">
            <h2 className="db-section-title">Today's Plan</h2>
            <div className="db-plan-list">
              {todayTasks.map(task => (
                <button
                  key={task.id}
                  type="button"
                  className={`db-plan-item${checkedTasks[task.id] ? ' db-plan-item--done' : ''}`}
                  onClick={() => toggleTask(task.id)}
                  aria-pressed={!!checkedTasks[task.id]}
                >
                  <span className={`db-plan-check${checkedTasks[task.id] ? ' db-plan-check--done' : ''}`}
                    aria-hidden="true">
                    {checkedTasks[task.id] && (
                      <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                        <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="db-plan-text">{task.text}</span>
                </button>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FocusCard({ analytics, onNavigate }) {
  const allWeak = [
    ...(analytics.weaknesses?.critical || []),
    ...(analytics.weaknesses?.moderate || []),
  ]
  const topWeak = allWeak[0]

  function startCoach() {
    saveLastQuizConfig(buildRecommendedConfig({ mode: 'coach', area: topWeak.name, difficulty: 'Balanced' }))
    onNavigate('create-quiz')
  }

  return (
    <section className="db-section">
      <h2 className="db-section-title">Next Focus</h2>
      {topWeak ? (
        <div className="db-focus-card">
          <div className="db-focus-body">
            <div className="db-focus-label">Weakest area detected</div>
            <div className="db-focus-area">{topWeak.name}</div>
            {(topWeak.accuracy != null || (topWeak.missed != null && topWeak.missed > 0)) && (
              <div className="db-focus-stats">
                {topWeak.accuracy != null && (
                  <span className="db-focus-stat">
                    <span className="db-focus-stat-val db-focus-stat-val--warn">
                      {Math.round(topWeak.accuracy)}%
                    </span>{' '}accuracy
                  </span>
                )}
                {topWeak.missed != null && topWeak.missed > 0 && (
                  <span className="db-focus-stat">
                    <span className="db-focus-stat-val">{topWeak.missed}</span>{' '}missed
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="db-btn db-btn--primary"
            onClick={startCoach}
            aria-label={`Start Coach Session for ${topWeak.name}`}
          >
            Start Coach Session
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
              <path d="M5 2L10 6.5L5 11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="db-focus-empty">
          <span className="db-focus-empty-icon" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <circle cx="13" cy="13" r="10" stroke="currentColor" strokeWidth="1.5" opacity=".3"/>
              <path d="M13 8v5M13 16.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".4"/>
            </svg>
          </span>
          <div>
            <p className="db-focus-empty-title">No major weak area detected yet.</p>
            <p className="db-focus-empty-sub">Complete more sessions to unlock stronger recommendations.</p>
          </div>
        </div>
      )}
    </section>
  )
}

function QuickAction({ icon, label, desc, badge, color, onClick }) {
  return (
    <button type="button" className={`db-qa-card db-qa-card--${color}`} onClick={onClick}>
      <div className="db-qa-top">
        <div className="db-qa-icon">{icon}</div>
        {badge != null && <span className="db-qa-badge">{badge > 99 ? '99+' : badge}</span>}
      </div>
      <div className="db-qa-label">{label}</div>
      <div className="db-qa-desc">{desc}</div>
    </button>
  )
}

function SnapCard({ value, label, accent }) {
  return (
    <div className={`db-snap-card db-snap-card--${accent}`}>
      <div className="db-snap-value">{value}</div>
      <div className="db-snap-label">{label}</div>
    </div>
  )
}

function IconMedicaShield() {
  return (
    <svg width="18" height="20" viewBox="0 0 28 32" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="db-shield-lg" x1="14" y1="0" x2="14" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2A82E0" />
          <stop offset="1" stopColor="#1250A0" />
        </linearGradient>
      </defs>
      <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" fill="url(#db-shield-lg)" />
      <path d="M14 .5L27.5 5.2V16C27.5 24.5 21.5 30.2 14 32.5C6.5 30.2 .5 24.5 .5 16V5.2L14 .5Z" stroke="rgba(255,255,255,.15)" strokeWidth=".6" fill="none" />
      <rect x="13.2" y="9.5" width="1.6" height="14" rx=".8" fill="white" />
      <path d="M14 9.5C14 9.5 11.2 7.2 11.8 4.8C12.2 3.2 14 1.8 14 1.8s1.8 1.4 2.2 3c.6 2.4-2.2 4.7-2.2 4.7Z" fill="white" />
      <path d="M10 13.5c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
      <path d="M10 18c0 0 1.8 1.8 4 0 2.2 1.8 4 0 4 0" stroke="white" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function QBankIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="10" width="16" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="16" width="10" height="3" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function Step1BlockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 8h6M8 11h6M8 14h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M15.5 4.5v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />
    </svg>
  )
}

function FlashcardsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 4H15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45" />
      <path d="M9 11H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function AnalyticsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path d="M4 16L8 10L11 13L15 7L18 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 19H18" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.35" />
    </svg>
  )
}
