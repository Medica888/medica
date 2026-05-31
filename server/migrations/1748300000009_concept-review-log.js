/**
 * Phase 5.5 — Concept Review Log
 *
 * Append-only event log for SRS review completions. One row per review
 * action (again/hard/good/easy) on a concept via POST /concept/:id/review.
 *
 * Enables: reviews today, reviews this week, streak, ease breakdown.
 * Does not touch user_concept_mastery or any existing table.
 */
exports.up = (pgm) => {
  pgm.createTable(
    'concept_review_log',
    {
      id: {
        type:    'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type:     'uuid',
        notNull:  true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      concept_id: {
        type:     'uuid',
        notNull:  true,
        references: '"concepts"',
        onDelete: 'CASCADE',
      },
      result:          { type: 'text',        notNull: true },
      interval_before: { type: 'integer',     notNull: true },
      interval_after:  { type: 'integer',     notNull: true },
      reviewed_at:     { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true },
  );

  pgm.addConstraint('concept_review_log', 'crl_result_check', {
    check: "result IN ('again', 'hard', 'good', 'easy')",
  });

  pgm.createIndex(
    'concept_review_log',
    ['user_id', 'reviewed_at'],
    { name: 'crl_user_date_idx', ifNotExists: true },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex('concept_review_log', [], { name: 'crl_user_date_idx', ifExists: true });
  pgm.dropTable('concept_review_log', { ifExists: true });
};
