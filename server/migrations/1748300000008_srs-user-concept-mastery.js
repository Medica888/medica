/**
 * Phase 5.2 - Spaced repetition state for user concept mastery.
 *
 * Keeps the smallest persistent SRS state on the existing per-user/per-concept
 * mastery row. No new table is required for the MVP scheduler.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE user_concept_mastery
      ADD COLUMN IF NOT EXISTS review_interval_days INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ
  `);

  pgm.createIndex(
    'user_concept_mastery',
    ['user_id', 'next_review_at'],
    { name: 'ucm_user_next_review_idx', ifNotExists: true },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex('user_concept_mastery', [], { name: 'ucm_user_next_review_idx', ifExists: true });
  pgm.sql(`
    ALTER TABLE user_concept_mastery
      DROP COLUMN IF EXISTS review_interval_days,
      DROP COLUMN IF EXISTS next_review_at,
      DROP COLUMN IF EXISTS last_reviewed_at
  `);
};
