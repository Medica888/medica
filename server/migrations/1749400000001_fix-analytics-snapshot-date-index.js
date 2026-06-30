/**
 * Corrective migration for analytics_snapshots.
 *
 * Two bugs compounded:
 *
 * 1. Migration 0003 tried to create a functional unique index on
 *    (user_id, (snapshot_date::date)) using node-pg-migrate's
 *    { name: 'column', expression: '...' } form. node-pg-migrate ignores
 *    the expression when name is also present, so it silently created a
 *    plain btree index on (user_id, snapshot_date) instead.
 *
 * 2. Even if node-pg-migrate had respected the expression, the cast
 *    snapshot_date::date on a TIMESTAMPTZ column is STABLE (timezone-
 *    dependent), not IMMUTABLE. PostgreSQL rejects STABLE expressions in
 *    functional indexes with error 42P17.
 *
 * Correct model: snapshot_date is a calendar date, not a point in time.
 * Storing it as DATE (no timezone) makes the unique constraint trivial:
 * (user_id, snapshot_date) with no expression — IMMUTABLE by definition.
 *
 * This migration:
 *   1. Drops the wrong plain index from migration 0003.
 *   2. Converts snapshot_date from TIMESTAMPTZ to DATE.
 *   3. Updates the column default to CURRENT_DATE.
 *   4. Creates the correct unique index on (user_id, snapshot_date).
 */
exports.up = (pgm) => {
  pgm.dropIndex('analytics_snapshots', [], {
    name: 'analytics_snapshots_user_date_uniq',
    ifExists: true,
  });
  pgm.sql(`
    ALTER TABLE analytics_snapshots
      ALTER COLUMN snapshot_date TYPE DATE
        USING (snapshot_date AT TIME ZONE 'UTC')::date,
      ALTER COLUMN snapshot_date SET DEFAULT CURRENT_DATE
  `);
  pgm.createIndex('analytics_snapshots', ['user_id', 'snapshot_date'], {
    name: 'analytics_snapshots_user_date_uniq',
    unique: true,
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('analytics_snapshots', [], {
    name: 'analytics_snapshots_user_date_uniq',
    ifExists: true,
  });
  pgm.sql(`
    ALTER TABLE analytics_snapshots
      ALTER COLUMN snapshot_date TYPE TIMESTAMPTZ
        USING snapshot_date::timestamptz,
      ALTER COLUMN snapshot_date SET DEFAULT NOW()
  `);
  pgm.createIndex('analytics_snapshots', ['user_id', 'snapshot_date'], {
    name: 'analytics_snapshots_user_date_uniq',
    unique: true,
    ifNotExists: true,
  });
};
