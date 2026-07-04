/**
 * Content fingerprint for a question, used to cross-reference question_reports.fingerprint
 * (which quality/quarantine thresholds are computed against — see QuestionReportService)
 * against catalog rows. Mirrors medica-app/src/lib/questionDedup.js's getQuestionFingerprint.
 */
export function computeQuestionFingerprint(stem: unknown, testedConcept: unknown): string {
  const normStem = String(stem || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const normConcept = String(testedConcept || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${normStem}||${normConcept}`;
}
