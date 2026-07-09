export const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
const LETTERS = ANSWER_LETTERS

/**
 * Coerces common answer representations to a single uppercase Step-style letter.
 * Medica supports A-L because USMLE/NBME-style items may use more than four choices.
 */
export function normalizeAnswerLetter(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return LETTERS[value] || ''
  const raw = String(value).trim()
  const letter = raw[0]?.toUpperCase() ?? ''
  return LETTERS.includes(letter) ? letter : ''
}

/**
 * Normalizes mixed option shapes into [{ letter, text }].
 * Supports: { letter, text }, { id, text } with string or numeric id, and "A. text" strings.
 * Returns [] if options are absent or malformed; never throws.
 */
export function normalizeOptions(options) {
  if (!Array.isArray(options)) return []
  return options.flatMap(opt => {
    if (opt === null || opt === undefined) return []
    if (typeof opt === 'string') {
      const m = opt.match(/^([A-La-l])[.\s]\s*(.+)/)
      return m ? [{ letter: m[1].toUpperCase(), text: m[2].trim() }] : []
    }
    const rawId =
      opt.letter !== undefined && opt.letter !== null
        ? opt.letter
        : opt.id !== undefined && opt.id !== null
          ? opt.id
          : ''
    const letter = normalizeAnswerLetter(rawId)
    const text = (opt.text ?? opt.label ?? '').toString()
    return LETTERS.includes(letter) ? [{ letter, text }] : []
  }).filter(o => LETTERS.includes(o.letter))
}

/**
 * Picks the first present value. null, undefined, and '' count as absent, so a
 * legitimate falsy value like 0 (option A by numeric index) is not skipped.
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
