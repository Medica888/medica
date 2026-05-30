/**
 * Phase 3.6 — Mastery Snapshots
 *
 * Adds: mastery_snapshots — one row per concept per exam session.
 *
 * Grain: (user_id, concept_id, session_id) — full mastery state
 * captured after every exam so progress can be derived by comparing
 * the latest two batches (each identified by session_id).
 *
 * Requires migrations 001, 005, and 006.
 */
exports.up = (pgm) => {
  pgm.createTable(
    'mastery_snapshots',
    {
      id: {
        type: 'uuid',
        primaryKey: true,
        default: pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type: 'uuid',
        notNull: true,
        references: '"users"',
        onDelete: 'CASCADE',
      },
      concept_id: {
        type: 'uuid',
        notNull: true,
        references: '"concepts"',
        onDelete: 'CASCADE',
      },
      session_id: {
        type: 'uuid',
        notNull: true,
        references: '"exam_sessions"',
        onDelete: 'CASCADE',
      },
      mastery_score: { type: 'numeric(5,4)', notNull: true },
      confidence:    { type: 'numeric(5,4)', notNull: true },
      attempt_count: { type: 'integer',      notNull: true },
      created_at:    { type: 'timestamptz',  notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true },
  );

  pgm.createIndex('mastery_snapshots', ['user_id', 'created_at'],
    { name: 'ms_user_date_idx',    ifNotExists: true });
  pgm.createIndex('mastery_snapshots', ['user_id', 'session_id'],
    { name: 'ms_user_session_idx', ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('mastery_snapshots', [], { name: 'ms_user_session_idx', ifExists: true });
  pgm.dropIndex('mastery_snapshots', [], { name: 'ms_user_date_idx',    ifExists: true });
  pgm.dropTable('mastery_snapshots', { ifExists: true });
};
