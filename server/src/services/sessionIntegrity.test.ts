import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { deriveSessionIntegrityStatus, getSessionTrustCapabilities, filterSessionsByTrustCapability } from './sessionIntegrity.js';
import type { SessionIntegrityStatus } from '../types/index.js';

// ── Canonical trust matrix — PARITY CONTRACT ──────────────────────────────────
//
// Loaded at test time from shared/session-trust-matrix.json (repo root) — the
// single source of truth both this file and
// medica-app/src/lib/sessionTrust.test.js assert their own
// getSessionTrustCapabilities() implementation against. This is a real
// cross-implementation check, not two independently-maintained copies: a
// policy change applied to only one side's source fails that side's test
// against this shared file; a change to the shared file itself requires both
// implementations to be updated to keep passing.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedFixturePath = path.join(__dirname, '../../../shared/session-trust-matrix.json');
const rawMatrix = JSON.parse(readFileSync(sharedFixturePath, 'utf-8')) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { _comment, ...EXPECTED_TRUST_MATRIX } = rawMatrix as Record<string, {
  includedInPersonalHistory: boolean;
  includedInMasteryProcessing: boolean;
  includedInPersonalPerformanceAnalytics: boolean;
  includedInMedicaScore: boolean;
  includedInReadiness: boolean;
  includedInCohortComparison: boolean;
  includedInInstitutionalAnalytics: boolean;
  displayIntegrityWarning: boolean;
}> & { _comment: string };

describe('getSessionTrustCapabilities — canonical trust matrix (parity contract)', () => {
  for (const [status, expected] of Object.entries(EXPECTED_TRUST_MATRIX)) {
    it(`matches the canonical matrix for ${status}`, () => {
      expect(getSessionTrustCapabilities(status as SessionIntegrityStatus)).toEqual(expected);
    });
  }

  it('server_issued is included in every capability and shows no integrity warning', () => {
    const caps = getSessionTrustCapabilities('server_issued');
    const { displayIntegrityWarning, ...inclusionFlags } = caps;
    expect(Object.values(inclusionFlags).every((v) => v === true)).toBe(true);
    expect(displayIntegrityWarning).toBe(false);
  });

  it('client_selected_verified is included in mastery and personal performance but excluded from every standardized capability', () => {
    const caps = getSessionTrustCapabilities('client_selected_verified');
    expect(caps.includedInMasteryProcessing).toBe(true);
    expect(caps.includedInPersonalPerformanceAnalytics).toBe(true);
    expect(caps.includedInMedicaScore).toBe(false);
    expect(caps.includedInReadiness).toBe(false);
    expect(caps.includedInCohortComparison).toBe(false);
    expect(caps.includedInInstitutionalAnalytics).toBe(false);
  });

  it('client_selected_verified is never flagged as an integrity warning — it is verified, not unverified', () => {
    expect(getSessionTrustCapabilities('client_selected_verified').displayIntegrityWarning).toBe(false);
  });

  it('unverified_local is personal-history-only', () => {
    const caps = getSessionTrustCapabilities('unverified_local');
    expect(caps.includedInPersonalHistory).toBe(true);
    expect(caps.includedInMasteryProcessing).toBe(false);
    expect(caps.includedInPersonalPerformanceAnalytics).toBe(false);
    expect(caps.includedInMedicaScore).toBe(false);
    expect(caps.includedInReadiness).toBe(false);
  });

  it('legacy_unverified is historical-display-only — never a new trusted input', () => {
    const caps = getSessionTrustCapabilities('legacy_unverified');
    expect(caps.includedInPersonalHistory).toBe(true);
    expect(caps.includedInMasteryProcessing).toBe(false);
    expect(caps.includedInPersonalPerformanceAnalytics).toBe(false);
  });

  it('an unrecognized integrity value fails safely — every capability defaults to false except personal history, and a warning is shown', () => {
    const caps = getSessionTrustCapabilities('some_future_status' as SessionIntegrityStatus);
    expect(caps.includedInPersonalHistory).toBe(true);
    expect(caps.includedInMasteryProcessing).toBe(false);
    expect(caps.includedInPersonalPerformanceAnalytics).toBe(false);
    expect(caps.includedInMedicaScore).toBe(false);
    expect(caps.includedInReadiness).toBe(false);
    expect(caps.includedInCohortComparison).toBe(false);
    expect(caps.includedInInstitutionalAnalytics).toBe(false);
    expect(caps.displayIntegrityWarning).toBe(true);
  });
});

describe('deriveSessionIntegrityStatus — unchanged from Phase 1 (regression)', () => {
  it('a server-issued reservation yields server_issued', () => {
    expect(deriveSessionIntegrityStatus({ reservationSource: 'server_issued', fullyAuthoritativeMatch: false })).toBe('server_issued');
  });

  it('a client-selected reservation yields client_selected_verified', () => {
    expect(deriveSessionIntegrityStatus({ reservationSource: 'client_selected', fullyAuthoritativeMatch: false })).toBe('client_selected_verified');
  });

  it('no reservation but a full authoritative bank match yields client_selected_verified', () => {
    expect(deriveSessionIntegrityStatus({ reservationSource: null, fullyAuthoritativeMatch: true })).toBe('client_selected_verified');
  });

  it('no reservation and no full authoritative match yields unverified_local', () => {
    expect(deriveSessionIntegrityStatus({ reservationSource: null, fullyAuthoritativeMatch: false })).toBe('unverified_local');
  });
});

describe('filterSessionsByTrustCapability', () => {
  const sessions = (['server_issued', 'client_selected_verified', 'unverified_local', 'legacy_unverified'] as SessionIntegrityStatus[])
    .map((integrity_status, i) => ({ id: String(i), integrity_status }));

  it('filters to exactly the sessions eligible for the given capability', () => {
    expect(filterSessionsByTrustCapability(sessions, 'includedInMedicaScore').map((s) => s.integrity_status))
      .toEqual(['server_issued']);
    expect(filterSessionsByTrustCapability(sessions, 'includedInPersonalPerformanceAnalytics').map((s) => s.integrity_status))
      .toEqual(['server_issued', 'client_selected_verified']);
    expect(filterSessionsByTrustCapability(sessions, 'includedInPersonalHistory')).toHaveLength(4);
  });
});
