/**
 * Adds first-class lifecycle metadata for generated question bank entries.
 *
 * The full question body remains in questions.body, but generated-bank lookup,
 * status filtering, and reuse tracking should use real columns so the bank is
 * queryable, indexable, and auditable as it grows.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE questions
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'unknown',
      ADD COLUMN IF NOT EXISTS bank_status TEXT NOT NULL DEFAULT 'legacy',
      ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS validation_score INTEGER,
      ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS usage_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS report_count INTEGER NOT NULL DEFAULT 0
  `);

  pgm.sql(`
    ALTER TABLE questions
      DROP CONSTRAINT IF EXISTS questions_bank_status_check
  `);

  pgm.sql(`
    ALTER TABLE questions
      ADD CONSTRAINT questions_bank_status_check
      CHECK (bank_status IN ('legacy', 'validated_generated', 'approved', 'quarantined'))
  `);

  pgm.sql(`
    UPDATE questions
    SET source = COALESCE(NULLIF(body->>'source', ''), source),
        bank_status = CASE
          WHEN body->>'bankStatus' IN ('validated_generated', 'approved', 'quarantined')
            THEN body->>'bankStatus'
          ELSE bank_status
        END,
        mode = COALESCE(NULLIF(body->>'mode', ''), mode),
        difficulty = COALESCE(NULLIF(body->>'difficulty', ''), difficulty),
        validation_status = COALESCE(NULLIF(body->>'validationStatus', ''), validation_status),
        validation_score = CASE
          WHEN body->>'validationScore' ~ '^-?[0-9]+$'
            THEN (body->>'validationScore')::integer
          ELSE validation_score
        END,
        validated_at = CASE
          WHEN body->>'validatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
            THEN (body->>'validatedAt')::timestamptz
          ELSE validated_at
        END,
        subject = CASE
          WHEN subject IN ('Anatomy', 'Physiology', 'Pathology', 'Pharmacology', 'Biochemistry', 'Genetics', 'Microbiology', 'Immunology', 'Behavioral Science', 'Biostatistics', 'Ethics')
            THEN subject
          WHEN subject IN ('Behavioral Health', 'Behavioral Sciences', 'Psychology')
            THEN 'Behavioral Science'
          WHEN subject IN ('Epidemiology', 'Population Health', 'Biostatistics Epidemiology Population Health')
            THEN 'Biostatistics'
          WHEN subject IN ('Professionalism')
            THEN 'Ethics'
          WHEN subject IN ('Pathophysiology', 'Disease Mechanism')
            THEN 'Pathology'
          WHEN subject IN ('Pharm')
            THEN 'Pharmacology'
          WHEN subject IN ('Biochem')
            THEN 'Biochemistry'
          WHEN subject IN ('Micro')
            THEN 'Microbiology'
          WHEN subject IN ('Immuno')
            THEN 'Immunology'
          WHEN subject IN ('Cardiology', 'Cardio', 'Cardiac', 'Nephrology', 'Renal', 'Kidney', 'Neuroscience', 'Neuro', 'Endocrinology', 'Skin', 'Derm', 'Dermatology')
            THEN ''
          ELSE subject
        END,
        system = CASE
          WHEN system IN ('Cardiovascular', 'Respiratory', 'Renal / Urinary', 'Gastrointestinal', 'Endocrine', 'Reproductive', 'Neurology', 'Psychiatry', 'Musculoskeletal', 'Dermatology', 'Hematology', 'Oncology', 'Immunology', 'Infectious Disease', 'Multisystem')
            THEN system
          WHEN system IN ('Cardio', 'Cardiology', 'Cardiac', 'Heart', 'Vascular', 'Cardiovascular System')
            THEN 'Cardiovascular'
          WHEN system IN ('Pulmonary', 'Lung', 'Respiratory System')
            THEN 'Respiratory'
          WHEN system IN ('Renal', 'Kidney', 'Nephrology', 'Urinary', 'Renal Urinary', 'Renal Urinary System', 'Renal and Urinary System', 'Renal & Urinary System')
            THEN 'Renal / Urinary'
          WHEN system IN ('GI', 'Digestive', 'Gastrointestinal System')
            THEN 'Gastrointestinal'
          WHEN system IN ('Endocrinology', 'Endocrine System')
            THEN 'Endocrine'
          WHEN system IN ('OB', 'Obstetrics', 'Gynecology', 'Reproductive System')
            THEN 'Reproductive'
          WHEN system IN ('Neuro', 'Nervous System', 'Neuroscience', 'Neurological', 'Nervous System and Special Senses', 'Nervous System & Special Senses', 'Nervous System Special Senses')
            THEN 'Neurology'
          WHEN system IN ('Psych', 'Psychology', 'Behavioral Health', 'Mental Health')
            THEN 'Psychiatry'
          WHEN system IN ('MSK', 'Musculoskeletal System')
            THEN 'Musculoskeletal'
          WHEN system IN ('Derm', 'Skin', 'Skin and Subcutaneous Tissue', 'Skin & Subcutaneous Tissue', 'Skin Subcutaneous Tissue')
            THEN 'Dermatology'
          WHEN system IN ('Heme', 'Blood', 'Blood and Lymphoreticular', 'Blood & Lymphoreticular System', 'Blood Lymphoreticular', 'Blood Lymphoreticular System', 'Lymph')
            THEN 'Hematology'
          WHEN system IN ('Cancer', 'Neoplasia')
            THEN 'Oncology'
          WHEN system IN ('Immune', 'Immune System')
            THEN 'Immunology'
          WHEN system IN ('ID', 'Infection', 'Infectious', 'Infectious Diseases')
            THEN 'Infectious Disease'
          WHEN system IN ('General', 'Mixed', 'General Principles', 'Multisystem Processes', 'Multisystem Processes and Disorders', 'Human Development', 'Development')
            THEN 'Multisystem'
          ELSE system
        END
    WHERE body->>'source' = 'ai'
       OR body->>'bankStatus' IN ('validated_generated', 'approved', 'quarantined')
  `);

  pgm.sql(`
    CREATE INDEX IF NOT EXISTS questions_generated_bank_columns_idx
    ON questions (
      source,
      bank_status,
      mode,
      difficulty,
      subject,
      system,
      created_at DESC
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS questions_generated_bank_columns_idx');
  pgm.sql('ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_bank_status_check');
  pgm.sql(`
    ALTER TABLE questions
      DROP COLUMN IF EXISTS report_count,
      DROP COLUMN IF EXISTS usage_count,
      DROP COLUMN IF EXISTS last_used_at,
      DROP COLUMN IF EXISTS validated_at,
      DROP COLUMN IF EXISTS validation_score,
      DROP COLUMN IF EXISTS validation_status,
      DROP COLUMN IF EXISTS difficulty,
      DROP COLUMN IF EXISTS mode,
      DROP COLUMN IF EXISTS bank_status,
      DROP COLUMN IF EXISTS source
  `);
};
