const LETTERS = ['A', 'B', 'C', 'D']

// Accepts: "A" | "a" | "A. Furosemide" | 0 | 1 | 2 | 3 | null | undefined → "A"–"D" | ""
export function normalizeAnswerLetter(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return LETTERS[value] || ''
  const raw = String(value).trim()
  const letter = raw[0]?.toUpperCase() ?? ''
  return LETTERS.includes(letter) ? letter : ''
}

// Normalizes mixed option shapes → [{letter, text}], A-D only, max 4
// Supports: {letter,text} | {id,text} with string or numeric id | "A. text" strings
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

export function getCorrectLetter(question) {
  return normalizeAnswerLetter(question.correctAnswer ?? question.correct)
}

export function getUserLetter(value) {
  return normalizeAnswerLetter(value)
}

export function getCorrectOption(question) {
  const opts = normalizeOptions(question.options)
  const letter = getCorrectLetter(question)
  return opts.find(o => o.letter === letter) ?? null
}

export function getChosenOption(question, userAnswer) {
  const opts = normalizeOptions(question.options)
  const letter = getUserLetter(userAnswer)
  return letter ? opts.find(o => o.letter === letter) ?? null : null
}

export function isQuestionAnswered(userAnswer) {
  return getUserLetter(userAnswer) !== ''
}

export function isQuestionCorrect(question, userAnswer) {
  if (!isQuestionAnswered(userAnswer)) return false
  return getUserLetter(userAnswer) === getCorrectLetter(question)
}

// Returns 'correct' | 'wrong' | 'skipped'
export function getQuestionResult(question, userAnswer) {
  if (!isQuestionAnswered(userAnswer)) return 'skipped'
  if (isQuestionCorrect(question, userAnswer)) return 'correct'
  return 'wrong'
}
