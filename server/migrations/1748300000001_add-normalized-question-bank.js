/**
 * PENDING — do not run until existing exam_session data has been backfilled.
 *
 * Introduces a normalized question bank to replace the current JSONB blobs stored
 * in exam_sessions.questions and the opaque TEXT question_id in question_attempts.
 *
 * WHY this matters:
 *   - Analytics queries (weak spots, subject mastery) require joining across
 *     sessions by question identity. TEXT question_id makes cross-session joins
 *     unreliable and prevents aggregated per-question statistics.
 *   - question_attempts.question_id is currently a free-form TEXT with no FK,
 *     so orphaned attempts accumulate silently.
 *   - A normalized `questions` table enables: accurate accuracy rates per question,
 *     subject/system tagging without JSONB extraction, and deduplication.
 *
 * SAFE MIGRATION SEQUENCE:
 *   1. Apply this migration (adds tables + nullable FK column).
 *   2. Run a one-time backfill script that:
 *        a. Reads unique question IDs from exam_sessions.questions JSONB array.
 *        b. INSERTs each into `questions` with its subject/system metadata.
 *        c. Populates exam_session_questions join rows.
 *        d. Sets question_attempts.question_ref_id from the questions.id lookup.
 *   3. After backfill validates successfully, add NOT NULL + drop old TEXT columns
 *      in a follow-up migration.
 *
 * DO NOT run this migration on a database that hasn't had the baseline migration
 * (1748300000000) applied first.
 */
exports.up = (pgm) => {
  // Central question registry.
  pgm.createTable(
    'questions',
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      external_id: { type: 'text', notNull: true, unique: true }, // maps to existing question_id TEXT values
      subject: { type: 'text', notNull: true, default: '' },
      system: { type: 'text', notNull: true, default: '' },
      body: { type: 'jsonb', notNull: true, default: '{}' },   // full question content/options
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true },
  );

  // Join table linking sessions to their ordered questions.
  pgm.createTable(
    'exam_session_questions',
    {
      session_id: {
        type: 'uuid',
        notNull: true,
        references: '"exam_sessions"',
        onDelete: 'CASCADE',
      },
      question_id: {
        type: 'uuid',
        notNull: true,
        references: '"questions"',
        onDelete: 'CASCADE',
      },
      position: { type: 'integer', notNull: true },
    },
    {
      ifNotExists: true,
      constraints: { primaryKey: ['session_id', 'question_id'] },
    },
  );

  // Nullable FK column on question_attempts — populated during backfill.
  // The legacy TEXT question_id column is kept until backfill is verified.
  pgm.addColumn('question_attempts', {
    question_ref_id: {
      type: 'uuid',
      references: '"questions"',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('questions', 'external_id');
  pgm.createIndex('exam_session_questions', 'session_id');
  pgm.createIndex('question_attempts', 'question_ref_id');
};

exports.down = (pgm) => {
  pgm.dropColumn('question_attempts', 'question_ref_id');
  pgm.dropTable('exam_session_questions', { cascade: true });
  pgm.dropTable('questions', { cascade: true });
};
