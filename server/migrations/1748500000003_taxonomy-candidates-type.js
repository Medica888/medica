'use strict';

exports.up = (pgm) => {
  pgm.addColumns('taxonomy_candidates', {
    type: { type: 'text', notNull: true, default: 'topic' },
  });
  pgm.addConstraint(
    'taxonomy_candidates',
    'taxonomy_candidates_type_check',
    { check: "type IN ('topic', 'concept')" },
  );
};

exports.down = (pgm) => {
  pgm.dropConstraint('taxonomy_candidates', 'taxonomy_candidates_type_check', { ifExists: true });
  pgm.dropColumns('taxonomy_candidates', ['type']);
};
