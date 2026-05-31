import { normalizeQuestionStem, getQuestionFingerprint, filterUnseenQuestions } from '../questionDedup.js'
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
    const err = new Error('Backend API disabled - using mock questions')
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
      console.warn(`[generateAIQuestions] filtered ${filtered} semantic duplicate(s) - server returned ${raw.length}, using ${unique.length}`)
    }

    const { questions: unseen, filtered: reused } = _filterPreviouslySeenQuestions(unique, seenState)
    if (reused > 0) {
      console.warn(`[generateAIQuestions] filtered ${reused} previously seen question(s)`)
    }

    const { valid, rejected, reasons } = _validateGeneratedQuestions(unseen, config)
    if (rejected > 0) {
      console.warn(`[generateAIQuestions] rejected ${rejected} invalid question(s): ${_formatRejectionReasons(reasons)}`)
    }

    return _checkCount(valid, config)
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
 * ID duplicates cannot occur - server assigns UUIDs.
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

function _filterPreviouslySeenQuestions(questions, seenState) {
  if (!seenState) return { questions, filtered: 0 }
  const unseen = filterUnseenQuestions(questions, seenState)
  return { questions: unseen, filtered: questions.length - unseen.length }
}

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'without', 'from', 'that', 'this', 'these', 'those',
  'best', 'most', 'likely', 'primary', 'current', 'patient', 'presentation',
  'mechanism', 'diagnosis', 'treatment', 'disease', 'disorder', 'syndrome',
  'condition', 'effect', 'activity', 'function', 'process',
])

function _meaningfulTokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t))
}

function _getOptionText(question, letter) {
  const opt = (question.options || []).find(o => o?.letter === letter)
  return String(opt?.text || opt || '').trim()
}

function _validateStructure(question) {
  const reasons = []
  const correct = String(question.correct || '').trim().toUpperCase().charAt(0)

  if (!String(question.stem || '').trim()) reasons.push('missing_stem')
  if (!['A', 'B', 'C', 'D'].includes(correct)) reasons.push('invalid_correct_answer')
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    reasons.push('invalid_options')
    return reasons
  }
  if (question.options.some((o, i) => o?.letter !== ['A', 'B', 'C', 'D'][i] || !String(o?.text || '').trim())) {
    reasons.push('invalid_options')
  }

  return reasons
}

function _supportsCorrectAnswer(question) {
  const correct = String(question.correct || '').trim().toUpperCase().charAt(0)
  const correctText = _getOptionText(question, correct)
  if (!correctText) return false

  const explanation = [
    question.explanation,
    question.optionExplanations?.[correct],
  ].filter(Boolean).join(' ').toLowerCase()

  if (!explanation.trim()) return false
  if (correctText.length >= 8 && explanation.includes(correctText.toLowerCase())) return true

  const tokens = _meaningfulTokens(correctText)
  if (tokens.length === 0) return false
  const matches = tokens.filter(t => explanation.includes(t)).length
  return matches >= Math.min(2, tokens.length)
}

function _contradictsCorrectAnswer(question) {
  const correct = String(question.correct || '').trim().toUpperCase().charAt(0)
  const explanation = String(question.explanation || '').toLowerCase()

  return (question.options || []).some(opt => {
    if (!opt || opt.letter === correct) return false
    const text = String(opt.text || opt).toLowerCase().trim()
    if (text.length < 8) return false
    return explanation.includes(`correct answer is ${text}`)
      || explanation.includes(`${text} is the correct answer`)
      || explanation.includes(`${text} is correct because`)
      || explanation.includes(`answer is ${text}`)
  })
}

function _hasCoachOptionExplanations(question, config) {
  if (config.mode !== 'coach') return true
  const exps = question.optionExplanations || {}
  return ['A', 'B', 'C', 'D'].every(letter => String(exps[letter] || '').trim())
}

function _getQuestionRejectionReasons(question, config) {
  const reasons = _validateStructure(question)
  if (reasons.length > 0) return reasons

  if (config.mode === 'exam') return []

  if (!_supportsCorrectAnswer(question)) reasons.push('answer_not_supported')
  if (_contradictsCorrectAnswer(question)) reasons.push('contradictory_explanation')
  if (!_hasCoachOptionExplanations(question, config)) reasons.push('missing_option_explanations')

  return reasons
}

function _validateGeneratedQuestions(questions, config) {
  const reasonCounts = {}
  const valid = []

  for (const q of questions) {
    const reasons = _getQuestionRejectionReasons(q, config)
    if (reasons.length === 0) {
      valid.push(q)
    } else {
      for (const reason of reasons) {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1
      }
    }
  }

  return { valid, rejected: questions.length - valid.length, reasons: reasonCounts }
}

function _formatRejectionReasons(reasons) {
  return Object.entries(reasons)
    .map(([reason, count]) => `${reason}=${count}`)
    .join(', ')
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
        new Error(`40 Question Block requires exactly 40 questions - AI returned ${questions.length}`),
        { code: 'AI_INSUFFICIENT_COUNT', returned: questions.length, requested: 40 },
      )
    }
    console.warn(
      `[generateAIQuestions] partial result: ${questions.length}/${config.questionCount} questions - proceeding`,
    )
  }
  return questions
}
