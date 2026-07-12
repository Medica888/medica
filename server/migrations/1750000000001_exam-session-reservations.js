/** @type {import('node-pg-migrate').MigrationBuilder} */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS exam_session_reservations (
      id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_session_id  UUID        NOT NULL,
      questions          JSONB       NOT NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, client_session_id)
    )
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS exam_session_reservations`);
};
