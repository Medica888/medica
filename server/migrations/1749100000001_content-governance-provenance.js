'use strict';

exports.up = (pgm) => {
  // ── Questions: add provenance columns ───────────────────────────────────────
  pgm.sql(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS ai_model TEXT`);
  pgm.sql(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS validator_version TEXT`);

  // ── Questions: add 'restored' to lifecycle ──────────────────────────────────
  pgm.sql('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_bank_status_check');
  pgm.sql(`
    ALTER TABLE questions
      ADD CONSTRAINT questions_bank_status_check
      CHECK (bank_status IN (
        'legacy', 'validated_generated', 'approved', 'restored',
        'quarantined', 'validation_failed', 'rejected'
      ))
  `);

  // ── Question reports: add 'duplicate' and 'technical_issue' reasons ─────────
  pgm.sql('ALTER TABLE question_reports DROP CONSTRAINT IF EXISTS question_reports_reason_check');
  pgm.sql(`
    ALTER TABLE question_reports
      ADD CONSTRAINT question_reports_reason_check
      CHECK (reason IN (
        'wrong_answer', 'bad_explanation', 'off_topic',
        'ambiguous_or_insufficient_clues', 'duplicate', 'technical_issue'
      ))
  `);
};

exports.down = (pgm) => {
  // Revert question_reports reasons
  pgm.sql(`UPDATE question_reports SET reason = 'bad_explanation' WHERE reason IN ('duplicate', 'technical_issue')`);
  pgm.sql('ALTER TABLE question_reports DROP CONSTRAINT IF EXISTS question_reports_reason_check');
  pgm.sql(`
    ALTER TABLE question_reports
      ADD CONSTRAINT question_reports_reason_check
      CHECK (reason IN ('wrong_answer', 'bad_explanation', 'off_topic', 'ambiguous_or_insufficient_clues'))
  `);

  // Revert questions bank_status (restored → quarantined before removing)
  pgm.sql(`UPDATE questions SET bank_status = 'quarantined', body = jsonb_set(body, '{bankStatus}', to_jsonb('quarantined'::text), true) WHERE bank_status = 'restored'`);
  pgm.sql('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_bank_status_check');
  pgm.sql(`
    ALTER TABLE questions
      ADD CONSTRAINT questions_bank_status_check
      CHECK (bank_status IN ('legacy', 'validated_generated', 'approved', 'quarantined', 'validation_failed', 'rejected'))
  `);

  // Revert provenance columns
  pgm.sql('ALTER TABLE questions DROP COLUMN IF EXISTS validator_version');
  pgm.sql('ALTER TABLE questions DROP COLUMN IF EXISTS ai_model');
};
