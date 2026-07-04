const LETTERS = ['A', 'B', 'C', 'D']

/**
 * Coerces any answer representation to a single uppercase letter A–D, or '' if invalid.
 * Handles: "A" | "a" | "A. text" | 0 | 1 | 2 | 3 | null | undefined
 */
export function normalizeAnswerLetter(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return LETTERS[value] || ''
  const raw = String(value).trim()
  const letter = raw[0]?.toUpperCase() ?? ''
  return LETTERS.includes(letter) ? letter : ''
}

/**
 * Normalizes mixed option shapes → [{letter, text}], A–D only, max 4.
 * Supports: {letter,text} | {id,text} with string or numeric id | "A. text" strings.
 * Returns [] if options is absent or malformed — never throws.
 */
export function normalizeOptions(options) {
  if (!Array.isArray(options)) return []
  return options.flatMap(opt => {
    if (typeof opt === 'string') {
      const m = opt.match(/^([A-Da-d])[.\s]\s*(.+)/)
      return m ? [{ letter: m[1].toUpperCase(), text: m[2].trim() }] : []
    }
    const rawId =
      opt.letter !== undefined && opt.letter !== null
        ? opt.letter
        : opt.id !== undefined && opt.id !== null
          ? opt.id
          : ''
    const letter = normalizeAnswerLetter(rawId)
    const text   = (opt.text ?? opt.label ?? '').toString()
    return LETTERS.includes(letter) ? [{ letter, text }] : []
  }).filter(o => LETTERS.includes(o.letter)).slice(0, 4)
}

/**
 * Picks the first "present" value — null/undefined/'' all count as absent — so a
 * legitimate falsy value like 0 (option A by numeric index) isn't skipped by `||`.
 */
function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

/**
 * Normalizes a question's correct answer field.
 * Prefer canonical `correct`; fall back to `correctAnswer`, then `correct_answer`.
 */
export function getQuestionCorrectLetter(question) {
  return normalizeAnswerLetter(
    firstPresent(question?.correct, question?.correctAnswer, question?.correct_answer),
  )
}
