/**
 * Phase 2 — Concept Graph Foundation
 *
 * Adds:
 *   concepts                — normalized concept registry with slug-based identity
 *   question_concepts       — weighted question→concept join table
 *   flashcards.question_ref_id — links flashcards to the normalized questions table
 *
 * Also adds missing performance indexes:
 *   questions(subject), questions(system)
 *   exam_session_questions(question_id)  — reverse lookup
 *   concepts indexes (slug, subject, system)
 *   question_concepts indexes (question_id, concept_id)
 *   flashcards(question_ref_id)
 *
 * Requires migration 001 to be applied first.
 * All table/index creates use ifNotExists — safe to re-run.
 */
exports.up = (pgm) => {
  // ── Concept registry ────────────────────────────────────────────────────────
  pgm.createTable(
    'concepts',
    {
      id:               { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      name:             { type: 'text', notNull: true },
      slug:             { type: 'text', notNull: true, unique: true },
      subject:          { type: 'text', notNull: true, default: '' },
      system:           { type: 'text', notNull: true, default: '' },
      parent_concept_id: {
        type: 'uuid',
        references: '"concepts"',
        onDelete: 'SET NULL',
      },
      difficulty:       { type: 'text', notNull: true, default: 'standard' },
      description:      { type: 'text', notNull: true, default: '' },
      created_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      updated_at:       { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { ifNotExists: true },
  );

  // ── Question → concept weighted join ────────────────────────────────────────
  pgm.createTable(
    'question_concepts',
    {
      question_id: {
        type: 'uuid',
        notNull: true,
        references: '"questions"',
        onDelete: 'CASCADE',
      },
      concept_id: {
        type: 'uuid',
        notNull: true,
        references: '"concepts"',
        onDelete: 'CASCADE',
      },
      weight: { type: 'numeric(4,2)', notNull: true, default: '1.00' },
    },
    {
      ifNotExists: true,
      constraints: { primaryKey: ['question_id', 'concept_id'] },
    },
  );

  // ── Flashcard → normalized question link ────────────────────────────────────
  pgm.addColumn('flashcards', {
    question_ref_id: {
      type: 'uuid',
      references: '"questions"',
      onDelete: 'SET NULL',
    },
  });

  // ── Concept table indexes ───────────────────────────────────────────────────
  pgm.createIndex('concepts', 'slug',    { name: 'concepts_slug_idx',    ifNotExists: true });
  pgm.createIndex('concepts', 'subject', { name: 'concepts_subject_idx', ifNotExists: true });
  pgm.createIndex('concepts', 'system',  { name: 'concepts_system_idx',  ifNotExists: true });

  // ── question_concepts join indexes ──────────────────────────────────────────
  pgm.createIndex('question_concepts', 'question_id', { name: 'qc_question_id_idx', ifNotExists: true });
  pgm.createIndex('question_concepts', 'concept_id',  { name: 'qc_concept_id_idx',  ifNotExists: true });

  // ── questions table — subject/system indexes (missed in migration 001) ──────
  pgm.createIndex('questions', 'subject', { name: 'questions_subject_idx', ifNotExists: true });
  pgm.createIndex('questions', 'system',  { name: 'questions_system_idx',  ifNotExists: true });

  // ── exam_session_questions — reverse lookup ─────────────────────────────────
  pgm.createIndex('exam_session_questions', 'question_id', { name: 'esq_question_id_idx', ifNotExists: true });

  // ── flashcard → question ref ────────────────────────────────────────────────
  pgm.createIndex('flashcards', 'question_ref_id', { name: 'flashcards_qref_idx', ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('flashcards', [],              { name: 'flashcards_qref_idx',    ifExists: true });
  pgm.dropIndex('exam_session_questions', [],  { name: 'esq_question_id_idx',    ifExists: true });
  pgm.dropIndex('questions', [],               { name: 'questions_system_idx',   ifExists: true });
  pgm.dropIndex('questions', [],               { name: 'questions_subject_idx',  ifExists: true });
  pgm.dropIndex('question_concepts', [],       { name: 'qc_concept_id_idx',      ifExists: true });
  pgm.dropIndex('question_concepts', [],       { name: 'qc_question_id_idx',     ifExists: true });
  pgm.dropIndex('concepts', [],                { name: 'concepts_system_idx',    ifExists: true });
  pgm.dropIndex('concepts', [],                { name: 'concepts_subject_idx',   ifExists: true });
  pgm.dropIndex('concepts', [],                { name: 'concepts_slug_idx',      ifExists: true });
  pgm.dropColumn('flashcards', 'question_ref_id');
  pgm.dropTable('question_concepts', { cascade: true });
  pgm.dropTable('concepts',          { cascade: true });
};
