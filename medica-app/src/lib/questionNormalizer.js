import { getQuestionCorrectLetter } from './answerNormalize.js'

const VALID_LETTERS = ['A', 'B', 'C', 'D']

/**
 * Shuffles answer options randomly and updates correct + optionExplanations to match.
 * Call once per question when assembling a session - never call twice on the same question.
 *
 * @param {import('./quizTypes').QuizQuestion} question
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function shuffleQuestionOptions(question) {
  const opts = question.options.slice(0, 4)

  // Fisher-Yates shuffle - each opt retains its original .letter for tracking
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
  const originalCorrect = getQuestionCorrectLetter(question)
  const newCorrectIdx = shuffled.findIndex(opt => opt.letter === originalCorrect)
  const newCorrect = newCorrectIdx >= 0 ? VALID_LETTERS[newCorrectIdx] : originalCorrect

  // Remap optionExplanations: original letter -> new letter
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
