import { exams } from './apiClient.js'
import { getQuestionCorrectLetter, normalizeAnswerLetter } from './answerNormalize.js'
import { classifyAnswer } from './qbankProgress.js'

const PAGE_LIMIT = 100
const MAX_SESSIONS = 500

function _toIso(v) {
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'string' ? v : String(v ?? '')
}

function _toArray(val) {
  if (Array.isArray(val)) return val
  return Object.entries(val ?? {}).map(([name, stats]) => ({
    name,
    correct:    stats.correct    ?? 0,
    total:      stats.total      ?? 0,
    percentage: stats.percentage ?? 0,
  }))
}

function _rebuildBreakdowns(questions, answers) {
  const usmleMap = {}
  const taskMap  = {}

  for (const q of questions) {
    const isCorrect = normalizeAnswerLetter(answers[q.id]) === getQuestionCorrectLetter(q)

    const usmle = q.usmleContentArea || ''
    if (usmle) {
      if (!usmleMap[usmle]) usmleMap[usmle] = { correct: 0, total: 0 }
      usmleMap[usmle].total++
      if (isCorrect) usmleMap[usmle].correct++
    }

    const task = q.physicianTask || ''
    if (task) {
      if (!taskMap[task]) taskMap[task] = { correct: 0, total: 0 }
      taskMap[task].total++
      if (isCorrect) taskMap[task].correct++
    }
  }

  const toArr = (map) => Object.entries(map).map(([name, d]) => ({
    name,
    correct:    d.correct,
    total:      d.total,
    percentage: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
  }))

  return {
    usmleContentBreakdown:  toArr(usmleMap),
    physicianTaskBreakdown: toArr(taskMap),
  }
}

export function normalizeBackendSession(s) {
  const questions = Array.isArray(s.questions) ? s.questions : []
  const answers   = s.answers && typeof s.answers === 'object' ? s.answers : {}
  const { usmleContentBreakdown, physicianTaskBreakdown } = _rebuildBreakdowns(questions, answers)

  const completedAt = _toIso(s.completed_at)
  const sessionId   = s.id || ''

  const questionIds = questions.map(q => q.id).filter(Boolean)
  const questionAttempts = questions.map(q => ({
    questionId: q.id,
    result: classifyAnswer(answers[q.id], getQuestionCorrectLetter(q)),
    mode: s.mode,
    sessionId,
    completedAt,
  }))

  return {
    id:                    s.id,
    completedAt,
    mode:                  s.mode,
    total:                 questions.length,
    correct:               s.score ?? 0,
    percentage:            s.percentage ?? 0,
    medicaScore:           s.medica_score ?? 0,
    readinessLabel:        s.readiness_label ?? '',
    subjectBreakdown:      _toArray(s.subject_breakdown),
    systemBreakdown:       _toArray(s.system_breakdown),
    missedQuestions:       Array.isArray(s.missed_questions) ? s.missed_questions : [],
    usmleContentBreakdown,
    physicianTaskBreakdown,
    difficulty:            s.difficulty ?? '',
    questionIds,
    questionAttempts,
  }
}

export async function fetchAllBackendSessions() {
  const all = []
  let page = 1

  while (all.length < MAX_SESSIONS) {
    const { data, totalPages } = await exams.list(page, PAGE_LIMIT)
    if (!Array.isArray(data) || data.length === 0) break
    all.push(...data.map(normalizeBackendSession))
    if (page >= totalPages) break
    page++
  }

  return all.slice(0, MAX_SESSIONS)
}
