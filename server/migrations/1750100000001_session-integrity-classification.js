/**
 * Adds server-derived provenance/trust tracking for exam sessions:
 *
 * - exam_session_reservations.source distinguishes a reservation the server
 *   itself selected/generated the questions for ('server_issued') from one
 *   built from client-submitted question IDs that the server merely verified
 *   ('client_selected'). Existing rows predate this distinction and cannot be
 *   proven server-issued, so they backfill to the weaker 'client_selected'.
 *
 * - exam_sessions.integrity_status records how trustworthy the persisted
 *   question/answer set is, independent of score. Existing rows predate this
 *   column entirely and must not be inferred as verified from score/content
 *   alone, so they backfill to 'legacy_unverified'.
 *
 * - mastery_snapshots gets a uniqueness constraint so a retried snapshot
 *   (e.g. outbox/route retry after the fire-and-forget call in
 *   routes/exams.ts) cannot insert a duplicate row for the same
 *   (user, concept, session) — this was previously unconstrained.
 *
 * @type {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE exam_session_reservations
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'client_selected'
  `);
  pgm.sql(`
    ALTER TABLE exam_session_reservations
      ADD CONSTRAINT exam_session_reservations_source_check
      CHECK (source IN ('server_issued', 'client_selected'))
  `);

  pgm.sql(`
    ALTER TABLE exam_sessions
      ADD COLUMN IF NOT EXISTS integrity_status TEXT NOT NULL DEFAULT 'legacy_unverified'
  `);
  pgm.sql(`
    ALTER TABLE exam_sessions
      ADD CONSTRAINT exam_sessions_integrity_status_check
      CHECK (integrity_status IN ('server_issued', 'client_selected_verified', 'unverified_local', 'legacy_unverified'))
  `);

  // Any production instance has likely already accumulated duplicate
  // (user_id, concept_id, session_id) rows — takeSnapshot() was fired
  // fire-and-forget after every createSession() call, including idempotent
  // retries, with no constraint to stop it (the bug this migration fixes).
  // ADD CONSTRAINT would fail outright against existing duplicates, so they
  // must be collapsed first. Keeps the earliest row per tuple — same-batch
  // snapshots are near-identical, and created_at ordering preserves intent.
  pgm.sql(`
    DELETE FROM mastery_snapshots
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY user_id, concept_id, session_id ORDER BY created_at, id
        ) AS rn FROM mastery_snapshots
      ) ranked WHERE rn > 1
    )
  `);

  pgm.sql(`
    ALTER TABLE mastery_snapshots
      ADD CONSTRAINT mastery_snapshots_user_concept_session_unique
      UNIQUE (user_id, concept_id, session_id)
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE mastery_snapshots
      DROP CONSTRAINT IF EXISTS mastery_snapshots_user_concept_session_unique
  `);

  pgm.sql(`
    ALTER TABLE exam_sessions
      DROP CONSTRAINT IF EXISTS exam_sessions_integrity_status_check
  `);
  pgm.sql(`
    ALTER TABLE exam_sessions
      DROP COLUMN IF EXISTS integrity_status
  `);

  pgm.sql(`
    ALTER TABLE exam_session_reservations
      DROP CONSTRAINT IF EXISTS exam_session_reservations_source_check
  `);
  pgm.sql(`
    ALTER TABLE exam_session_reservations
      DROP COLUMN IF EXISTS source
  `);
};
