/**
 * Single source of truth for cross-user report quarantine thresholds.
 *
 * Both repository implementations (PG, in-memory) and QuestionReportService consume
 * this directly — repositories must never import service classes, so this is a
 * neutral, dependency-free module rather than a re-export from the service layer.
 * Changing a threshold here changes it everywhere it's enforced.
 */
export const QUARANTINE_THRESHOLDS = Object.freeze({
  /** Distinct wrong_answer reporters required to quarantine. */
  wrongAnswerMin: 2,
  /** Distinct off_topic reporters required to quarantine. */
  offTopicMin: 3,
  /** Distinct duplicate reporters required to quarantine. */
  duplicateMin: 2,
  /** Distinct reporters across all reasons required to quarantine. */
  totalMin: 5,
});

export interface QuarantineCounts {
  uniqueUsers: number;
  uniqueWrongAnswerUsers: number;
  uniqueOffTopicUsers: number;
  uniqueDuplicateUsers: number;
}

/** Pure decision function — identical inputs always produce identical output. */
export function isQuarantined(counts: QuarantineCounts): boolean {
  return (
    counts.uniqueWrongAnswerUsers >= QUARANTINE_THRESHOLDS.wrongAnswerMin ||
    counts.uniqueOffTopicUsers    >= QUARANTINE_THRESHOLDS.offTopicMin ||
    counts.uniqueDuplicateUsers   >= QUARANTINE_THRESHOLDS.duplicateMin ||
    counts.uniqueUsers            >= QUARANTINE_THRESHOLDS.totalMin
  );
}
