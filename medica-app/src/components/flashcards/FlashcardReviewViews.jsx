import { getTopicGroup } from '../../lib/flashcardTopicHelpers.js'
import { TagBadge } from './FlashcardBadges'
import {
  CARD_ANSWER_LABEL,
  CARD_PROMPT_LABEL,
  EASE_META,
  cardAnswer,
  conceptPrompt,
} from './flashcardDisplay'

export function FlashcardSessionComplete({
  reviewCards,
  reviewSummary,
  onReinforceAgain,
  onBackToLibrary,
}) {
  const weakCount = reviewSummary.again + reviewSummary.hard

  return (
    <div className="fc-page">
      <div className="fc-done-wrap">
        <div className="fc-done-card">
          <div className="fc-done-icon">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <path d="M4 13.5L10 19.5L22 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="fc-done-title">Reinforcement Complete</h2>
          <p className="fc-done-sub">You reinforced {reviewCards.length} item{reviewCards.length !== 1 ? 's' : ''}.</p>
          <div className="fc-summary-grid">
            {EASE_META.map(({ ease, label, color }) => (
              <div key={ease} className="fc-summary-cell">
                <span className="fc-summary-num" style={{ color }}>{reviewSummary[ease]}</span>
                <span className="fc-summary-lbl">{label}</span>
              </div>
            ))}
          </div>
          <p className="fc-done-rec">
            {weakCount > 0
              ? 'Reinforce unstable concepts before your next session.'
              : 'Solid session - all concepts reinforced. Return later to keep retention strong.'}
          </p>
          <div className="fc-done-actions">
            <button type="button" className="fc-action-btn primary wide" onClick={onReinforceAgain}>Reinforce Again</button>
            <button type="button" className="fc-action-btn wide" onClick={onBackToLibrary}>Back to Library</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ActiveFlashcardReview({
  card,
  flipped,
  reviewIndex,
  reviewCount,
  onExit,
  onReveal,
  onEase,
  onPrev,
  onNext,
}) {
  const canPrev = reviewIndex > 0
  const canNext = reviewIndex < reviewCount - 1
  const topicGroupLabel = getTopicGroup(card)

  return (
    <div className="fc-page">
      <div className="fc-rev-hdr">
        <button type="button" className="fc-rev-exit-btn" onClick={onExit} aria-label="Exit review">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Exit
        </button>
        <div className="fc-rev-hdr-center">
          <span className="fc-rev-progress" aria-label={`Card ${reviewIndex + 1} of ${reviewCount}`}>
            Card {reviewIndex + 1} of {reviewCount}
          </span>
          {([card.subject, card.system, topicGroupLabel].filter(Boolean).length > 0) && (
            <span className="fc-rev-topic-label">
              {[card.subject, card.system, topicGroupLabel].filter(Boolean).join(' / ')}
            </span>
          )}
        </div>
        <div className="fc-rev-hdr-spacer" />
      </div>

      <div className="fc-rev-body">
        <div className="fc-rev-bar-wrap">
          <div className="fc-rev-bar" style={{ width: `${((reviewIndex + 1) / reviewCount) * 100}%` }}/>
        </div>
        <div className="fc-rev-card-wrap">
          <div className="fc-rev-card">
            <div className="fc-rev-card-inner">
              <div className="fc-rev-card-meta">
                <TagBadge tag={card.tag}/>
                {[card.subject, card.system].filter(Boolean).map((m, i) => (
                  <span key={i} className="fc-rev-subject">{m}</span>
                ))}
              </div>
              <span className="fc-rev-card-prompt-label">{card.cardCategory || CARD_PROMPT_LABEL[card.tag] || 'High-Yield Recall'}</span>
              <p className="fc-rev-question">{conceptPrompt(card)}</p>
              {!flipped ? (
                <>
                  <div className="fc-rev-divider" />
                  <div className="fc-review-nav">
                    <button type="button" className="fc-rev-nav-btn" onClick={onPrev} disabled={!canPrev} aria-label="Previous card">{'<- Prev'}</button>
                    <button type="button" className="fc-action-btn primary" onClick={onReveal}>Reveal Mechanism</button>
                    <button type="button" className="fc-rev-nav-btn" onClick={onNext} disabled={!canNext} aria-label="Next card">{'Next ->'}</button>
                  </div>
                  <span className="fc-kbd-hint">Space to reveal / left-right to navigate</span>
                </>
              ) : (
                <>
                  <div className="fc-rev-divider"/>
                  <span className="fc-rev-card-answer-label">{CARD_ANSWER_LABEL[card.tag] || 'Core Mechanism'}</span>
                  <p className="fc-rev-answer">{cardAnswer(card)}</p>
                  {card.memoryAnchor && (
                    <div className="fc-rev-card-anchor">
                      <span className="fc-rev-card-anchor-label">Memory Anchor</span>
                      <p className="fc-rev-card-anchor-text">{card.memoryAnchor}</p>
                    </div>
                  )}
                  {card.commonTrap && (
                    <div className="fc-rev-card-trap">
                      <span className="fc-rev-card-trap-label">Common Trap</span>
                      <p className="fc-rev-card-trap-text">{card.commonTrap}</p>
                    </div>
                  )}
                  <div className="fc-ease-row">
                    {EASE_META.map(({ ease, label, hint, cls }, i) => (
                      <button key={ease} type="button" className={`fc-ease-btn fc-ease-btn--${cls}`}
                        onClick={() => onEase(ease)} aria-label={`${label}: ${hint}`}>
                        <span className="fc-ease-label">{label}</span>
                        <span className="fc-ease-hint">{hint}</span>
                        <span className="fc-ease-key">{i + 1}</span>
                      </button>
                    ))}
                  </div>
                  <div className="fc-review-nav-secondary">
                    <button type="button" className="fc-rev-nav-btn" onClick={onPrev} disabled={!canPrev} aria-label="Previous card">{'<- Prev'}</button>
                    <button type="button" className="fc-rev-nav-btn" onClick={onNext} disabled={!canNext} aria-label="Next card">{'Next ->'}</button>
                  </div>
                  <p className="fc-kbd-hint">1 Relearn / 2 Unstable / 3 Reinforced / 4 Mastered</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
