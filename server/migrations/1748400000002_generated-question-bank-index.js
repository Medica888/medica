/**
 * Adds a focused lookup index for reusable AI-generated questions.
 *
 * Generated-bank reuse filters questions by JSON metadata stored in questions.body
 * plus subject/system columns. Without expression indexes, PostgreSQL must scan
 * more rows as the generated bank grows.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS questions_generated_bank_lookup_idx
    ON questions (
      (body->>'source'),
      (body->>'bankStatus'),
      (body->>'mode'),
      (body->>'difficulty'),
      subject,
      system,
      created_at DESC
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS questions_generated_bank_lookup_idx');
};
