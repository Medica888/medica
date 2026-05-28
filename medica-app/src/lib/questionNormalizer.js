const VALID_LETTERS = ['A', 'B', 'C', 'D']

/**
 * Shuffles answer options randomly and updates correct + optionExplanations to match.
 * Call once per question when assembling a session — never call twice on the same question.
 *
 * @param {import('./quizTypes').QuizQuestion} question
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function shuffleQuestionOptions(question) {
  const opts = question.options.slice(0, 4)

  // Fisher-Yates shuffle — each opt retains its original .letter for tracking
  const shuffled = [...opts]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Reassign labels A-D to the new positions
  const newOptions = shuffled.map((opt, i) => ({
    letter: VALID_LETTERS[i],
    text: opt.text,
  }))

  // The correct answer moves to wherever the original correct option ended up
  const newCorrectIdx = shuffled.findIndex(opt => opt.letter === question.correct)
  const newCorrect = newCorrectIdx >= 0 ? VALID_LETTERS[newCorrectIdx] : question.correct

  // Remap optionExplanations: original letter → new letter
  const oldExps = question.optionExplanations || {}
  const newOptionExplanations = {}
  shuffled.forEach((opt, i) => {
    const exp = oldExps[opt.letter]
    if (exp) newOptionExplanations[VALID_LETTERS[i]] = exp
  })

  return {
    ...question,
    options: newOptions,
    correct: newCorrect,
    optionExplanations: Object.keys(newOptionExplanations).length > 0 ? newOptionExplanations : oldExps,
  }
}

/**
 * Normalizes a raw AI-output question to the internal QuizQuestion format.
 * Handles both string options ("A. text") and object options ({id/letter, text}).
 * Enforces exactly 4 options labeled A-D and a valid correct letter.
 *
 * @param {object} q - Raw question from AI or any source
 * @param {number} [index=0] - Fallback index for generating IDs
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function normalizeQuestion(q, index = 0) {
  const rawOpts = Array.isArray(q.options) ? q.options : []

  const opts = rawOpts.slice(0, 4).map((o, i) => {
    let text = ''
    if (typeof o === 'string') {
      text = o.replace(/^[A-D]\.\s*/, '').trim()
    } else if (o && typeof o === 'object') {
      text = (o.text || o.content || '').trim()
    }
    return { letter: VALID_LETTERS[i], text }
  })

  while (opts.length < 4) {
    opts.push({ letter: VALID_LETTERS[opts.length], text: '' })
  }

  let correct = q.correct ?? q.correctAnswer ?? null
  if (typeof correct === 'number') correct = VALID_LETTERS[correct] ?? 'A'
  if (typeof correct === 'string') correct = correct.trim().toUpperCase().charAt(0)
  if (!VALID_LETTERS.includes(correct)) correct = 'A'

  return {
    id: q.id != null ? String(q.id) : `q${index + 1}`,
    subject: q.subject || '',
    system: q.system || '',
    topic: q.topic || '',
    difficulty: q.difficulty || '',
    testedConcept: q.testedConcept || q.tested_concept || '',
    weakSpotCategory: q.weakSpotCategory || q.weak_spot_category || '',
    stem: (q.stem || '').trim(),
    options: opts,
    correct,
    explanation: (q.explanation || '').trim(),
    pearl: q.pearl || q.highYieldPearl || q.high_yield_pearl || '',
    memoryAnchor: q.memoryAnchor || q.memory_anchor || '',
    commonTrap: q.commonTrap || q.common_trap || '',
    optionExplanations: q.optionExplanations || {},
  }
}

/**
 * Returns true if a normalized question is structurally valid for rendering.
 *
 * @param {object} q
 * @returns {boolean}
 */
export function validateNormalizedQuestion(q) {
  if (!q.stem?.trim()) return false
  if (!Array.isArray(q.options) || q.options.length !== 4) return false
  if (q.options.some((o, i) => o.letter !== VALID_LETTERS[i] || !o.text?.trim())) return false
  if (!VALID_LETTERS.includes(q.correct)) return false
  return true
}

/**
 * Strips markdown code fences and extracts the outermost JSON object.
 * Safe-only: never modifies content inside strings.
 *
 * @param {string} text
 * @returns {string}
 */
export function repairJSONString(text) {
  let s = text.trim()
  s = s.replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '')
  s = s.trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end > start) s = s.slice(start, end + 1)
  return s
}
