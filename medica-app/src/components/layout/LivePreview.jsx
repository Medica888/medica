import { MODE_FEATURES, getSystemLabel } from '../../lib/quizTypes'

const MODE_NOTES = {
  exam:     (n) => `This ${n}-question timed block simulates board-style USMLE testing conditions.`,
  practice: (n) => `This ${n}-question set gives immediate feedback and high-yield explanations after each answer.`,
  coach:    (n) => `This ${n}-question coaching session includes deep teaching, weak spot repair, and personalized flashcards.`,
}

/** @param {{ config: import('../../lib/quizTypes').QuizConfig }} props */
export default function LivePreview({ config }) {
  const { mode, subject, system, topic, questionCount, difficulty } = config
  const timed    = mode === 'exam'
  const features = MODE_FEATURES[mode] || []

  const modeLabel = { exam: 'Exam', practice: 'Practice', coach: 'Coach' }[mode]
  const timeLabel = timed ? `${questionCount} min` : 'No time limit'
  const noteText  = (MODE_NOTES[mode] ?? MODE_NOTES.exam)(questionCount)

  return (
    <aside className="lp-panel" aria-label="Quiz configuration preview">
      <div className="lp-hdr">
        <div className="lp-live-dot" aria-hidden="true" />
        <span className="lp-hdr-title">Live Preview</span>
        <span className="lp-hdr-sub">updates as you configure</span>
      </div>

      <div className="lp-body">
        <div className={`lp-mode-badge ${mode}`}>{modeLabel} Mode</div>

        <div className="lp-rows">
          <Row label="Subject"    value={subject || 'All Subjects'} />
          <Row label="System"     value={getSystemLabel(system) || 'All Systems'} />
          <Row label="Topic" value={topic || 'Auto-selected (high-yield)'} />
          <Row label="Questions"  value={`${questionCount} questions`} />
          <Row label="Time"       value={timeLabel} />
          <Row label="Difficulty" value={difficulty} />
        </div>

        <div className="lp-divider" />

        <div className="lp-features-title">Included Features</div>
        <div className="lp-features">
          {features.map(f => (
            <div key={f} className="lp-feat">
              <svg className="lp-feat-check" width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                <circle cx="6.5" cy="6.5" r="6" fill="rgba(15,173,111,.13)" />
                <path d="M4 6.5L5.7 8.2L9 4.8" stroke="#0FAD6F" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {f}
            </div>
          ))}
        </div>

        <div className="lp-note">{noteText}</div>
      </div>
    </aside>
  )
}

function Row({ label, value }) {
  return (
    <div className="lp-row">
      <span className="lp-lbl">{label}</span>
      <span className="lp-val">{value}</span>
    </div>
  )
}
