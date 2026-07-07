/**
 * Establishes one unambiguous identifier contract for clinician_reviews.question_id.
 *
 * Previously, the question-report trigger passed the content fingerprint into the
 * same `question_id` column that the generated-bank sampling trigger and the admin
 * update/trigger routes (PATCH/POST /generated-question-bank/:externalId/clinician-review)
 * treat as a real bank question external ID — making every report-triggered review
 * unreachable from those admin routes.
 *
 * Going forward: `question_id` holds the bank external ID when one is resolvable;
 * `report_fingerprint` (new, nullable) always holds the content fingerprint for
 * report aggregation. When no external ID is resolvable, `question_id` is NULL and
 * the review is looked up/deduped by `report_fingerprint` instead — it remains
 * visible in governance analytics either way.
 *
 * Historical rows are untouched by `up` (still readable, still findable by whichever
 * value happens to be in `question_id`); `down` backfills any NULL question_id rows
 * before restoring NOT NULL so the migration is not blocked by data created after `up`.
 */
exports.up = (pgm) => {
  pgm.addColumn('clinician_reviews', {
    report_fingerprint: { type: 'text' },
  });
  pgm.alterColumn('clinician_reviews', 'question_id', { notNull: false });
  pgm.createIndex('clinician_reviews', 'report_fingerprint', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE clinician_reviews
    SET question_id = COALESCE(question_id, report_fingerprint, 'unknown')
    WHERE question_id IS NULL
  `);
  pgm.dropIndex('clinician_reviews', 'report_fingerprint', { ifExists: true });
  pgm.alterColumn('clinician_reviews', 'question_id', { notNull: true });
  pgm.dropColumn('clinician_reviews', 'report_fingerprint');
};
