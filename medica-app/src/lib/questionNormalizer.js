import { ANSWER_LETTERS, getQuestionCorrectLetter, normalizeOptions } from './answerNormalize.js'

/**
 * Shuffles answer options randomly and updates correct + optionExplanations to match.
 * Call once per question when assembling a session - never call twice on the same question.
 *
 * @param {import('./quizTypes').QuizQuestion} question
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function shuffleQuestionOptions(question) {
  const opts = normalizeOptions(question.options).slice(0, ANSWER_LETTERS.length)

  // Fisher-Yates shuffle - each opt retains its original .letter for tracking
  const shuffled = [...opts]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  // Reassign labels to the new positions. Most questions are A-D; rare
  // imported/validated Step-style items may use E-L and must not be truncated.
  const newOptions = shuffled.map((opt, i) => ({
    letter: ANSWER_LETTERS[i],
    text: opt.text,
  }))

  // The correct answer moves to wherever the original correct option ended up.
  // If the original correct letter has no matching option, the question is
  // unwinnable - fail loudly instead of silently shipping a phantom answer.
  const originalCorrect = getQuestionCorrectLetter(question)
  const newCorrectIdx = shuffled.findIndex(opt => opt.letter === originalCorrect)
  if (newCorrectIdx < 0) {
    console.error(`[shuffleQuestionOptions] correct answer '${originalCorrect}' has no matching option for question ${question.id}`)
    throw Object.assign(
      new Error('This question could not be loaded. Please try again or choose a different question.'),
      { code: 'UNWINNABLE_QUESTION', questionId: question.id },
    )
  }
  const newCorrect = ANSWER_LETTERS[newCorrectIdx]

  // Remap optionExplanations: original letter -> new letter
  const oldExps = question.optionExplanations || {}
  const newOptionExplanations = {}
  shuffled.forEach((opt, i) => {
    const exp = oldExps[opt.letter]
    if (exp) newOptionExplanations[ANSWER_LETTERS[i]] = exp
  })

  return {
    ...question,
    options: newOptions,
    correct: newCorrect,
    optionExplanations: Object.keys(newOptionExplanations).length > 0 ? newOptionExplanations : oldExps,
  }
}
