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
 *
 * Phase 1.1: replaces the single broad "trusted for analytics" flag with
 * metric-specific capabilities. A verified client-selected session (the
 * learner chose which questions to answer, but the server confirmed the
 * questions/answers/score are genuine) is real evidence of the learner's own
 * performance — it can move personal breakdowns and mastery — but it is not
 * a representative sample, so it must never move the standardized Medica
 * Score or readiness number. See sessionIntegrity.ts for the full rationale.
 */
const VERIFIED_PERSONAL_EVIDENCE = new Set(['server_issued', 'client_selected_verified'])
const STANDARDIZED_EVIDENCE = new Set(['server_issued'])

/**
 * @param {{ integrityStatus?: string }} session
 */
export function isSessionTrustedForAnalytics(session) {
  return VERIFIED_PERSONAL_EVIDENCE.has(session?.integrityStatus)
}

/**
 * @param {string | undefined} integrityStatus
 */
export function getSessionTrustCapabilities(integrityStatus) {
  const verifiedPersonal = VERIFIED_PERSONAL_EVIDENCE.has(integrityStatus)
  const standardized = STANDARDIZED_EVIDENCE.has(integrityStatus)
  return {
    includedInPersonalHistory: true,
    includedInMasteryProcessing: verifiedPersonal,
    includedInPersonalPerformanceAnalytics: verifiedPersonal,
    includedInMedicaScore: standardized,
    includedInReadiness: standardized,
    includedInCohortComparison: standardized,
    includedInInstitutionalAnalytics: standardized,
    displayIntegrityWarning: !verifiedPersonal,
  }
}

/**
 * Centralized capability-based filter — the only way analytics code should
 * select an eligible session subset. Prevents `session.integrityStatus ===
 * 'server_issued'`-style inline checks from spreading across components.
 * @param {Array<{ integrityStatus?: string }>} sessions
 * @param {keyof ReturnType<typeof getSessionTrustCapabilities>} capability
 */
export function filterSessionsByTrustCapability(sessions, capability) {
  return sessions.filter((s) => getSessionTrustCapabilities(s?.integrityStatus)[capability])
}
