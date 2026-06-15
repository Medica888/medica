import { describe, it, expect } from 'vitest'
import { computeSRS } from './srsScheduler.js'

const newCard      = { reviewCount: 0, interval: 0,  reviewStatus: 'new'      }
const learningCard = { reviewCount: 1, interval: 3,  reviewStatus: 'learning' }
const masteredCard = { reviewCount: 5, interval: 20, reviewStatus: 'mastered' }

describe('computeSRS — again', () => {
  it('sets status to learning and interval to 0 for a new card', () => {
    const r = computeSRS(newCard, 'again')
    expect(r.reviewStatus).toBe('learning')
    expect(r.interval).toBe(0)
    expect(r.reviewCount).toBe(1)
  })

  it('demotes a mastered card to learning', () => {
    const r = computeSRS(masteredCard, 'again')
    expect(r.reviewStatus).toBe('learning')
    expect(r.interval).toBe(0)
  })

  it('sets nextReview to today (same calendar day)', () => {
    const before = new Date()
    const r = computeSRS(newCard, 'again')
    const d = new Date(r.nextReview)
    expect(d.getFullYear()).toBe(before.getFullYear())
    expect(d.getMonth()).toBe(before.getMonth())
    expect(d.getDate()).toBe(before.getDate())
  })
})

describe('computeSRS — hard', () => {
  it('gives interval=1 (max guard) when prev interval is 0', () => {
    const r = computeSRS({ ...newCard, interval: 0 }, 'hard')
    expect(r.interval).toBe(1)
    expect(r.reviewStatus).toBe('learning')
  })

  it('scales existing interval by 1.2', () => {
    const r = computeSRS({ ...learningCard, interval: 5 }, 'hard')
    expect(r.interval).toBe(6) // round(5 * 1.2) = 6
  })

  it('demotes a mastered card to learning', () => {
    const r = computeSRS(masteredCard, 'hard')
    expect(r.reviewStatus).toBe('learning')
  })
})

describe('computeSRS — good', () => {
  it('gives 3-day interval on first review (interval was 0)', () => {
    const r = computeSRS(newCard, 'good')
    expect(r.interval).toBe(3)
    expect(r.reviewStatus).toBe('learning') // reviewCount=1, not yet ≥ 3
  })

  it('scales interval by 2.5 on subsequent reviews', () => {
    const r = computeSRS({ ...learningCard, interval: 4 }, 'good')
    expect(r.interval).toBe(10) // round(4 * 2.5) = 10
  })

  it('promotes to mastered when reviewCount reaches 3', () => {
    const r = computeSRS({ reviewCount: 2, interval: 8, reviewStatus: 'learning' }, 'good')
    expect(r.reviewStatus).toBe('mastered')
    expect(r.reviewCount).toBe(3)
  })

  it('stays learning when reviewCount is below 3', () => {
    const r = computeSRS({ reviewCount: 1, interval: 3, reviewStatus: 'learning' }, 'good')
    expect(r.reviewStatus).toBe('learning')
    expect(r.reviewCount).toBe(2)
  })
})

describe('computeSRS — easy', () => {
  it('gives 7-day interval and mastered status on first review', () => {
    const r = computeSRS(newCard, 'easy')
    expect(r.interval).toBe(7)
    expect(r.reviewStatus).toBe('mastered')
  })

  it('scales interval by 3.5 on subsequent reviews', () => {
    const r = computeSRS({ ...learningCard, interval: 4 }, 'easy')
    expect(r.interval).toBe(14) // round(4 * 3.5) = 14
  })

  it('always promotes to mastered regardless of reviewCount', () => {
    const r = computeSRS(newCard, 'easy')
    expect(r.reviewStatus).toBe('mastered')
  })
})

describe('computeSRS — interval cap', () => {
  it('caps interval at 365 days (easy on large interval)', () => {
    const r = computeSRS({ reviewCount: 10, interval: 300, reviewStatus: 'mastered' }, 'easy')
    expect(r.interval).toBe(365) // 300 * 3.5 = 1050, capped
  })

  it('caps interval at 365 days (good on large interval)', () => {
    const r = computeSRS({ reviewCount: 5, interval: 200, reviewStatus: 'mastered' }, 'good')
    expect(r.interval).toBe(365) // 200 * 2.5 = 500, capped
  })
})

describe('computeSRS — reviewCount always increments', () => {
  it('increments by 1 from 0', () => {
    expect(computeSRS(newCard, 'good').reviewCount).toBe(1)
  })
  it('increments by 1 from existing', () => {
    expect(computeSRS(learningCard, 'again').reviewCount).toBe(2)
  })
})

describe('computeSRS — reviewedAt', () => {
  it('sets reviewedAt to a current ISO timestamp', () => {
    const before = new Date()
    const r = computeSRS(newCard, 'good')
    const after = new Date()
    const ts = new Date(r.reviewedAt)
    expect(ts >= before).toBe(true)
    expect(ts <= after).toBe(true)
  })
})

describe('computeSRS — backward compatibility (missing fields)', () => {
  it('handles card with no interval field (treats as 0)', () => {
    const r = computeSRS({ reviewCount: 0 }, 'good')
    expect(r.interval).toBe(3)
  })

  it('handles card with no reviewCount field (treats as 0)', () => {
    const r = computeSRS({ interval: 0 }, 'good')
    expect(r.reviewCount).toBe(1)
  })

  it('handles null card (all fields default)', () => {
    const r = computeSRS(null, 'easy')
    expect(r.interval).toBe(7)
    expect(r.reviewStatus).toBe('mastered')
    expect(r.reviewCount).toBe(1)
  })
})

describe('computeSRS — unknown ease', () => {
  it('returns null for an unrecognised ease string', () => {
    expect(computeSRS(newCard, 'perfect')).toBeNull()
  })
  it('returns null for undefined', () => {
    expect(computeSRS(newCard, undefined)).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(computeSRS(newCard, '')).toBeNull()
  })
})
