import { normalizeQuestionStem, getQuestionFingerprint, filterUnseenQuestions } from '../questionDedup.js'
import { generate, isAuthenticated } from '../apiClient.js'
import { ANSWER_LETTERS, getQuestionCorrectLetter, normalizeOptions } from '../answerNormalize.js'
import { enrichQuestionWithUsmleTaxonomy } from '../usmleTaxonomy.js'
import { isStandardized40QuestionBlock, normalizeQuizConfigForGeneration } from '../quizTypes.js'
import {
  appendTrustedGeneratedQuestions,
  filterReportedQuestions,
  getTrustedGeneratedQuestionsForConfig,
  purgeStaleQuestionsFromTrusted,
} from '../storage.js'
import { getBankQuestionsForConfig, selectStandardizedStep1Questions } from '../mockQuestions.js'

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
  const normalizedConfig = normalizeQuizConfigForGeneration(config)

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
  const timeoutId  = setTimeout(() => controller.abort(), getGenerationTimeoutMs(normalizedConfig))

  // Declared outside try so the catch block can fall back to whatever bank candidates
  // were collected before an AI failure.
  let bankCandidates = []

  try {
    // ── Step 1: bank-first — static bank + trusted AI questions ─────────────
    bankCandidates = _getBankCandidates(normalizedConfig, seenState)

    if (bankCandidates.length >= normalizedConfig.questionCount) {
      const questions = isStandardized40QuestionBlock(normalizedConfig)
        ? selectStandardizedStep1Questions(bankCandidates, normalizedConfig.questionCount)
        : bankCandidates.slice(0, normalizedConfig.questionCount)
      attachGenerationTelemetry(questions, {
        source:       'validated-local-bank',
        bankUsed:     questions.length,
        aiUsed:       0,
        aiRequested:  0,
      })
      return questions
    }

    if (!isAuthenticated()) {
      throw Object.assign(
        new Error('Sign in to generate questions beyond the validated local bank.'),
        {
          code: 'AUTH_REQUIRED_FOR_LIVE_AI',
          available: bankCandidates.length,
          requested: normalizedConfig.questionCount,
        },
      )
    }

    // ── Step 2: AI fill for remaining count ──────────────────────────────────
    const remainingCount  = Math.max(1, normalizedConfig.questionCount - bankCandidates.length)
    const remainingConfig = { ...normalizedConfig, questionCount: remainingCount }

    const raw = await _attempt(remainingConfig, exclude, controller.signal)
    const telemetry = raw.generationTelemetry ?? null

    const { unique, filtered } = _dedupQuestions(raw)
    if (filtered > 0) {
      console.warn(`[generateAIQuestions] filtered ${filtered} semantic duplicate(s) - server returned ${raw.length}, using ${unique.length}`)
    }

    const { questions: unseen, filtered: reused } = _filterPreviouslySeenQuestions(unique, seenState)
    if (reused > 0) {
      console.warn(`[generateAIQuestions] filtered ${reused} previously seen question(s)`)
    }

    const { questions: unreported, filtered: reported } = _filterReportedQuestions(unseen)
    if (reported > 0) {
      console.warn(`[generateAIQuestions] filtered ${reported} reported question(s)`)
    }

    const { valid, rejected, reasons } = _validateGeneratedQuestions(unreported, normalizedConfig)
    if (rejected > 0) {
      console.warn(`[generateAIQuestions] rejected ${rejected} invalid question(s): ${_formatRejectionReasons(reasons)}`)
    }

    const enrichedValid = valid.map(q => enrichQuestionWithUsmleTaxonomy(q, normalizedConfig))
    appendTrustedGeneratedQuestions(enrichedValid, normalizedConfig)

    // ── Step 3: combine bank + AI, dedup, enforce count ──────────────────────
    const combined = _dedupQuestions([...bankCandidates, ...enrichedValid]).unique
    const selected = isStandardized40QuestionBlock(normalizedConfig)
      ? selectStandardizedStep1Questions(combined, normalizedConfig.questionCount)
      : combined
    const checked  = _checkCount(selected, normalizedConfig)

    const source = bankCandidates.length > 0 ? 'bank-plus-ai' : 'live-ai'
    attachGenerationTelemetry(checked, {
      ...telemetry,
      source,
      bankUsed:    bankCandidates.length,
      aiUsed:      enrichedValid.length,
      aiRequested: remainingCount,
    })
    return checked

  } catch (err) {
    if (err?.name === 'AbortError') {
      throw Object.assign(
        new Error(getGenerationTimeoutMessage(normalizedConfig)),
        { code: 'GENERATION_TIMEOUT' },
      )
    }
    if (err?.code === 'AUTH_REQUIRED_FOR_LIVE_AI') throw err
    // AI failed but bank has partial coverage: use what we have for non-40Q configs
    const isStrictBlock = isStandardized40QuestionBlock(normalizedConfig)
      || (normalizedConfig.questionCount === 40 && normalizedConfig.mode === 'exam')
    if (bankCandidates.length > 0 && !isStrictBlock) {
      console.warn(`[generateAIQuestions] AI failed (${err?.code ?? err?.message}), falling back to ${bankCandidates.length} bank question(s)`)
      const checked = _checkCount(bankCandidates, normalizedConfig)
      attachGenerationTelemetry(checked, {
        source:       'fallback-bank',
        bankUsed:     bankCandidates.length,
        aiUsed:       0,
        aiError:      err?.code || 'AI_ERROR',
      })
      return checked
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

const NORMAL_GENERATION_TIMEOUT_MS = 180_000
const HARD_SMALL_GENERATION_TIMEOUT_MS = 360_000
const HARD_40Q_GENERATION_TIMEOUT_MS = 720_000

export function isHardMedicalReviewGeneration(config) {
  return ['NBME Difficult', 'UWorld Challenge'].includes(config?.difficulty)
}

export function getGenerationTimeoutMs(config) {
  if (!isHardMedicalReviewGeneration(config)) return NORMAL_GENERATION_TIMEOUT_MS
  return Number(config?.questionCount) >= 40
    ? HARD_40Q_GENERATION_TIMEOUT_MS
    : HARD_SMALL_GENERATION_TIMEOUT_MS
}

export function getGenerationTimeoutMessage(config) {
  if (!isHardMedicalReviewGeneration(config)) {
    return 'Question generation timed out. Please try again.'
  }
  return 'Challenge generation is taking longer than expected. These questions are medically reviewed, so a full block can take several minutes. Try fewer questions, or use the validated local Challenge bank while live generation is busy.'
}

export function formatGenerationErrorMessage(err, config) {
  if (err?.code === 'AUTH_REQUIRED_FOR_LIVE_AI' || err?.status === 401) {
    return 'Sign in from Settings to generate new questions. You can continue using matching questions from the validated local bank without an account.'
  }
  if (err?.code === 'RATE_LIMITED' || err?.status === 429) {
    return 'Live question generation is temporarily at capacity. Wait a few minutes or continue with the validated local bank.'
  }
  if (err?.code === 'INSUFFICIENT_QUESTIONS') {
    return 'Not enough validated questions available for this filter. Broaden your filters or reduce the question count.'
  }
  if (err?.code === 'GENERATION_TIMEOUT' || err?.name === 'AbortError') {
    return getGenerationTimeoutMessage(config)
  }
  if (err?.code === 'AI_INSUFFICIENT_COUNT' && isHardMedicalReviewGeneration(config)) {
    return `Challenge generation returned ${err.returned ?? 'fewer than requested'} medically approved questions out of ${err.requested ?? config.questionCount}. Try fewer questions or use the validated local Challenge bank while live generation is busy.`
  }
  return `Question generation failed: ${err?.message || 'Unknown error'}`
}

async function _attempt(config, exclude, signal) {
  const data = await generate.questions({ config, exclude }, { signal })
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error('Server returned empty question array')
  }

  if (data.telemetry) {
    attachGenerationTelemetry(data.questions, data.telemetry)
  }

  return data.questions
}

function attachGenerationTelemetry(questions, telemetry) {
  if (!Array.isArray(questions) || !telemetry) return questions
  Object.defineProperty(questions, 'generationTelemetry', {
    value: telemetry,
    enumerable: false,
    configurable: true,
  })
  return questions
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

function _filterReportedQuestions(questions) {
  const unreported = filterReportedQuestions(questions)
  return { questions: unreported, filtered: questions.length - unreported.length }
}

function _getReusableTrustedQuestions(config, seenState) {
  const trusted = getTrustedGeneratedQuestionsForConfig(config)
  if (trusted.length === 0) return []

  const { unique } = _dedupQuestions(trusted)
  const { questions: unseen } = _filterPreviouslySeenQuestions(unique, seenState)
  const { questions: unreported } = _filterReportedQuestions(unseen)
  const { valid, rejected } = _validateGeneratedQuestions(unreported, config)

  // Purge entries that fail re-validation under current rules (e.g. thresholds tightened
  // in a later phase). The AI fill step will regenerate fresh replacements.
  if (rejected > 0) {
    const validIds = new Set(valid.map(q => String(q.id || '')))
    const staleIds = new Set(
      unreported
        .filter(q => !validIds.has(String(q.id || '')))
        .flatMap(q => [String(q.id || ''), getQuestionFingerprint(q)])
        .filter(Boolean),
    )
    purgeStaleQuestionsFromTrusted(staleIds)
    console.warn(`[generateAIQuestions] purged ${rejected} stale trusted question(s) that failed re-validation`)
  }

  return valid.map(q => enrichQuestionWithUsmleTaxonomy(q, config))
}

/**
 * Builds the pre-AI candidate pool: static bank questions + validated trusted AI questions.
 * Static bank questions are already scope/seen/reported-filtered by _buildMockPool.
 * Both sets are enriched with USMLE taxonomy and deduped before return.
 */
function _getBankCandidates(config, seenState) {
  // Static bank questions — scope/seen/reported already filtered by _buildMockPool.
  // Re-validate here so any bank question that fails current rules is excluded and
  // the AI fill step covers the shortfall (static content can't be repaired in-client).
  const rawBankQs = getBankQuestionsForConfig(config, seenState)
    .map(q => enrichQuestionWithUsmleTaxonomy(q, config))
  const { valid: validBankQs, rejected: bankRejected } = _validateGeneratedQuestions(rawBankQs, config, {
    allowExtendedOptions: true,
  })
  if (bankRejected > 0) {
    console.warn(`[generateAIQuestions] excluded ${bankRejected} static bank question(s) that failed validation`)
  }

  // Trusted AI questions — _getReusableTrustedQuestions validates and purges stale entries.
  const trustedQs = _getReusableTrustedQuestions(config, seenState)

  const { unique } = _dedupQuestions([...validBankQs, ...trustedQs])
  return unique
}

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'without', 'from', 'that', 'this', 'these', 'those',
  'best', 'most', 'likely', 'primary', 'current', 'patient', 'presentation',
  'mechanism', 'diagnosis', 'treatment',
  'condition', 'effect', 'activity', 'function', 'process',
  // 'disease', 'disorder', 'syndrome' intentionally excluded — condition names like
  // "Graves disease" and "Cushing syndrome" must retain their meaningful tokens.
])

// Mirrors server/src/lib/questionValidator.ts MEDICAL_ABBREVIATIONS.
// When the correct option text matches (case-insensitive via .toUpperCase()), the
// answer-support check is bypassed — a clinically correct explanation need not
// restate the abbreviation verbatim.
const MEDICAL_ABBREVIATIONS = new Set([
  'ATP', 'ADP', 'AMP', 'GTP', 'NADH', 'NADPH', 'FADH2',
  'DNA', 'RNA', 'mRNA', 'tRNA', 'rRNA', 'miRNA',
  'Na', 'K', 'Ca', 'Mg', 'Cl', 'Fe', 'Zn', 'Cu', 'Phos',
  'TSH', 'LH', 'FSH', 'ADH', 'PTH', 'PTHrP', 'GH', 'ACTH', 'CRH', 'TRH', 'GnRH',
  'T3', 'T4', 'PRL', 'MSH', 'DHEA', 'IGF',
  'GFR', 'BUN',
  'IgA', 'IgG', 'IgM', 'IgE', 'IgD', 'MHC', 'HLA', 'NK', 'TCR', 'BCR',
  'HIV', 'HBV', 'HCV', 'HPV', 'HSV', 'CMV', 'EBV', 'VZV', 'RSV', 'HAV',
  'ACE', 'ADA', 'ALP', 'ALT', 'AST', 'GGT', 'LDH', 'CK', 'BNP', 'PSA',
  'INR', 'PT', 'PTT', 'ESR', 'CRP', 'CBC', 'WBC', 'RBC', 'HCG',
  'CT', 'MRI', 'PET', 'MRA', 'ECG', 'EKG', 'EEG',
  'MI', 'CHF', 'DVT', 'PE', 'COPD', 'ARDS', 'SIADH', 'DKA',
  'CNS', 'PNS', 'CSF', 'BBB',
])

// Returns s-inflection variants for verbatim matching (mirrors server questionValidator.ts).
// "Antibodies" → ["antibodies","antibody"]  "Aminoglycosides" → ["aminoglycosides","aminoglycoside"]
function _verbatimVariants(text) {
  const lower = text.toLowerCase()
  if (lower.endsWith('ies')) return [lower, lower.slice(0, -3) + 'y']
  if (lower.endsWith('s'))   return [lower, lower.slice(0, -1)]
  return [lower, lower + 's']
}

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

function _validateStructure(question, { allowExtendedOptions = false } = {}) {
  const reasons = []
  const correct = getQuestionCorrectLetter(question)
  const options = normalizeOptions(question.options)
  const allowedLetters = allowExtendedOptions ? ANSWER_LETTERS : ANSWER_LETTERS.slice(0, 4)

  if (!String(question.stem || '').trim()) reasons.push('missing_stem')
  if (!allowedLetters.includes(correct)) reasons.push('invalid_correct_answer')
  if (!Array.isArray(question.options)
    || options.length !== question.options.length
    || options.length < 4
    || options.length > allowedLetters.length) {
    reasons.push('invalid_options')
    return reasons
  }
  if (options.some((o, i) => o.letter !== allowedLetters[i] || !String(o.text || '').trim())) {
    reasons.push('invalid_options')
  }
  if (!options.some(option => option.letter === correct)) reasons.push('invalid_correct_answer')

  return reasons
}

function _supportsCorrectAnswer(question) {
  const correct = getQuestionCorrectLetter(question)
  const correctText = _getOptionText(question, correct)
  if (!correctText) return false

  const explanation = [
    question.explanation,
    question.optionExplanations?.[correct],
  ].filter(Boolean).join(' ').toLowerCase()

  if (!explanation.trim()) return false

  if (MEDICAL_ABBREVIATIONS.has(correctText.trim().toUpperCase())) return true

  if (correctText.length >= 8 && _verbatimVariants(correctText).some(v => explanation.includes(v))) return true

  const tokens = _meaningfulTokens(correctText)
  if (tokens.length === 0) return explanation.includes(correctText.toLowerCase())
  const matches = tokens.filter(t => explanation.includes(t)).length
  return matches >= Math.min(2, tokens.length)
}

function _contradictsCorrectAnswer(question) {
  const correct = getQuestionCorrectLetter(question)
  const optExplText = Object.values(question.optionExplanations ?? {}).join(' ')
  const explanation = [String(question.explanation || ''), optExplText].join(' ').toLowerCase()

  return (question.options || []).some(opt => {
    if (!opt || opt.letter === correct) return false
    const text = String(opt.text || opt).toLowerCase().trim()
    if (text.length < 6) return false
    return explanation.includes(`correct answer is ${text}`)
      || explanation.includes(`${text} is the correct answer`)
      || explanation.includes(`${text} is correct because`)
      || explanation.includes(`answer is ${text}`)
      || explanation.includes(`the correct choice is ${text}`)
      || explanation.includes(`the best answer is ${text}`)
      || explanation.includes(`we select ${text}`)
      || explanation.includes(`you should choose ${text}`)
      || explanation.includes(`${text} should be selected`)
      || explanation.includes(`${text} is therefore correct`)
  })
}

function _hasCoachOptionExplanations(question, config) {
  if (config.mode !== 'coach') return true
  const exps = question.optionExplanations || {}
  const options = normalizeOptions(question.options)
  return options.length > 0 && options.every(option => String(exps[option.letter] || '').trim())
}

function _getQuestionRejectionReasons(question, config, validationOptions = {}) {
  const reasons = _validateStructure(question, validationOptions)
  if (reasons.length > 0) return reasons

  if (config.mode === 'exam') return []

  if (!_supportsCorrectAnswer(question)) reasons.push('answer_not_supported')
  if (_contradictsCorrectAnswer(question)) reasons.push('contradictory_explanation')
  if (!_hasCoachOptionExplanations(question, config)) reasons.push('missing_option_explanations')

  return reasons
}

function _validateGeneratedQuestions(questions, config, validationOptions = {}) {
  const reasonCounts = {}
  const valid = []

  for (const q of questions) {
    const reasons = _getQuestionRejectionReasons(q, config, validationOptions)
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
    if (isStandardized40QuestionBlock(config)) {
      throw Object.assign(
        new Error(`Current USMLE Step 1 block requires exactly ${config.questionCount} questions - generation returned ${questions.length}`),
        { code: 'AI_INSUFFICIENT_COUNT', returned: questions.length, requested: config.questionCount },
      )
    }
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

/**
 * Runs the same structural + semantic validation used in generation against a
 * single question. Returns an array of rejection reason strings (empty = valid).
 * Exported for bank-wide test validation.
 */
export function validateBankQuestion(question, config) {
  return _getQuestionRejectionReasons(question, config, { allowExtendedOptions: true })
}
