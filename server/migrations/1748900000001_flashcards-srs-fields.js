/**
 * v9.1.0 — Add interval and next_review to flashcards for real SRS scheduling.
 * interval: days until next review (0 = due immediately for 'again' cards).
 * next_review: absolute timestamp when the card should next appear in review.
 */
exports.up = async (pgm) => {
  pgm.addColumns('flashcards', {
    interval_days: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    next_review: {
      type: 'timestamptz',
      notNull: false,
    },
  });
};

exports.down = async (pgm) => {
  pgm.dropColumns('flashcards', ['interval_days', 'next_review'], { ifExists: true });
};
