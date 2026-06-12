'use strict';

exports.up = (pgm) => {
  pgm.createTable('taxonomy_candidates', {
    id:                           { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    raw_label_key:                { type: 'text', notNull: true, unique: true },
    raw_label:                    { type: 'text', notNull: true },
    normalized_guess:             { type: 'text', notNull: true },
    subject:                      { type: 'text', notNull: true, default: '' },
    system:                       { type: 'text', notNull: true, default: '' },
    frequency:                    { type: 'integer', notNull: true, default: 1 },
    example_question_fingerprint: { type: 'text', notNull: false },
    source:                       { type: 'text', notNull: true, default: 'unknown_topic' },
    status:                       { type: 'text', notNull: true, default: 'pending' },
    metadata:                     { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    created_at:                   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at:                   { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at:                 { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  }, { ifNotExists: true });

  pgm.addConstraint('taxonomy_candidates', 'taxonomy_candidates_status_check', {
    check: "status IN ('pending', 'approved_canonical', 'mapped_alias', 'rejected')",
  });

  pgm.createIndex('taxonomy_candidates', ['status', 'frequency'], {
    name: 'taxonomy_candidates_status_frequency_idx',
    ifNotExists: true,
  });
  pgm.createIndex('taxonomy_candidates', ['last_seen_at'], {
    name: 'taxonomy_candidates_last_seen_idx',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('taxonomy_candidates', [], { name: 'taxonomy_candidates_last_seen_idx', ifExists: true });
  pgm.dropIndex('taxonomy_candidates', [], { name: 'taxonomy_candidates_status_frequency_idx', ifExists: true });
  pgm.dropConstraint('taxonomy_candidates', 'taxonomy_candidates_status_check', { ifExists: true });
  pgm.dropTable('taxonomy_candidates', { ifExists: true });
};
