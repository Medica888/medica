import { describe, it, expect } from 'vitest'
import { isFlashcardDue } from './flashcardDisplay'

const past   = new Date(Date.now() - 86_400_000).toISOString() // yesterday
const future = new Date(Date.now() + 86_400_000).toISOString() // tomorrow

describe('isFlashcardDue — new / no schedule', () => {
  it('new card with no nextReview is due', () => {
    expect(isFlashcardDue({ reviewStatus: 'new' })).toBe(true)
  })

  it('learning card with no nextReview is due', () => {
    expect(isFlashcardDue({ reviewStatus: 'learning' })).toBe(true)
  })

  it('mastered card with no nextReview is NOT due (backward compat)', () => {
    expect(isFlashcardDue({ reviewStatus: 'mastered' })).toBe(false)
  })
})

describe('isFlashcardDue — with nextReview', () => {
  it('past nextReview → due regardless of status', () => {
    expect(isFlashcardDue({ reviewStatus: 'learning', nextReview: past })).toBe(true)
    expect(isFlashcardDue({ reviewStatus: 'mastered', nextReview: past })).toBe(true)
  })

  it('future nextReview → NOT due regardless of status', () => {
    expect(isFlashcardDue({ reviewStatus: 'learning', nextReview: future })).toBe(false)
    expect(isFlashcardDue({ reviewStatus: 'mastered', nextReview: future })).toBe(false)
  })
})

describe('isFlashcardDue — invalid nextReview date', () => {
  it('non-mastered card with invalid date is due', () => {
    expect(isFlashcardDue({ reviewStatus: 'learning', nextReview: 'not-a-date' })).toBe(true)
  })

  it('mastered card with invalid date is NOT due', () => {
    expect(isFlashcardDue({ reviewStatus: 'mastered', nextReview: 'not-a-date' })).toBe(false)
  })
})
