/**
 * Adds a case-insensitive unique index on users.email so that duplicate
 * registrations with different casing (e.g. User@Example.com vs user@example.com)
 * are rejected at the database level.
 *
 * The application already normalizes email to lowercase before INSERT and lookup,
 * but this constraint is the safety net for any path that bypasses the service layer.
 */
exports.up = (pgm) => {
  pgm.createIndex('users', [{ name: 'email', expression: 'LOWER(email)' }], {
    name: 'users_email_lower_unique',
    unique: true,
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('users', [], { name: 'users_email_lower_unique', ifExists: true });
};
