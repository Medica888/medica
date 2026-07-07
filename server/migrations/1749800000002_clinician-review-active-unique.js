/**
 * Enforces at most one active (pending/in_review) clinician review per identity,
 * so concurrent report/sampling triggers can no longer both observe "no active
 * review" and each insert a duplicate — the previous find-then-create pattern in
 * ClinicianReviewService raced across the await boundary between the two steps.
 *
 * Two partial unique indexes are needed because the identity key differs: reviews
 * with a resolvable question_id dedupe on it; reviews without one (question_id IS
 * NULL) dedupe on report_fingerprint instead. Both are usable as ON CONFLICT
 * inference targets for an atomic INSERT ... ON CONFLICT ... DO NOTHING.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS clinician_reviews_active_question_unique
    ON clinician_reviews (question_id)
    WHERE review_status IN ('pending', 'in_review') AND question_id IS NOT NULL
  `);
  pgm.sql(`
    CREATE UNIQUE INDEX IF NOT EXISTS clinician_reviews_active_fingerprint_unique
    ON clinician_reviews (report_fingerprint)
    WHERE review_status IN ('pending', 'in_review') AND question_id IS NULL AND report_fingerprint IS NOT NULL
  `);
};

exports.down = (pgm) => {
  pgm.dropIndex('clinician_reviews', 'report_fingerprint', {
    name: 'clinician_reviews_active_fingerprint_unique',
    ifExists: true,
  });
  pgm.dropIndex('clinician_reviews', 'question_id', {
    name: 'clinician_reviews_active_question_unique',
    ifExists: true,
  });
};
