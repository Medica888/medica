/**
 * Adds indexes that analytics and flashcard queries need for acceptable performance
 * as data grows. These were missing from the initial schema.
 */
exports.up = (pgm) => {
  // Analytics joins question_attempts by question_id (currently a free-form TEXT)
  pgm.createIndex('question_attempts', 'question_id', {
    name: 'question_attempts_question_id_idx',
    ifNotExists: true,
  });

  // Flashcard deduplication and source tracing
  pgm.createIndex('flashcards', 'source_question_id', {
    name: 'flashcards_source_question_id_idx',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('question_attempts', [], {
    name: 'question_attempts_question_id_idx',
    ifExists: true,
  });
  pgm.dropIndex('flashcards', [], {
    name: 'flashcards_source_question_id_idx',
    ifExists: true,
  });
};
