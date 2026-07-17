/**
 * Frontend mirror of server/src/services/sessionIntegrity.ts's trust policy.
 * The backend is the sole authority that COMPUTES integrityStatus — this
 * module never derives or upgrades it, only reads the value the backend
 * already assigned. Centralized here so no component/hook re-implements its
 * own "which statuses count as trusted" list.
 *
 * A session with no integrityStatus at all (purely local, never synced to
 * the backend) is treated as untrusted — the same as legacy_unverified —
 * never assumed verified by absence of information.
 */
const TRUSTED_INTEGRITY_STATUSES = new Set(['server_issued', 'client_selected_verified'])

/**
 * @param {{ integrityStatus?: string }} session
 */
export function isSessionTrustedForAnalytics(session) {
  return TRUSTED_INTEGRITY_STATUSES.has(session?.integrityStatus)
}

/**
 * @param {string | undefined} integrityStatus
 */
export function getSessionTrustCapabilities(integrityStatus) {
  const trusted = TRUSTED_INTEGRITY_STATUSES.has(integrityStatus)
  return {
    includedInPersonalHistory: true,
    includedInTrustedAnalytics: trusted,
    displayIntegrityWarning: !trusted,
  }
}
