import { useState } from 'react'
import { useMasteryAdaptivePreview } from '../../hooks/useMastery'
import { useAuthState } from '../../hooks/useAuthState'
import {
  DEFAULT_CONFIG,
  STANDARDIZED_40Q_BLOCK,
  normalizeQuizConfigForGeneration,
} from '../../lib/quizTypes'
import { saveLastQuizConfig, getLastQuizConfig } from '../../lib/storage'
import { buildTopicMetadata } from '../../lib/topicIntelligence'
import { normalizeGenerationConfig } from '../../lib/generationScope'
import { getDifficultyAvailability } from '../../lib/mockQuestions'
import ModeSelector from './ModeSelector'
import SubjectSelector from './SubjectSelector'
import SystemSelector from './SystemSelector'
import TopicSelector from './TopicSelector'
import QuestionCountSelector from './QuestionCountSelector'
import DifficultySelector from './DifficultySelector'
import ClinicalFocusInput from './ClinicalFocusInput'
import LivePreview from '../layout/LivePreview'

const LOCKED_CONFIG = {
  mode:          'exam',
  questionCount: 40,
  subject:       'All',
  system:        'All',
  topic:         '',
  clinicalFocus: '',
  difficulty:    'Balanced',
  blockType:     STANDARDIZED_40Q_BLOCK,
}

/** @param {{ onStart: (config: import('../../lib/quizTypes').QuizConfig) => void, generationError?: string|null, initialMode?: 'exam'|'practice'|'coach'|null }} props */
export default function QuizBuilder({ onStart, generationError = null, initialMode = null }) {
  const authState = useAuthState()
  const [config, setConfig] = useState(() => {
    const saved = getLastQuizConfig()
    const restored = saved ? { ...DEFAULT_CONFIG, ...saved } : { ...DEFAULT_CONFIG }
    const normalized = {
      ...restored,
      system: restored.system === 'Multisystem' ? 'All Systems' : restored.system,
    }
    return initialMode ? { ...normalized, mode: initialMode } : normalized
  })
  const [saved, setSaved]               = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError]               = useState(generationError)

  const isStandardized = config.blockType === STANDARDIZED_40Q_BLOCK
  const difficultyAvailability = isStandardized ? null : getDifficultyAvailability(config)
  const showDifficultyWarning = Boolean(difficultyAvailability?.requiresBackend)

  // Adaptive preview — shown only when backend+auth, non-standardized, global scope
  const isGlobalScope = !config.topic && !config.clinicalFocus
  const showAdaptive  = authState.isAuthenticated && !isStandardized && isGlobalScope
  const adaptive      = useMasteryAdaptivePreview()

  const update = (key, val) => {
    if (isStandardized) return
    setConfig(c => {
      const next = { ...c, [key]: val }
      // coachSpecificTopic removed — topic field is now shared across all modes
      return next
    })
    setSaved(false)
    setError(null)
  }

  const handleGenerate = () => {
    if (isGenerating) return
    setIsGenerating(true)
    setError(null)
    try {
      const effectiveConfig = normalizeQuizConfigForGeneration(isStandardized
        ? { ...config, ...LOCKED_CONFIG }
        : config)
      const base = normalizeGenerationConfig({
        ...effectiveConfig,
        topic:         effectiveConfig.topic.trim(),
        clinicalFocus: effectiveConfig.clinicalFocus.trim(),
        createdAt:     new Date().toISOString(),
      })
      const topicMetadata = buildTopicMetadata(base)
      const final = {
        ...base,
        rawTopic:      topicMetadata.rawTopic,
        canonicalTopic: topicMetadata.canonicalTopic,
        topicSlug:     topicMetadata.topicSlug,
        topicSource:   topicMetadata.topicSource,
        topicMetadata,
      }
      saveLastQuizConfig(final)
      setSaved(true)
      if (onStart) {
        onStart(final)
        // Component unmounts — no state reset needed
      } else {
        // Dev / demo mode: no navigation, reset after delay
        setIsGenerating(false)
        setTimeout(() => setSaved(false), 5000)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setIsGenerating(false)
    }
  }

  return (
    <div className="qb-page">
      <div className="qb-inner">

        {/* Page header */}
        <div className="qb-page-hdr">
          <div className="qb-badge">
            <div className="qb-badge-dot" aria-hidden="true" />
            USMLE Step 1 · Quiz Generator
          </div>
          <h1 className="qb-title">Generate Your Personalized Step&nbsp;1 Assessment</h1>
          <p className="qb-subtitle">
            Create a clinically focused quiz for Exam, Practice, or Coach Mode.
          </p>
        </div>

        {/* Two-column layout */}
        <div className="qb-layout">

          {/* Left: form card */}
          <div className="qb-card">

            <div className="qb-card-sec-hdr">Quiz Mode</div>
            <ModeSelector value={config.mode} onChange={v => update('mode', v)} />

            {isStandardized ? (
              <div className="qb-locked-panel" role="note">
                <svg className="qb-locked-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <rect x="3" y="6" width="8" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M5 6V4.5a2 2 0 0 1 4 0V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <div>
                  <div className="qb-locked-title">Standardized 40-Question Block</div>
                  <div className="qb-locked-desc">
                    Subjects, systems, topics, difficulty, and question count are locked for fair comparison.
                  </div>
                  <div className="qb-locked-pills">
                    <span className="qb-locked-pill">Exam Mode</span>
                    <span className="qb-locked-pill">40 Questions</span>
                    <span className="qb-locked-pill">All Subjects</span>
                    <span className="qb-locked-pill">All Systems</span>
                    <span className="qb-locked-pill">Standardized Difficulty</span>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="qb-card-sec-hdr">Subject &amp; System</div>
                <SubjectSelector value={config.subject} onChange={v => update('subject', v)} />
                <SystemSelector value={config.system} onChange={v => update('system', v)} />

                <div className="qb-card-sec-hdr">Topic, Questions &amp; Difficulty</div>
                <TopicSelector value={config.topic} onChange={v => update('topic', v)} />
                <QuestionCountSelector
                  value={config.questionCount}
                  onChange={v => update('questionCount', v)}
                  mode={config.mode}
                />
                <DifficultySelector
                  value={config.difficulty}
                  onChange={v => update('difficulty', v)}
                />
                {showDifficultyWarning && (
                  <div className="qb-difficulty-warning" role="note">
                    <div className="qb-difficulty-warning-title">Backend AI required for this difficulty</div>
                    <div className="qb-difficulty-warning-copy">
                      Local fallback has {difficultyAvailability.available}/{difficultyAvailability.target} target {config.difficulty} question{difficultyAvailability.available === 1 ? '' : 's'}; {config.questionCount} requested.
                    </div>
                  </div>
                )}

                <div className="qb-card-sec-hdr">Focus &amp; Context</div>
                <ClinicalFocusInput
                  value={config.clinicalFocus}
                  onChange={v => update('clinicalFocus', v)}
                />
              </>
            )}

            {/* Adaptive exam preview */}
            {showAdaptive && !adaptive.loading && adaptive.data && (
              <AdaptiveExamPreview data={adaptive.data} />
            )}

            {/* Generate */}
            <div className="qb-gen-area">
              <button
                type="button"
                className={`qb-gen-btn${saved ? ' saved' : ''}${isGenerating ? ' generating' : ''}`}
                onClick={handleGenerate}
                disabled={isGenerating}
                aria-busy={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <svg className="qb-gen-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,.3)" strokeWidth="2" />
                      <path d="M8 2a6 6 0 0 1 6 6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Preparing Quiz…
                  </>
                ) : saved ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8L6.5 11.5L13 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Configuration Saved
                  </>
                ) : (
                  <>
                    Generate Quiz
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M3 8h10M9.5 4L13 8l-3.5 4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </>
                )}
              </button>

              {error && (
                <div className="qb-error-msg" role="alert">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                    <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6.5 4v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    <circle cx="6.5" cy="9.5" r=".75" fill="currentColor" />
                  </svg>
                  {error}
                </div>
              )}

              {saved && !isGenerating && (
                <div className="qb-save-msg" role="status" aria-live="polite">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M4 6l1.5 1.5L8 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Configuration saved. Launching your session…
                </div>
              )}

              <div className="qb-gen-trust">
                ✦ Adaptive USMLE-style questions · Built for mastery
              </div>
            </div>
          </div>

          {/* Right: live preview */}
          <LivePreview config={config} />
        </div>
      </div>
    </div>
  )
}

// ── Adaptive Exam Preview sub-component ───────────────────────────────────────

function AdaptiveExamPreview({ data }) {
  if (!data) return null
  const { enabled, strategy, weakConcepts = [], targetConcepts = [] } = data

  return (
    <div className={`qb-adaptive${enabled ? ' qb-adaptive--on' : ' qb-adaptive--off'}`}>
      <div className="qb-adaptive-hdr">
        <span className="qb-adaptive-badge">
          {strategy === 'adaptive' ? 'Adaptive' : 'Standard'}
        </span>
        <span className="qb-adaptive-label">
          {enabled
            ? `Targeting ${targetConcepts.length} weak concept${targetConcepts.length !== 1 ? 's' : ''}`
            : 'Not enough session history for adaptive mode'}
        </span>
      </div>
      {enabled && weakConcepts.length > 0 && (
        <div className="qb-adaptive-chips">
          {weakConcepts.slice(0, 6).map(c => (
            <span key={c} className="qb-adaptive-chip">{c}</span>
          ))}
          {weakConcepts.length > 6 && (
            <span className="qb-adaptive-chip qb-adaptive-chip--dim">
              +{weakConcepts.length - 6} more
            </span>
          )}
        </div>
      )}
    </div>
  )
}
