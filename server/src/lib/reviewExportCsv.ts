export const REVIEW_EXPORT_COLUMNS = [
  'externalId', 'subject', 'system', 'difficulty', 'bankStatus', 'reviewStatus', 'commercialReady',
  'readinessReasons', 'stem', 'options', 'correct', 'explanation', 'pearl', 'sourceRefs',
] as const;

type Row = Record<string, unknown>;

const FORMULA_LEADERS = /^[=+\-@\t\r]/;

/**
 * Encodes one CSV cell. Question text is partly AI-written and reviewers open the file in a
 * spreadsheet, so a leading = + - @ (or tab/CR) is prefixed with an apostrophe to stop it
 * being evaluated as a formula. Quotes, commas and newlines are RFC 4180 escaped.
 */
export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (FORMULA_LEADERS.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatOptions(options: unknown): string {
  if (!Array.isArray(options)) return '';
  return options
    .map((option) => {
      if (typeof option === 'string') return option;
      if (option && typeof option === 'object') {
        const { letter, text } = option as { letter?: unknown; text?: unknown };
        return `${letter == null ? '' : `${String(letter)}. `}${text == null ? '' : String(text)}`;
      }
      return '';
    })
    .filter(Boolean)
    .join(' | ');
}

function toCells(row: Row): unknown[] {
  const body = (row['body'] && typeof row['body'] === 'object' ? row['body'] : {}) as Row;
  const metadata = (row['reviewMetadata'] && typeof row['reviewMetadata'] === 'object' ? row['reviewMetadata'] : {}) as Row;
  const list = (value: unknown) => (Array.isArray(value) ? value.map(String).join('; ') : '');
  return [
    row['externalId'], row['subject'], row['system'], row['difficulty'], row['bankStatus'],
    metadata['reviewStatus'], row['commercialReady'] === true ? 'yes' : 'no', list(row['readinessReasons']),
    body['stem'], formatOptions(body['options']), body['correct'] ?? body['correctAnswer'],
    body['explanation'], body['pearl'], list(metadata['sourceRefs']),
  ];
}

/** Builds a CSV (header + one line per review row) for offline reviewers. */
export function buildReviewExportCsv(rows: Row[]): string {
  const lines = [REVIEW_EXPORT_COLUMNS.join(',')];
  for (const row of rows) lines.push(toCells(row).map(csvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
