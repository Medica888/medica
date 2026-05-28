/**
 * Adds a unique constraint on analytics_snapshots (user_id, snapshot_date::date)
 * so that at most one snapshot is stored per user per calendar day.
 *
 * This enables the PgAnalyticsRepository to use INSERT ... ON CONFLICT DO UPDATE
 * instead of a race-prone find-then-insert/update pattern.
 *
 * NOTE: The conflict target in the application query uses the expression
 *   ON CONFLICT (user_id, (snapshot_date::date))
 * which must match this index definition exactly.
 */
exports.up = (pgm) => {
  pgm.createIndex(
    'analytics_snapshots',
    ['user_id', { name: 'snapshot_date', expression: '(snapshot_date::date)' }],
    {
      name: 'analytics_snapshots_user_date_uniq',
      unique: true,
      ifNotExists: true,
    },
  );
};

exports.down = (pgm) => {
  pgm.dropIndex('analytics_snapshots', [], {
    name: 'analytics_snapshots_user_date_uniq',
    ifExists: true,
  });
};
