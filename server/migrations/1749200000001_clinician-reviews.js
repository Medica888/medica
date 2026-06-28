/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS clinician_reviews (
      id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      question_id          TEXT        NOT NULL,
      review_priority      TEXT        NOT NULL
                           CHECK (review_priority IN ('critical', 'high', 'medium', 'low')),
      review_reason        TEXT        NOT NULL,
      review_due_at        TIMESTAMPTZ NOT NULL,
      review_status        TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (review_status IN ('pending', 'in_review', 'approved', 'changes_requested', 'rejected')),
      assigned_reviewer_id TEXT,
      assigned_at          TIMESTAMPTZ,
      reviewed_at          TIMESTAMPTZ,
      reviewer_notes       TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  pgm.sql(`CREATE INDEX IF NOT EXISTS clinician_reviews_question_id_idx ON clinician_reviews (question_id)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS clinician_reviews_status_due_idx  ON clinician_reviews (review_status, review_due_at)`);
  pgm.sql(`CREATE INDEX IF NOT EXISTS clinician_reviews_active_priority_idx ON clinician_reviews (review_priority, review_due_at) WHERE review_status IN ('pending', 'in_review')`);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS clinician_reviews`);
};
