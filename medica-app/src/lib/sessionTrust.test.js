import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import { isSessionTrustedForAnalytics, getSessionTrustCapabilities, filterSessionsByTrustCapability } from './sessionTrust.js'

// ── Canonical trust matrix — PARITY CONTRACT ──────────────────────────────────
//
// Loaded at test time from shared/session-trust-matrix.json (repo root) — the
// single source of truth both this file and
// server/src/services/sessionIntegrity.test.ts assert their own
// getSessionTrustCapabilities() implementation against. This is a real
// cross-implementation check, not two independently-maintained copies: a
// policy change applied to only one side's source fails that side's test
// against this shared file; a change to the shared file itself requires both
// implementations to be updated to keep passing.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sharedFixturePath = path.join(__dirname, '../../../shared/session-trust-matrix.json')
// eslint-disable-next-line no-unused-vars
const { _comment, ...EXPECTED_TRUST_MATRIX } = JSON.parse(readFileSync(sharedFixturePath, 'utf-8'))

describe('getSessionTrustCapabilities — canonical trust matrix (parity contract)', () => {
  for (const [status, expected] of Object.entries(EXPECTED_TRUST_MATRIX)) {
    it(`matches the canonical matrix for ${status}`, () => {
      expect(getSessionTrustCapabilities(status)).toEqual(expected)
    })
  }

  it('server_issued is included in every capability and shows no integrity warning', () => {
    const { displayIntegrityWarning, ...inclusionFlags } = getSessionTrustCapabilities('server_issued')
    expect(Object.values(inclusionFlags).every(v => v === true)).toBe(true)
    expect(displayIntegrityWarning).toBe(false)
  })

  it('client_selected_verified is included in mastery and personal performance but excluded from every standardized capability', () => {
    const caps = getSessionTrustCapabilities('client_selected_verified')
    expect(caps.includedInMasteryProcessing).toBe(true)
    expect(caps.includedInPersonalPerformanceAnalytics).toBe(true)
    expect(caps.includedInMedicaScore).toBe(false)
    expect(caps.includedInReadiness).toBe(false)
    expect(caps.includedInCohortComparison).toBe(false)
    expect(caps.includedInInstitutionalAnalytics).toBe(false)
  })

  it('client_selected_verified is never flagged as an integrity warning', () => {
    expect(getSessionTrustCapabilities('client_selected_verified').displayIntegrityWarning).toBe(false)
  })

  it('unverified_local and legacy_unverified are excluded from every analytics capability but still counted in personal history', () => {
    for (const status of ['unverified_local', 'legacy_unverified']) {
      const caps = getSessionTrustCapabilities(status)
      expect(caps.includedInPersonalHistory).toBe(true)
      expect(caps.includedInMasteryProcessing).toBe(false)
      expect(caps.includedInPersonalPerformanceAnalytics).toBe(false)
      expect(caps.includedInMedicaScore).toBe(false)
      expect(caps.includedInReadiness).toBe(false)
      expect(caps.displayIntegrityWarning).toBe(true)
    }
  })

  it('a session with no integrityStatus at all is treated the same as the least-trusted class', () => {
    expect(getSessionTrustCapabilities(undefined)).toEqual(EXPECTED_TRUST_MATRIX.legacy_unverified)
  })
})

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

describe('filterSessionsByTrustCapability', () => {
  const sessions = ['server_issued', 'client_selected_verified', 'unverified_local', 'legacy_unverified']
    .map((integrityStatus, i) => ({ id: String(i), integrityStatus }))

  it('filters to exactly the sessions eligible for the given capability', () => {
    expect(filterSessionsByTrustCapability(sessions, 'includedInMedicaScore').map(s => s.integrityStatus))
      .toEqual(['server_issued'])
    expect(filterSessionsByTrustCapability(sessions, 'includedInPersonalPerformanceAnalytics').map(s => s.integrityStatus))
      .toEqual(['server_issued', 'client_selected_verified'])
    expect(filterSessionsByTrustCapability(sessions, 'includedInPersonalHistory')).toHaveLength(4)
  })
})
