import { getQuestionCorrectLetter, normalizeAnswerLetter, normalizeOptions } from './answerNormalize.js'

export { normalizeAnswerLetter, normalizeOptions }

export function getCorrectLetter(question) {
  return getQuestionCorrectLetter(question)
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
