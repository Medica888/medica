import { describe, it, expect } from 'vitest';
import { buildReviewExportCsv, csvCell, REVIEW_EXPORT_COLUMNS } from './reviewExportCsv.js';

describe('csvCell', () => {
  it.each(['=HYPERLINK("http://evil","x")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd', '\rcmd'])(
    'neutralizes the formula leader in %j',
    (value) => {
      expect(csvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
    },
  );

  it('escapes quotes, commas and newlines per RFC 4180', () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders null and undefined as empty and leaves plain text alone', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell('Plain text')).toBe('Plain text');
    expect(csvCell(42)).toBe('42');
  });

  it('does not prefix a hyphen that is not leading', () => {
    expect(csvCell('B-cell lymphoma')).toBe('B-cell lymphoma');
  });
});

describe('buildReviewExportCsv', () => {
  const row = {
    externalId: 'qX001', subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced',
    bankStatus: 'approved', commercialReady: false, readinessReasons: ['missing_source_refs', 'needs_source_or_expert_review'],
    reviewMetadata: { reviewStatus: 'unreviewed', sourceRefs: [] },
    body: {
      stem: 'A 60-year-old man, "dyspneic", on exertion.\nWhich drug?',
      options: [{ letter: 'A', text: 'ARNI' }, { letter: 'B', text: '=Thiazide' }],
      correct: 'A', explanation: 'ARNI reduces mortality.', pearl: 'HFrEF',
    },
  };

  it('starts with the documented header', () => {
    expect(buildReviewExportCsv([]).split('\r\n')[0]).toBe(REVIEW_EXPORT_COLUMNS.join(','));
  });

  it('writes one escaped record per row with options, readiness and blockers', () => {
    const csv = buildReviewExportCsv([row]);
    expect(csv).toContain('qX001,Pharmacology,Cardiovascular,Balanced,approved,unreviewed,no,missing_source_refs; needs_source_or_expert_review,');
    expect(csv).toContain(',A. ARNI | B. =Thiazide,A,');
    expect(csv).toContain('"A 60-year-old man, ""dyspneic"", on exertion.\nWhich drug?"');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('accepts string options and a missing body without throwing', () => {
    const csv = buildReviewExportCsv([
      { externalId: 'a', body: { options: ['A. one', 'B. two'], correctAnswer: 'B' } },
      { externalId: 'b' },
    ]);
    expect(csv).toContain('A. one | B. two,B');
    expect(csv.trimEnd().split('\r\n')).toHaveLength(3);
  });
});
