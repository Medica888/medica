import { analyzeWeakSpots } from './weakSpotAnalysis'
import { getQuestionCorrectLetter, normalizeAnswerLetter } from './answerNormalize.js'
import { enrichQuestionWithUsmleTaxonomy, normalizeQuestionTaxonomyFields } from './usmleTaxonomy.js'

function _isCorrect(userAnswer, q) {
  return normalizeAnswerLetter(userAnswer) === getQuestionCorrectLetter(q)
}

/**
 * @param {import('./quizTypes').QuizSession} session
 * @returns {CoachResults}
 */
export function calculateCoachResults(session) {
  const { questions, answers } = session

  const total = questions.length
  const correct = questions.filter(q => _isCorrect(answers[q.id], q)).length
  const wrong = total - correct
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0

  // Subject breakdown
  const subjectMap = {}
  for (const q of questions) {
    const normalized = normalizeQuestionTaxonomyFields(q)
    const s = normalized.subject || 'Unknown'
    if (!subjectMap[s]) subjectMap[s] = { correct: 0, total: 0 }
    subjectMap[s].total++
    if (_isCorrect(answers[q.id], q)) subjectMap[s].correct++
  }
  const subjectBreakdown = Object.entries(subjectMap).map(([name, d]) => ({
    name,
    correct: d.correct,
    total: d.total,
    percentage: Math.round((d.correct / d.total) * 100),
  }))

  // System breakdown
  const systemMap = {}
  for (const q of questions) {
    const normalized = normalizeQuestionTaxonomyFields(q)
    const s = normalized.system || 'Unknown'
    if (!systemMap[s]) systemMap[s] = { correct: 0, total: 0 }
    systemMap[s].total++
    if (_isCorrect(answers[q.id], q)) systemMap[s].correct++
  }
  const systemBreakdown = Object.entries(systemMap).map(([name, d]) => ({
    name,
    correct: d.correct,
    total: d.total,
    percentage: Math.round((d.correct / d.total) * 100),
  }))

  const usmleContentBreakdown = _buildBreakdown(questions, answers, q => enrichQuestionWithUsmleTaxonomy(q).usmleContentArea)
  const physicianTaskBreakdown = _buildBreakdown(questions, answers, q => enrichQuestionWithUsmleTaxonomy(q).physicianTask)

  const weakAreas = [
    ...subjectBreakdown.filter(x => x.total >= 2 && x.percentage < 60).map(x => ({ type: 'Subject', name: x.name, percentage: x.percentage })),
    ...systemBreakdown.filter(x => x.total >= 2 && x.percentage < 60).map(x => ({ type: 'System', name: x.name, percentage: x.percentage })),
    ...usmleContentBreakdown.filter(x => x.total >= 2 && x.percentage < 60).map(x => ({ type: 'USMLE Content Area', name: x.name, percentage: x.percentage })),
    ...physicianTaskBreakdown.filter(x => x.total >= 2 && x.percentage < 60).map(x => ({ type: 'Physician Task', name: x.name, percentage: x.percentage })),
  ]

  const difficultyBonus = _difficultyBonus(questions, answers)
  const completionRate = total > 0 ? Object.keys(answers).length / total : 0
  const raw = (percentage * 0.7) + (difficultyBonus * 0.2) + (completionRate * 100 * 0.1)
  const medicaScore = Math.min(100, Math.max(0, Math.round(raw)))

  const readinessLabel = _readinessLabel(medicaScore)
  const recommendation = _recommendation(weakAreas, medicaScore, subjectBreakdown, systemBreakdown)

  const weakSpotReport = analyzeWeakSpots(questions, answers)

  const missedQuestions = questions
    .filter(q => !_isCorrect(answers[q.id], q))
    .map(q => {
      const normalized = normalizeQuestionTaxonomyFields(q)
      const tagged = enrichQuestionWithUsmleTaxonomy(normalized)
      return {
        id: q.id,
        subject: normalized.subject || '',
        system: normalized.system || '',
        difficulty: q.difficulty || '',
        weakSpotCategory: q.weakSpotCategory || '',
        testedConcept: q.testedConcept || '',
        usmleContentArea: tagged.usmleContentArea || '',
        usmleSubdomain: tagged.usmleSubdomain || '',
        physicianTask: tagged.physicianTask || '',
        questionAngle: q.questionAngle || '',
        topic: q.topic || '',
        rawTopic: q.rawTopic || '',
        canonicalTopic: q.canonicalTopic || '',
        topicSlug: q.topicSlug || '',
        topicSource: q.topicSource || '',
      }
    })

  return {
    total,
    correct,
    wrong,
    percentage,
    subjectBreakdown,
    systemBreakdown,
    usmleContentBreakdown,
    physicianTaskBreakdown,
    weakAreas,
    medicaScore,
    readinessLabel,
    recommendation,
    weakSpotReport,
    missedQuestions,
    completedAt: new Date().toISOString(),
  }
}

function _difficultyBonus(questions, answers) {
  const weights = { 'More Easy': 0.5, 'Balanced': 1, 'More Hard': 1.3, 'NBME Difficult': 1.6, 'UWorld Challenge': 2 }
  let weightedCorrect = 0
  let weightedTotal = 0
  for (const q of questions) {
    const w = weights[q.difficulty] ?? 1
    weightedTotal += w
    if (_isCorrect(answers[q.id], q)) weightedCorrect += w
  }
  return weightedTotal > 0 ? Math.round((weightedCorrect / weightedTotal) * 100) : 0
}

function _buildBreakdown(questions, answers, getName) {
  const map = {}
  for (const q of questions) {
    const name = getName(q) || 'Unknown'
    if (!map[name]) map[name] = { correct: 0, total: 0 }
    map[name].total++
    if (_isCorrect(answers[q.id], q)) map[name].correct++
  }
  return Object.entries(map).map(([name, d]) => ({
    name,
    correct: d.correct,
    total: d.total,
    percentage: Math.round((d.correct / d.total) * 100),
  }))
}

function _readinessLabel(score) {
  if (score >= 80) return 'Strong'
  if (score >= 65) return 'Ready'
  if (score >= 50) return 'Borderline'
  if (score >= 35) return 'Building'
  return 'Needs Foundation'
}

function _recommendation(weakAreas, score, subjectBreakdown, systemBreakdown) {
  if (weakAreas.length > 0) {
    const top = weakAreas[0]
    return `Next session target: ${top.name} — ${top.percentage}% accuracy signals a mechanism gap. Targeted Coach Mode practice accelerates Step 1 mastery.`
  }
  if (score >= 80) {
    return 'Strong Coach session. Advance to Challenge questions to continue building toward exam readiness.'
  }
  if (score >= 65) {
    const lowestSystem = [...systemBreakdown].sort((a, b) => a.percentage - b.percentage)[0]
    if (lowestSystem && lowestSystem.percentage < 75) {
      return `Solid progress. Target ${lowestSystem.name} in your next Coach session — it's the clearest remaining gap.`
    }
    return 'Solid progress. Run another Coach block on this configuration to deepen reasoning and consolidate recall.'
  }
  return 'Review every option explanation carefully — the diagnostic detail is in the distractors. Repeat this configuration before advancing.'
}

/**
 * @typedef {Object} CoachResults
 * @property {number} total
 * @property {number} correct
 * @property {number} wrong
 * @property {number} percentage
 * @property {Array<{name:string, correct:number, total:number, percentage:number}>} subjectBreakdown
 * @property {Array<{name:string, correct:number, total:number, percentage:number}>} systemBreakdown
 * @property {Array<{type:string, name:string, percentage:number}>} weakAreas
 * @property {number} medicaScore
 * @property {string} readinessLabel
 * @property {string} recommendation
 * @property {import('./weakSpotAnalysis').WeakSpot[]} weakSpotReport
 * @property {string} completedAt
 */
