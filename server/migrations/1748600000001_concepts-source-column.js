'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async function (pgm) {
  pgm.addColumn('concepts', {
    source: {
      type: 'text',
      notNull: true,
      default: 'legacy',
    },
  });

  pgm.addConstraint(
    'concepts',
    'concepts_source_check',
    "CHECK (source IN ('legacy', 'canonical'))",
  );

  pgm.createIndex('concepts', 'source', {
    name: 'concepts_source_idx',
    ifNotExists: true,
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = async function (pgm) {
  pgm.dropIndex('concepts', 'source', {
    name: 'concepts_source_idx',
    ifExists: true,
  });

  pgm.dropConstraint('concepts', 'concepts_source_check');

  pgm.dropColumn('concepts', 'source');
};
