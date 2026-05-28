const MODE_LABELS = { practice: 'Practice Mode', coach: 'Coach Mode', exam: 'Exam Mode' }

export default function NextSessionRecommendation({ nextSession }) {
  const { mode, area, difficulty, reasoning, subject, system } = nextSession
  const repairs = subject || system || area || null

  return (
    <div className="an-card an-card--highlight">
      <div className="an-card-title">Next Best Action</div>
      <div className="an-rec-mode">{MODE_LABELS[mode] ?? mode}</div>
      {area && <div className="an-rec-area">Focus area: {area}</div>}
      <div className="an-rec-diff">Difficulty: {difficulty}</div>
      <p className="an-rec-reasoning">{reasoning}</p>
      {repairs && (
        <div className="an-rec-repair">
          <span className="an-rec-repair-lbl">Targets</span>
          <span className="an-rec-repair-val">{repairs}</span>
        </div>
      )}
    </div>
  )
}
