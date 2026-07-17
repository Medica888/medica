import type { ExamSessionReservationSource, SessionIntegrityStatus } from '../types/index.js';

/**
 * Single source of truth for classifying how trustworthy a persisted session's
 * question/answer content is. Called once, at session-completion time, from
 * ExamService.createSession — never re-derived or overridden downstream.
 *
 * Deliberately mode-blind: `mode` is client-supplied on every request, so it
 * must never influence trust classification or mastery eligibility — a
 * client could otherwise submit Exam-origin (or entirely fabricated) content
 * labeled 'practice'/'coach' to dodge verification. Only two facts the
 * server itself established are consulted:
 *
 *   - reservationSource: null when no reservation exists for the session's
 *     clientSessionId (no reservations repo wired, no clientSessionId sent,
 *     or no matching row). 'server_issued' requires a reservation the server
 *     itself created via reserveGeneratedExamSnapshot — never inferred from
 *     mode.
 *   - fullyAuthoritativeMatch: true only when EVERY submitted question id
 *     resolved against the authoritative questions table (see
 *     ExamService.resolveAuthoritativeQuestions).
 *
 * This applies identically to Exam, Practice, and Coach sessions. Practice
 * and Coach have never had a reservation mechanism (out of scope to build
 * one in this phase — see "out of scope" list), so a Practice/Coach session
 * with no reservation and no authoritative match now correctly falls to
 * unverified_local and loses mastery credit, exactly like an equivalent
 * Exam-mode session would. This is an intentional, disclosed behavior
 * change from the previous mode-gated draft of this function: mastery
 * credit for freshly AI-generated Practice/Coach content (which has no
 * pre-existing authoritative bank record) is withheld until those modes
 * gain a real server-owned issuance or verification path.
 */
export function deriveSessionIntegrityStatus(input: {
  reservationSource: ExamSessionReservationSource | null;
  fullyAuthoritativeMatch: boolean;
}): SessionIntegrityStatus {
  if (input.reservationSource === 'server_issued') return 'server_issued';
  if (input.reservationSource === 'client_selected') return 'client_selected_verified';
  return input.fullyAuthoritativeMatch ? 'client_selected_verified' : 'unverified_local';
}

/**
 * What a session's integrity classification permits it to affect. This is the
 * ONLY place trust rules are decided — analytics/mastery/readiness code must
 * consult this instead of re-deriving their own checks against integrity_status.
 *
 * includedInPersonalHistory: every session a user completed is always visible
 *   to them, whatever its trust tier — sessions are never silently hidden or
 *   deleted for low trust, only labeled.
 * includedInMasteryProcessing: feeds UserConceptMastery / mastery_snapshots
 *   (spaced repetition, per-concept readiness) — server-side only.
 * includedInTrustedAnalytics: feeds Medica Score, readiness, weak areas, study
 *   priorities, and accuracy trends — currently the same trust tier as
 *   mastery (both require provable server-issued or fully ID-verified
 *   content), kept as a separate field so the two consumption points can
 *   diverge later without re-deriving trust logic elsewhere.
 * displayIntegrityWarning: true when the UI should show an "unverified"
 *   badge next to the result — legacy rows and unverified-local content.
 */
export interface SessionTrustCapabilities {
  includedInPersonalHistory: boolean;
  includedInMasteryProcessing: boolean;
  includedInTrustedAnalytics: boolean;
  displayIntegrityWarning: boolean;
}

const TRUSTED_FOR_MASTERY: ReadonlySet<SessionIntegrityStatus> = new Set([
  'server_issued',
  'client_selected_verified',
]);

export function getSessionTrustCapabilities(integrityStatus: SessionIntegrityStatus): SessionTrustCapabilities {
  const trusted = TRUSTED_FOR_MASTERY.has(integrityStatus);
  return {
    includedInPersonalHistory: true,
    includedInMasteryProcessing: trusted,
    includedInTrustedAnalytics: trusted,
    displayIntegrityWarning: !trusted,
  };
}
