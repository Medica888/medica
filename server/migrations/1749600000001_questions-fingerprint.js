'use strict';

/**
 * Adds a precomputed content fingerprint column to `questions`, so the QBank catalog
 * can exclude cross-user quarantined content (question_reports.fingerprint) with a
 * simple string comparison at the SQL layer — no need to replicate the JS fingerprint
 * normalization algorithm in SQL, which would risk drifting from the client's version.
 */
exports.up = (pgm) => {
  pgm.addColumn('questions', {
    fingerprint: { type: 'text', notNull: true, default: '' },
  });
  pgm.createIndex('questions', 'fingerprint', { ifNotExists: true });
};

exports.down = (pgm) => {
  pgm.dropIndex('questions', 'fingerprint', { ifExists: true });
  pgm.dropColumn('questions', 'fingerprint');
};
