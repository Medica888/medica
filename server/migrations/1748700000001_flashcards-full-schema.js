'use strict';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.addColumns('flashcards', {
    subject:                { type: 'text', notNull: true, default: '' },
    system:                 { type: 'text', notNull: true, default: '' },
    topic:                  { type: 'text', notNull: true, default: '' },
    canonical_topic:        { type: 'text', notNull: true, default: '' },
    topic_slug:             { type: 'text', notNull: true, default: '' },
    source_mode:            { type: 'text', notNull: true, default: '' },
    memory_anchor:          { type: 'text' },
    common_trap:            { type: 'text' },
    source_pearl:           { type: 'text' },
    weak_spot_category:     { type: 'text', notNull: true, default: '' },
    reinforcement_priority: { type: 'text', notNull: true, default: 'normal' },
    review_count:           { type: 'integer', notNull: true, default: 0 },
    ease:                   { type: 'text' },
    last_missed_reason:     { type: 'text' },
  });
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.dropColumns('flashcards', [
    'subject', 'system', 'topic', 'canonical_topic', 'topic_slug', 'source_mode',
    'memory_anchor', 'common_trap', 'source_pearl', 'weak_spot_category',
    'reinforcement_priority', 'review_count', 'ease', 'last_missed_reason',
  ], { ifExists: true });
};
