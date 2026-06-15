'use strict';

exports.up = (pgm) => {
  pgm.sql('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_bank_status_check');
  pgm.sql(`
    ALTER TABLE questions
      ADD CONSTRAINT questions_bank_status_check
      CHECK (bank_status IN ('legacy', 'validated_generated', 'approved', 'quarantined', 'validation_failed', 'rejected'))
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    UPDATE questions
    SET bank_status = 'quarantined',
        body = jsonb_set(body, '{bankStatus}', to_jsonb('quarantined'::text), true)
    WHERE bank_status IN ('validation_failed', 'rejected')
  `);
  pgm.sql('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_bank_status_check');
  pgm.sql(`
    ALTER TABLE questions
      ADD CONSTRAINT questions_bank_status_check
      CHECK (bank_status IN ('legacy', 'validated_generated', 'approved', 'quarantined'))
  `);
};
