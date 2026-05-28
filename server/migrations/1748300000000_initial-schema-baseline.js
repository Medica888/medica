/**
 * Baseline migration — schema already exists from schema.sql / db:init.
 * This entry marks the starting point for node-pg-migrate tracking so future
 * migrations can be applied incrementally without re-running schema.sql.
 *
 * Run ONCE on any database that was already initialised with `npm run db:init`.
 * Usage: npm run migrate
 */
exports.up = (_pgm) => {
  // No-op: tables were created by schema.sql.
};

exports.down = (_pgm) => {
  // No-op: use schema.sql for full teardown if needed.
};
