/**
 * Phase 10.0A — Question Reports
 *
 * Durable product-quality signals from user-flagged questions.
 * Captures requested-vs-actual scope (critical for off_topic analysis),
 * question source, and USMLE metadata for future quarantine and prompt tuning.
 *
 * user_id is nullable — anonymous reporters are supported.
 * question_id is TEXT, not UUID — bank question IDs are non-UUID strings.
 */
exports.up = (pgm) => {
  pgm.createTable(
    'question_reports',
    {
      id: {
        type:       'uuid',
        primaryKey: true,
        default:    pgm.func('gen_random_uuid()'),
      },
      user_id: {
        type:       'uuid',
        notNull:    false,
        references: '"users"',
        onDelete:   'SET NULL',
      },
      question_id:      { type: 'text',        notNull: false },
      fingerprint:      { type: 'text',        notNull: true  },
      reason:           { type: 'text',        notNull: true  },
      source:           { type: 'text',        notNull: false },
      mode:             { type: 'text',        notNull: false },
      difficulty:       { type: 'text',        notNull: false },
      requested_subject:{ type: 'text',        notNull: false },
      requested_system: { type: 'text',        notNull: false },
      requested_topic:  { type: 'text',        notNull: false },
      actual_subject:   { type: 'text',        notNull: false },
      actual_system:    { type: 'text',        notNull: false },
      actual_topic:     { type: 'text',        notNull: false },
      tested_concept:   { type: 'text',        notNull: false },
      usmle_content_area: { type: 'text',      notNull: false },
      physician_task:   { type: 'text',        notNull: false },
      stem_preview:     { type: 'text',        notNull: false },
      created_at: {
        type:    'timestamptz',
        notNull: true,
        default: pgm.func('now()'),
      },
    },
    { ifNotExists: true },
  );

  pgm.addConstraint('question_reports', 'qr_reason_check', {
    check: "reason IN ('wrong_answer', 'bad_explanation', 'off_topic')",
  });

  pgm.createIndex('question_reports', ['fingerprint'],
    { name: 'qr_fingerprint_idx', ifNotExists: true });

  pgm.createIndex('question_reports', ['reason'],
    { name: 'qr_reason_idx', ifNotExists: true });

  pgm.createIndex('question_reports', ['user_id', 'created_at'],
    { name: 'qr_user_date_idx', ifNotExists: true });

  pgm.createIndex('question_reports', ['fingerprint', 'reason'],
    { name: 'qr_fingerprint_reason_idx', ifNotExists: true });

  pgm.createIndex('question_reports', ['created_at'],
    { name: 'qr_created_at_idx', ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('question_reports', [], { name: 'qr_created_at_idx',         ifExists: true });
  pgm.dropIndex('question_reports', [], { name: 'qr_fingerprint_reason_idx', ifExists: true });
  pgm.dropIndex('question_reports', [], { name: 'qr_user_date_idx',          ifExists: true });
  pgm.dropIndex('question_reports', [], { name: 'qr_reason_idx',             ifExists: true });
  pgm.dropIndex('question_reports', [], { name: 'qr_fingerprint_idx',        ifExists: true });
  pgm.dropTable('question_reports', { ifExists: true });
};
