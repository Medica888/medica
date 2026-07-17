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
 * Phase 1.1 replaces the single broad `includedInTrustedAnalytics` flag with
 * metric-specific capabilities. A session can be fully and honestly scored
 * (the server verified the questions, answers, and score) without being
 * representative enough for standardized comparison — a learner who
 * hand-picks 10 easy Pharmacology questions gets a real, verified score for
 * that content, but it should not move a "how ready are you for the real
 * exam" number the way a full standardized block does.
 *
 * includedInPersonalHistory: every session a user completed is always visible
 *   to them, whatever its trust tier — sessions are never silently hidden or
 *   deleted for low trust, only labeled.
 * includedInMasteryProcessing: feeds UserConceptMastery / mastery_snapshots
 *   (spaced repetition, per-concept readiness) — server-side only. Unchanged
 *   from Phase 1: server_issued and client_selected_verified both qualify.
 * includedInPersonalPerformanceAnalytics: feeds personal-facing breakdowns —
 *   subject/system/topic accuracy, mistake patterns, study priorities. Same
 *   eligibility as mastery: a verified client-selected session is genuine
 *   evidence of the learner's own performance on that content, even though
 *   it isn't standardized.
 * includedInMedicaScore / includedInReadiness: feed the standardized,
 *   comparable readiness number and label. Requires server_issued — the
 *   server chose the exact question set, so the sample is representative by
 *   construction. A verified-but-client-selected set (the learner picked
 *   which 10 Pharmacology questions to answer) is real evidence of personal
 *   performance but not a representative sample, so it must not move this
 *   number. This is the crux of Phase 1.1: verified is not the same as
 *   standardized.
 * includedInCohortComparison / includedInInstitutionalAnalytics: reserved for
 *   comparative/institutional features that don't exist yet — prepared here
 *   so cohort percentile and institutional dashboards, when built, inherit
 *   the same restriction as Medica Score/readiness (server_issued only)
 *   without re-deriving trust logic elsewhere.
 * displayIntegrityWarning: true when the UI should show an "unverified"
 *   badge next to the result. Tied to the mastery/personal-performance tier,
 *   not the standardized tier — a client_selected_verified session is
 *   genuinely verified and must never be labeled "unverified," even though
 *   it doesn't count toward Medica Score.
 */
export interface SessionTrustCapabilities {
  includedInPersonalHistory: boolean;
  includedInMasteryProcessing: boolean;
  includedInPersonalPerformanceAnalytics: boolean;
  includedInMedicaScore: boolean;
  includedInReadiness: boolean;
  includedInCohortComparison: boolean;
  includedInInstitutionalAnalytics: boolean;
  displayIntegrityWarning: boolean;
}

/**
 * Verified evidence of personal performance: the server confirmed the
 * questions, answers, and score are genuine, even if the learner (not the
 * server) chose which questions to answer. Backs mastery and personal
 * performance analytics — never standardized/comparative metrics.
 */
const VERIFIED_PERSONAL_EVIDENCE: ReadonlySet<SessionIntegrityStatus> = new Set([
  'server_issued',
  'client_selected_verified',
]);

/**
 * Standardized evidence: the server itself selected the exact question set,
 * so the sample is representative by construction. Backs Medica Score,
 * readiness, cohort comparison, and institutional analytics.
 */
const STANDARDIZED_EVIDENCE: ReadonlySet<SessionIntegrityStatus> = new Set([
  'server_issued',
]);

export function getSessionTrustCapabilities(integrityStatus: SessionIntegrityStatus): SessionTrustCapabilities {
  const verifiedPersonal = VERIFIED_PERSONAL_EVIDENCE.has(integrityStatus);
  const standardized = STANDARDIZED_EVIDENCE.has(integrityStatus);
  return {
    includedInPersonalHistory: true,
    includedInMasteryProcessing: verifiedPersonal,
    includedInPersonalPerformanceAnalytics: verifiedPersonal,
    includedInMedicaScore: standardized,
    includedInReadiness: standardized,
    includedInCohortComparison: standardized,
    includedInInstitutionalAnalytics: standardized,
    displayIntegrityWarning: !verifiedPersonal,
  };
}

/**
 * Centralized capability-based filter — the only way analytics code should
 * select an eligible session subset. Prevents `session.integrity_status ===
 * 'server_issued'`-style inline checks from spreading across services.
 */
export function filterSessionsByTrustCapability<T extends { integrity_status: SessionIntegrityStatus }>(
  sessions: T[],
  capability: keyof SessionTrustCapabilities,
): T[] {
  return sessions.filter((s) => getSessionTrustCapabilities(s.integrity_status)[capability]);
}
