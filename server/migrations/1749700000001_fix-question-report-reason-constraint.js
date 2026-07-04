/**
 * Replaces the legacy question report reason constraint with the complete set.
 *
 * An earlier migration added `qr_reason_check`, while the content-governance
 * migration replaced only `question_reports_reason_check`. Databases upgraded
 * through the full history therefore retained both constraints and rejected
 * the newer `duplicate` and `technical_issue` reasons.
 */
exports.up = (pgm) => {
  pgm.dropConstraint('question_reports', 'qr_reason_check', { ifExists: true });
  pgm.dropConstraint('question_reports', 'question_reports_reason_check', { ifExists: true });
  pgm.addConstraint('question_reports', 'question_reports_reason_check', {
    check: "reason IN ('wrong_answer', 'bad_explanation', 'off_topic', 'ambiguous_or_insufficient_clues', 'duplicate', 'technical_issue')",
  });
};

exports.down = (pgm) => {
  pgm.sql("UPDATE question_reports SET reason = 'bad_explanation' WHERE reason IN ('duplicate', 'technical_issue')");
  pgm.dropConstraint('question_reports', 'question_reports_reason_check', { ifExists: true });
  pgm.addConstraint('question_reports', 'qr_reason_check', {
    check: "reason IN ('wrong_answer', 'bad_explanation', 'off_topic', 'ambiguous_or_insufficient_clues')",
  });
};
