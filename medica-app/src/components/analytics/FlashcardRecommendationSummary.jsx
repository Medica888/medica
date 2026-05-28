export default function FlashcardRecommendationSummary({ flashcardSummary }) {
  const { topics, totalMissed } = flashcardSummary

  return (
    <div className="an-card">
      <div className="an-card-title">Retention Queue</div>
      <p className="an-card-sub">
        Concepts requiring memory reinforcement · {totalMissed} missed question{totalMissed !== 1 ? 's' : ''}
      </p>
      <div className="an-fc-list">
        {topics.slice(0, 8).map(t => (
          <div key={t.topic} className="an-fc-row">
            <span className="an-fc-topic">{t.topic}</span>
            <span className="an-fc-count">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
