import { normalizeQuestionStem, getQuestionFingerprint } from '../questionDedup.js'
import { getAuthToken } from '../apiClient.js'

/**
 * Calls the server-side AI question generation endpoint.
 * Filters semantic duplicates from the response rather than throwing.
 * UUIDs are assigned by the server, so duplicate_id never occurs.
 *
 * @param {import('../quizTypes').QuizConfig} config
 * @param {{ seenIds: Set<string>, seenBaseIds: Set<string>, seenFingerprints: Set<string> } | null} seenState
 * @returns {Promise<import('../quizTypes').QuizQuestion[]>}
 */
export async function generateAIQuestions(config, seenState = null) {
  if (import.meta.env.VITE_USE_BACKEND_API !== 'true') {
    const err = new Error('Backend API disabled — using mock questions')
    err.code  = 'BACKEND_DISABLED'
    throw err
  }

  const exclude = seenState ? {
    questionIds:     [...seenState.seenIds],
    baseQuestionIds: [...seenState.seenBaseIds],
  } : null

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), 180_000)

  try {
    const raw = await _attempt(config, exclude, controller.signal)

    const { unique, filtered } = _dedupQuestions(raw)
    if (filtered > 0) {
      console.warn(`[generateAIQuestions] filtered ${filtered} semantic duplicate(s) — server returned ${raw.length}, using ${unique.length}`)
    }

    return _checkCount(unique, config)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function _attempt(config, exclude, signal) {
  const body = { config }
  if (exclude) body.exclude = exclude

  const headers = { 'Content-Type': 'application/json' }
  const token = getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch('/api/generate-questions', {
    method: 'POST',
    headers,
    body:   JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Server error ${res.status}`)
  }

  const data = await res.json()
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('Server returned empty question array')
  }

  if (data.telemetry) {
    console.log('[generateAIQuestions] server telemetry:', data.telemetry)
  }

  return data.questions
}

/**
 * Removes duplicate questions by stem and fingerprint.
 * ID duplicates cannot occur — server assigns UUIDs.
 */
function _dedupQuestions(questions) {
  const seenIds          = new Set()
  const seenStems        = new Set()
  const seenFingerprints = new Set()
  const unique           = []
  let filtered           = 0

  for (const q of questions) {
    const id          = String(q.id || '')
    const stem        = normalizeQuestionStem(q.stem)
    const fingerprint = getQuestionFingerprint(q)

    if (id && seenIds.has(id))               { filtered++; continue }
    if (stem && seenStems.has(stem))          { filtered++; continue }
    if (seenFingerprints.has(fingerprint))    { filtered++; continue }

    if (id)   seenIds.add(id)
    if (stem) seenStems.add(stem)
    seenFingerprints.add(fingerprint)
    unique.push(q)
  }

  return { unique, filtered }
}

function _checkCount(questions, config) {
  if (questions.length === 0) {
    throw Object.assign(
      new Error('AI returned 0 questions after generation and validation'),
      { code: 'AI_INSUFFICIENT_COUNT', returned: 0, requested: config.questionCount },
    )
  }
  if (questions.length < config.questionCount) {
    const is40QBlock = config.questionCount === 40 && config.mode === 'exam'
    if (is40QBlock) {
      throw Object.assign(
        new Error(`40 Question Block requires exactly 40 questions — AI returned ${questions.length}`),
        { code: 'AI_INSUFFICIENT_COUNT', returned: questions.length, requested: 40 },
      )
    }
    console.warn(
      `[generateAIQuestions] partial result: ${questions.length}/${config.questionCount} questions — proceeding`,
    )
  }
  return questions
}
