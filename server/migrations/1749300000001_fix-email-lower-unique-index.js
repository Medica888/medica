/**
 * Corrective migration: the original users_email_lower_unique index was created
 * with `{ name: 'email', expression: 'LOWER(email)' }` in node-pg-migrate, which
 * ignored the expression field and produced a plain btree(email) index — not a
 * functional index on LOWER(email). This migration replaces it with the correct
 * functional index so case-insensitive uniqueness is enforced at the DB level.
 */
exports.up = (pgm) => {
  pgm.dropIndex('users', [], { name: 'users_email_lower_unique', ifExists: true });
  pgm.sql('CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email))');
};

exports.down = (pgm) => {
  pgm.dropIndex('users', [], { name: 'users_email_lower_unique', ifExists: true });
  pgm.createIndex('users', ['email'], { name: 'users_email_lower_unique', unique: true, ifNotExists: true });
};
