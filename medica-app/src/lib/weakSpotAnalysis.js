/**
 * @typedef {{
 *   category: string
 *   correct: number
 *   total: number
 *   percentage: number
 *   missedQuestions: import('./quizTypes').QuizQuestion[]
 * }} WeakSpot
 */

/**
 * Groups missed questions by weakSpotCategory and returns sorted weak spots.
 * @param {import('./quizTypes').QuizQuestion[]} questions
 * @param {Record<string, string>} answers - questionId → letter
 * @returns {WeakSpot[]}
 */
export function analyzeWeakSpots(questions, answers) {
  /** @type {Record<string, { correct: number, total: number, missed: import('./quizTypes').QuizQuestion[] }>} */
  const groups = {}

  for (const q of questions) {
    const category = q.weakSpotCategory || 'General'
    if (!groups[category]) {
      groups[category] = { correct: 0, total: 0, missed: [] }
    }
    groups[category].total++
    if (answers[q.id] === q.correct) {
      groups[category].correct++
    } else {
      groups[category].missed.push(q)
    }
  }

  return Object.entries(groups)
    .map(([category, stats]) => ({
      category,
      correct: stats.correct,
      total: stats.total,
      percentage: Math.round((stats.correct / stats.total) * 100),
      missedQuestions: stats.missed,
    }))
    .filter(ws => ws.total > 0)
    .sort((a, b) => a.percentage - b.percentage) // worst first
}
