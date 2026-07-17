import { describe, it, expect } from 'vitest'
import { isSessionTrustedForAnalytics, getSessionTrustCapabilities } from './sessionTrust.js'

describe('isSessionTrustedForAnalytics', () => {
  it('trusts server_issued', () => {
    expect(isSessionTrustedForAnalytics({ integrityStatus: 'server_issued' })).toBe(true)
  })

  it('trusts client_selected_verified', () => {
    expect(isSessionTrustedForAnalytics({ integrityStatus: 'client_selected_verified' })).toBe(true)
  })

  it('does not trust unverified_local', () => {
    expect(isSessionTrustedForAnalytics({ integrityStatus: 'unverified_local' })).toBe(false)
  })

  it('does not trust legacy_unverified', () => {
    expect(isSessionTrustedForAnalytics({ integrityStatus: 'legacy_unverified' })).toBe(false)
  })

  it('does not trust a session with no integrityStatus at all (never synced)', () => {
    expect(isSessionTrustedForAnalytics({})).toBe(false)
    expect(isSessionTrustedForAnalytics(undefined)).toBe(false)
  })

  it('ignores mode entirely — only integrityStatus is consulted', () => {
    const exam = { mode: 'exam', integrityStatus: 'unverified_local' }
    const practice = { mode: 'practice', integrityStatus: 'unverified_local' }
    expect(isSessionTrustedForAnalytics(exam)).toBe(isSessionTrustedForAnalytics(practice))
    expect(isSessionTrustedForAnalytics(exam)).toBe(false)
  })
})

describe('getSessionTrustCapabilities', () => {
  it('server_issued and client_selected_verified are trusted for analytics and show no warning', () => {
    for (const status of ['server_issued', 'client_selected_verified']) {
      const caps = getSessionTrustCapabilities(status)
      expect(caps.includedInPersonalHistory).toBe(true)
      expect(caps.includedInTrustedAnalytics).toBe(true)
      expect(caps.displayIntegrityWarning).toBe(false)
    }
  })

  it('unverified_local and legacy_unverified are excluded from trusted analytics but still counted in personal history', () => {
    for (const status of ['unverified_local', 'legacy_unverified']) {
      const caps = getSessionTrustCapabilities(status)
      expect(caps.includedInPersonalHistory).toBe(true)
      expect(caps.includedInTrustedAnalytics).toBe(false)
      expect(caps.displayIntegrityWarning).toBe(true)
    }
  })
})
