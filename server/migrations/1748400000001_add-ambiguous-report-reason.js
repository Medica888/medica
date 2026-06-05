/**
 * Phase 6.1 — Adds 'ambiguous_or_insufficient_clues' to the question_reports reason constraint.
 * The column is TEXT so no structural change is needed — only the CHECK constraint changes.
 */
exports.up = (pgm) => {
  pgm.dropConstraint('question_reports', 'qr_reason_check', { ifExists: true });
  pgm.addConstraint('question_reports', 'qr_reason_check', {
    check: "reason IN ('wrong_answer', 'bad_explanation', 'off_topic', 'ambiguous_or_insufficient_clues')",
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('question_reports', 'qr_reason_check', { ifExists: true });
  pgm.addConstraint('question_reports', 'qr_reason_check', {
    check: "reason IN ('wrong_answer', 'bad_explanation', 'off_topic')",
  });
};
