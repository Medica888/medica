/**
 * Phase 3 — User Concept Mastery
 *
 * Adds:
 *   user_concept_mastery — per-user, per-concept attempt/correct counters
 *                          with stored mastery_score, confidence_score,
 *                          and recent_incorrect_count.
 *
 * Columns:
 *   attempts              total questions answered for this concept
 *   correct               total correct answers
 *   mastery_score         correct / attempts, 4dp
 *   confidence_score      LEAST(attempts / 5, 1.0) — saturates at 5 attempts
 *   recent_incorrect_count attempts - correct (total wrong; windowing deferred to Phase 3.x)
 *   last_seen_at          timestamp of most recent attempt
 *
 * Scope constraints:
 *   - Stores direct question_concepts links only.
 *   - No hierarchy roll-up, no concept_edges.
 *   - All scores recomputed atomically by the upsert.
 *
 * Requires migrations 001 and 005 to be applied first.
 * All creates use ifNotExists — safe to re-run.
 */
exports.up = (pgm) => {
  pgm.createTable(
    'user_concept_mastery',
    {
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
      attempts:               { type: 'integer',      notNull: true, default: 0     },
      correct:                { type: 'integer',      notNull: true, default: 0     },
      mastery_score:          { type: 'numeric(5,4)', notNull: true, default: '0'   },
      confidence_score:       { type: 'numeric(5,4)', notNull: true, default: '0'   },
      recent_incorrect_count: { type: 'integer',      notNull: true, default: 0     },
      last_seen_at:           { type: 'timestamptz',  notNull: true, default: pgm.func('now()') },
      created_at:             { type: 'timestamptz',  notNull: true, default: pgm.func('now()') },
      updated_at:             { type: 'timestamptz',  notNull: true, default: pgm.func('now()') },
    },
    {
      ifNotExists: true,
      constraints: { primaryKey: ['user_id', 'concept_id'] },
    },
  );

  pgm.createIndex('user_concept_mastery', 'user_id',    { name: 'ucm_user_id_idx',    ifNotExists: true });
  pgm.createIndex('user_concept_mastery', 'concept_id', { name: 'ucm_concept_id_idx', ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('user_concept_mastery', [], { name: 'ucm_concept_id_idx', ifExists: true });
  pgm.dropIndex('user_concept_mastery', [], { name: 'ucm_user_id_idx',    ifExists: true });
  pgm.dropTable('user_concept_mastery', { ifExists: true });
};
