'use strict';

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb
  `);

  pgm.sql(`
    UPDATE questions
    SET review_metadata = jsonb_strip_nulls(jsonb_build_object(
      'reviewStatus',
        CASE
          WHEN bank_status IN ('approved', 'restored', 'validated_generated') THEN 'validator_passed'
          WHEN bank_status = 'quarantined' THEN 'quarantined'
          WHEN bank_status = 'rejected' THEN 'rejected'
          ELSE 'unreviewed'
        END,
      'reviewedBy', NULL,
      'reviewerId', NULL,
      'reviewedAt', NULL,
      'reviewNotes', NULL,
      'reviewerDecision', NULL,
      'sourceRefs', COALESCE(body->'sourceRefs', '[]'::jsonb),
      'medicalAccuracyStatus', 'unknown',
      'itemWritingStatus', 'unknown',
      'difficultyCalibrationStatus', 'unknown',
      'contentVersion', COALESCE(body->'contentVersion', '1'::jsonb),
      'lastContentReviewedAt', NULL,
      'provenance', jsonb_build_object(
        'authorType',
          CASE
            WHEN source = 'ai' THEN 'ai'
            WHEN source = 'authored' THEN 'human'
            ELSE 'imported'
          END,
        'aiModel', ai_model,
        'validatorVersion', validator_version,
        'originalQuestionId', NULL
      )
    ))
    WHERE review_metadata = '{}'::jsonb
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS questions_review_status_expr_idx
      ON questions (bank_status)
      WHERE (review_metadata->>'reviewStatus') IN ('source_checked', 'expert_reviewed')
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS questions_review_status_expr_idx');
  pgm.sql('ALTER TABLE questions DROP COLUMN IF EXISTS review_metadata');
};
