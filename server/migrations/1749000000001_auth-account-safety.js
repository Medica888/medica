'use strict';

exports.up = (pgm) => {
  // ── Extend users table ───────────────────────────────────────────────────
  pgm.addColumns('users', {
    email_verified: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    email_verified_at: {
      type: 'timestamptz',
      notNull: false,
    },
    deleted_at: {
      type: 'timestamptz',
      notNull: false,
    },
  });

  // ── Auth tokens table (password reset + email verification) ──────────────
  pgm.createTable('auth_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'CASCADE',
    },
    token_hash: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    type: {
      type: 'text',
      notNull: true,
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
    },
    used_at: {
      type: 'timestamptz',
      notNull: false,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  }, { ifNotExists: true });

  pgm.addConstraint('auth_tokens', 'auth_tokens_type_check', {
    check: "type IN ('password_reset', 'email_verification')",
  });

  pgm.createIndex('auth_tokens', ['user_id', 'type'], {
    name: 'auth_tokens_user_type_idx',
    ifNotExists: true,
  });

  pgm.createIndex('auth_tokens', ['expires_at'], {
    name: 'auth_tokens_expires_idx',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('auth_tokens', [], { name: 'auth_tokens_expires_idx', ifExists: true });
  pgm.dropIndex('auth_tokens', [], { name: 'auth_tokens_user_type_idx', ifExists: true });
  pgm.dropConstraint('auth_tokens', 'auth_tokens_type_check', { ifExists: true });
  pgm.dropTable('auth_tokens', { ifExists: true });
  pgm.dropColumns('users', ['email_verified', 'email_verified_at', 'deleted_at'], { ifExists: true });
};
