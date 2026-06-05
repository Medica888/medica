import { describe, expect, it } from 'vitest'
import { shouldEnterLocalFallback, shouldUseValidatedLocalFallback } from './App.jsx'

describe('shouldUseValidatedLocalFallback', () => {
  it('allows hard-mode timeout fallback when the validated local bank has enough questions', () => {
    const result = shouldUseValidatedLocalFallback(
      { code: 'GENERATION_TIMEOUT' },
      { mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 },
    )

    expect(result).toBe(true)
  })

  it('allows hard-mode insufficient-count fallback when the validated local bank has enough questions', () => {
    const result = shouldUseValidatedLocalFallback(
      { code: 'AI_INSUFFICIENT_COUNT', returned: 24, requested: 40 },
      { mode: 'exam', difficulty: 'NBME Difficult', questionCount: 40 },
    )

    expect(result).toBe(true)
  })

  it('does not use hard-bank fallback for Balanced generation', () => {
    const result = shouldUseValidatedLocalFallback(
      { code: 'GENERATION_TIMEOUT' },
      { mode: 'exam', difficulty: 'Balanced', questionCount: 40 },
    )

    expect(result).toBe(false)
  })

  it('does not hide non-recoverable generation errors', () => {
    const result = shouldUseValidatedLocalFallback(
      { message: 'Invalid API key' },
      { mode: 'exam', difficulty: 'UWorld Challenge', questionCount: 40 },
    )

    expect(result).toBe(false)
  })
})

describe('shouldEnterLocalFallback', () => {
  it('enters fallback when dev/mock fallback is allowed', () => {
    expect(shouldEnterLocalFallback(true, false)).toBe(true)
  })

  it('enters fallback when validated hard-bank fallback is allowed', () => {
    expect(shouldEnterLocalFallback(false, true)).toBe(true)
  })

  it('does not enter fallback when both fallback gates are false', () => {
    expect(shouldEnterLocalFallback(false, false)).toBe(false)
  })
})
