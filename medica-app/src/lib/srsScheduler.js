/**
 * Medica SRS — interval-based spaced repetition scheduler.
 *
 * Pure function: no side effects, no storage reads. Takes the current card
 * state and the user's ease rating and returns the next scheduling values.
 *
 * Algorithm:
 *   again  → interval=0 (due immediately), status=learning
 *   hard   → interval=max(1, round(prev*1.2)), status=learning
 *   good   → interval=prev===0?3:round(prev*2.5), status=mastered if count>=3 else learning
 *   easy   → interval=prev===0?7:round(prev*3.5), status=mastered
 *
 * Intervals are capped at 365 days to keep scheduling deterministic.
 * The 'again' and 'hard' ratings always demote to 'learning', even from 'mastered'.
 *
 * @param {object} card  — current card fields (interval, reviewCount, etc.)
 * @param {'again'|'hard'|'good'|'easy'} ease
 * @returns {{ reviewStatus, ease, reviewCount, interval, reviewedAt, nextReview }}
 */
const MAX_INTERVAL = 365

export function computeSRS(card, ease) {
  const currentInterval = Number.isFinite(card?.interval) ? card.interval : 0
  const currentCount    = Number.isInteger(card?.reviewCount) ? card.reviewCount : 0
  const reviewCount     = currentCount + 1
  const now             = new Date()

  let interval, reviewStatus

  switch (ease) {
    case 'again':
      interval     = 0
      reviewStatus = 'learning'
      break
    case 'hard':
      interval     = Math.min(MAX_INTERVAL, Math.max(1, Math.round(currentInterval * 1.2)))
      reviewStatus = 'learning'
      break
    case 'good':
      interval     = currentInterval === 0
        ? 3
        : Math.min(MAX_INTERVAL, Math.round(currentInterval * 2.5))
      reviewStatus = reviewCount >= 3 ? 'mastered' : 'learning'
      break
    case 'easy':
      interval     = currentInterval === 0
        ? 7
        : Math.min(MAX_INTERVAL, Math.round(currentInterval * 3.5))
      reviewStatus = 'mastered'
      break
    default:
      return null
  }

  const nextReviewDate = new Date(now)
  nextReviewDate.setDate(nextReviewDate.getDate() + interval)

  return {
    reviewStatus,
    ease,
    reviewCount,
    interval,
    reviewedAt: now.toISOString(),
    nextReview: nextReviewDate.toISOString(),
  }
}
