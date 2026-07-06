import { shuffleQuestionOptions } from './questionNormalizer.js'
import { getQuestionCorrectLetter } from './answerNormalize.js'
import { isStandardized40QuestionBlock, normalizeQuizConfigForGeneration } from './quizTypes.js'
import {
  enrichQuestionWithUsmleTaxonomy,
  normalizeQuestionTaxonomyFields,
  normalizeSubjectLabel,
  normalizeSystemLabel,
} from './usmleTaxonomy.js'
import { HARD_DIFFICULTY_TARGETS, validateHardDifficultyQuestion } from './questionValidation.js'
import { isQuarantined } from './questionQualityRegistry.js'
import {
  resolveGenerationScope,
  normalizeGenerationConfig,
  isEmptySelection,
  isSpecificScope,
  isQuestionInScope,
  applyExpandedScopeMetadata,
} from './generationScope.js'
import { applyTopicMetadataToQuestion } from './topicIntelligence.js'
import { filterReportedQuestions, getSessionHistory } from './storage.js'
import { BALANCED_QUESTIONS } from './questionBanks/balancedQuestions.js'
import { NBME_QUESTIONS } from './questionBanks/nbmeQuestions.js'
import { UWORLD_QUESTIONS } from './questionBanks/uworldQuestions.js'
import { COVERAGE_EXPANSION_QUESTIONS } from './questionBanks/coverageExpansionQuestions.js'
import {
  buildSeenState,
  dedupeQuestionList,
  filterUnseenQuestions,
  validateUniqueQuestions,
  EMPTY_SEEN_STATE,
} from './questionDedup.js'

export { HARD_DIFFICULTY_TARGETS, validateHardDifficultyQuestion }

function _seenStateFromHistory() {
  try { return buildSeenState(getSessionHistory()) } catch { return EMPTY_SEEN_STATE }
}

/**
 * Ensures a question has exactly 4 options labeled A–D.
 * @param {object} q
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function normalizeQuestion(q) {
  const letters = ['A', 'B', 'C', 'D']
  const opts = (q.options || []).slice(0, 4).map((o, i) => ({
    letter: letters[i],
    text: typeof o === 'string' ? o : (o?.text ?? ''),
  }))
  // Support q.correctAnswer (AI-generated) or q.correct (mock), numeric or letter
  const correct = getQuestionCorrectLetter(q) || 'A'
  const normalized = normalizeQuestionTaxonomyFields({
    ...q,
    options: opts,
    correct,
  })

  return enrichQuestionWithUsmleTaxonomy({
    ...normalized,
    optionExplanations: buildOptionExplanations(normalized),
  })
}

function buildOptionExplanations(question) {
  const existing = question.optionExplanations || {}
  const correct = question.correct || getQuestionCorrectLetter(question) || 'A'
  const correctOption = question.options?.find(option => option.letter === correct)
  const correctText = String(correctOption?.text || 'the best answer').trim()
  const concept = String(
    question.testedConcept
      || question.questionAngle
      || question.pearl
      || `${question.subject || 'the tested subject'} in ${question.system || 'the tested system'}`
  ).trim()
  const explanation = String(question.explanation || '').trim()
  const teachingPoint = _compactTeachingPoint(explanation, concept)
  const scope = [question.subject, question.system].filter(Boolean).join(' / ')
  const filled = {}

  for (const letter of ['A', 'B', 'C', 'D']) {
    const current = String(existing[letter] || '').trim()
    if (current) {
      filled[letter] = letter === correct ? current : _strengthenWrongOptionExplanation(current, {
        letter,
        question,
        concept,
        teachingPoint,
        correctText,
        scope,
      })
      continue
    }

    if (letter === correct) {
      filled[letter] = explanation || `${correctText} is correct because it best matches ${concept}${scope ? ` in ${scope}` : ''}.`
      continue
    }

    const optionText = String(question.options?.find(option => option.letter === letter)?.text || 'This option').trim()
    filled[letter] = `${optionText} is incorrect because it does not best explain the tested finding: ${concept}. ${teachingPoint} The better answer is ${correctText}, which fits the vignette more directly${scope ? ` for ${scope}` : ''}.`
  }

  return filled
}

function _strengthenWrongOptionExplanation(current, { letter, question, concept, teachingPoint, correctText, scope }) {
  const optionText = String(question.options?.find(option => option.letter === letter)?.text || 'This option').trim()
  const hasContrast = /\b(not|does not|do not|instead|whereas|however|although|unlike|lacks?|incorrect|wrong|would|rather|contrast|describes?|causes?|associated with|best answer|less likely|rules out|incompatible|not the|fails to|neither|feature of|opposite of)\b/i.test(current)
  const hasDepth = current.length >= 70

  if (hasContrast && hasDepth) return current

  const contrast = `${optionText} is incorrect because it does not best explain ${concept}.`
  const betterAnswer = `The better answer is ${correctText}, which fits the vignette more directly${scope ? ` for ${scope}` : ''}.`

  return [current, contrast, !hasDepth ? teachingPoint : '', betterAnswer]
    .filter(Boolean)
    .join(' ')
}

function _compactTeachingPoint(explanation, fallback) {
  const firstSentence = String(explanation || '')
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .find(Boolean)

  if (firstSentence && firstSentence.length >= 40) return firstSentence
  return `The key teaching point is ${fallback}.`
}

/** @type {import('./quizTypes').QuizQuestion[]} */
export const QUESTION_BANK = [
  ...BALANCED_QUESTIONS,
  ...COVERAGE_EXPANSION_QUESTIONS,
  ...NBME_QUESTIONS,
  ...UWORLD_QUESTIONS,
].map(normalizeQuestion)

// Active bank: quarantined questions excluded from session generation.
// QUESTION_BANK retains all authored questions for structural tests and coverage reports.
export const ACTIVE_QUESTION_BANK = QUESTION_BANK.filter(q => !isQuarantined(q.id))

// Coach Mode can use every active local question because normalization guarantees A-D explanations.
export const ENRICHED_IDS = new Set(ACTIVE_QUESTION_BANK.map(q => q.id))

/** Returns active, locally reported-filtered, identity-deduplicated questions for QBank browsing. */
export function getBrowsableQuestionBank() {
  return dedupeQuestionList(filterReportedQuestions(ACTIVE_QUESTION_BANK))
}

function buildSelectedQuestionSession(config, safeQuestions) {
  const normalizedConfig = normalizeGenerationConfig({
    ...config,
    questionCount: safeQuestions.length,
    source: 'validated-qbank',
  })
  const finalQuestions = safeQuestions.map(shuffleQuestionOptions)

  return {
    id: `session_${Date.now()}`,
    clientSessionId: crypto.randomUUID(),
    mode: normalizedConfig.mode,
    config: normalizedConfig,
    questions: finalQuestions,
    answers: {},
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    source: 'validated-qbank',
    questionSource: 'validated-qbank',
    generatedAt: null,
    requestedQuestionCount: finalQuestions.length,
    uniqueQuestionCount: finalQuestions.length,
    hasDuplicateQuestions: false,
    hasClonedQuestions: false,
    hasReusedQuestions: false,
    generationConfigSnapshot: normalizedConfig,
    excludedPreviousQuestionCount: 0,
  }
}

/**
 * Creates a session from an explicit QBank selection without generation or seen-question filtering.
 * Questions are resolved against the current safe inventory again at launch time.
 */
export function createSelectedQuestionSession(config, selectedQuestions) {
  const selectedIds = [...new Set((selectedQuestions || []).map(question => String(question?.id || '')).filter(Boolean))]
  if (selectedIds.length === 0) {
    throw Object.assign(new Error('Select at least one question to start.'), { code: 'EMPTY_QBANK_SELECTION' })
  }
  if (selectedIds.length > 40) {
    throw Object.assign(new Error('QBank sessions are limited to 40 questions.'), { code: 'QBANK_SELECTION_LIMIT' })
  }

  const safeById = new Map(getBrowsableQuestionBank().map(question => [String(question.id), question]))
  const safeQuestions = selectedIds.map(id => safeById.get(id)).filter(Boolean)
  if (safeQuestions.length !== selectedIds.length) {
    throw Object.assign(new Error('One or more selected questions are no longer available.'), { code: 'QBANK_SELECTION_STALE' })
  }

  return buildSelectedQuestionSession(config, safeQuestions)
}

/**
 * Same contract as createSelectedQuestionSession, but for question bodies already
 * resolved and safety-checked by the backend catalog (POST /api/qbank/sessions).
 * Skips the local-bundle re-lookup so backend-only authored content isn't rejected
 * as stale just because it isn't present in the bundled question banks.
 */
export function createSessionFromResolvedQuestions(config, resolvedQuestions) {
  const questions = (resolvedQuestions || []).map(normalizeQuestion)
  if (questions.length === 0) {
    throw Object.assign(new Error('Select at least one question to start.'), { code: 'EMPTY_QBANK_SELECTION' })
  }
  if (questions.length > 40) {
    throw Object.assign(new Error('QBank sessions are limited to 40 questions.'), { code: 'QBANK_SELECTION_LIMIT' })
  }

  return buildSelectedQuestionSession(config, questions)
}

export function getQuestionBankDifficultyStats() {
  return ACTIVE_QUESTION_BANK.reduce((acc, q) => {
    const key = q.difficulty || 'Balanced'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

export function getAvailableQuestionCountForConfig(config) {
  const normalizedConfig = normalizeQuizConfigForGeneration(config)
  return getBankQuestionsForConfig(normalizedConfig).length
}

export function getLocalQuestionAvailability(config) {
  const normalizedConfig = normalizeQuizConfigForGeneration(config)
  const requested = Number(config?.questionCount || 0)
  const difficulty = normalizedConfig?.difficulty || 'Balanced'
  const available = getAvailableQuestionCountForConfig(normalizedConfig)
  const target = HARD_DIFFICULTY_TARGETS[difficulty] || requested
  return {
    difficulty,
    requested,
    available,
    target,
    enoughForLocalFallback: available >= requested,
    meetsProductTarget: available >= target,
    requiresBackend: available < requested,
  }
}

// Backward-compatible alias for callers that only need difficulty coverage.
export const getDifficultyAvailability = getLocalQuestionAvailability

/**
 * Returns the filtered, scope-matched, seen-excluded, deduped question pool for
 * the given config. Used by generateAIQuestions for bank-first question serving.
 * Does NOT enforce minimum count — returns however many pass all filters.
 *
 * @param {import('./quizTypes').QuizConfig} config
 * @param {{ seenIds: Set<string>, seenBaseIds: Set<string>, seenFingerprints: Set<string> } | null} seenState
 * @returns {import('./quizTypes').QuizQuestion[]}
 */
export function getBankQuestionsForConfig(config, seenState = null) {
  const normalizedConfig = normalizeQuizConfigForGeneration(config)
  const enrichedOnly = config.mode === 'coach'
  const { questions } = _buildMockPool(normalizedConfig, enrichedOnly, seenState ?? EMPTY_SEEN_STATE)
  return questions
}

// ─── Question count enforcement (no cloning — fail clearly if pool is too small) ─────

/**
 * Returns exactly `config.questionCount` questions from the pool.
 * Throws INSUFFICIENT_QUESTIONS if the pool is smaller than requested.
 * Cloning is intentionally removed — duplicate questions are a product failure.
 *
 * @param {import('./quizTypes').QuizQuestion[]} questions
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {import('./quizTypes').QuizQuestion[]}
 */
export function ensureQuestionCount(questions, config) {
  const target = config.questionCount
  if (questions.length >= target) return questions.slice(0, target)

  const is40Q  = target === 40 && config.mode === 'exam'
  const label  = is40Q
    ? 'Not enough unique questions available for a standardized 40 Question Block.'
    : 'Not enough unique questions available. Please broaden your filters or reduce the question count.'

  throw Object.assign(new Error(label), {
    code:      'INSUFFICIENT_QUESTIONS',
    available: questions.length,
    requested: target,
  })
}

/**
 * Builds a filtered, deduped pool from the mock bank using scope resolution.
 * For specific scopes (topic/clinicalFocus/coachSpecificTopic), filters with
 * isQuestionInScope only. It never expands a user-typed topic to broader local
 * system/subject/global banks; backend AI should fill exact-scope shortfalls.
 * For system/subject scopes, applies exact field match. For global, uses all questions.
 *
 * @param {import('./quizTypes').QuizConfig} config
 * @param {boolean} enrichedOnly - when true, restricts to ENRICHED_IDS (Coach Mode)
 * @param {{ seenIds: Set<string>, seenBaseIds: Set<string>, seenFingerprints: Set<string> }} seenState
 * @returns {{ questions: object[], expandedScope: boolean, originalScopeType: string, expandedScopeTo: string|null, excludedCount: number }}
 */
function _buildMockPool(config, enrichedOnly, seenState = EMPTY_SEEN_STATE) {
  const normalizedConfig = normalizeGenerationConfig(normalizeQuizConfigForGeneration(config))
  const scope = resolveGenerationScope(normalizedConfig)

  let bank = (enrichedOnly
    ? ACTIVE_QUESTION_BANK.filter(q => ENRICHED_IDS.has(q.id))
    : ACTIVE_QUESTION_BANK
  ).map(normalizeQuestion)

  let pool = bank
  let expandedScope = false
  const originalScopeType = scope.scopeType
  let expandedScopeTo = null
  const hasSubjectFilter = Boolean(scope.subject && !isEmptySelection(scope.subject))
  const hasSystemFilter = Boolean(scope.system && !isEmptySelection(scope.system))

  if (!isSpecificScope(scope) && hasSubjectFilter && hasSystemFilter) {
    pool = bank.filter(q =>
      normalizeSubjectLabel(q.subject) === normalizeSubjectLabel(scope.subject) &&
      normalizeSystemLabel(q.system) === normalizeSystemLabel(scope.system)
    )

  } else if (isSpecificScope(scope)) {
    pool = bank.filter(q => isQuestionInScope(q, scope))
    if (pool.length < normalizedConfig.questionCount) {
      expandedScope = true
      expandedScopeTo = 'none'
    }
  } else if (scope.scopeType === 'system') {
    pool = bank.filter(q => normalizeSystemLabel(q.system) === normalizeSystemLabel(scope.scopeText))
  } else if (scope.scopeType === 'subject') {
    pool = bank.filter(q => normalizeSubjectLabel(q.subject) === normalizeSubjectLabel(scope.scopeText))
  }

  if (normalizedConfig.difficulty && normalizedConfig.difficulty !== 'Balanced') {
    pool = pool.filter(q => q.difficulty === normalizedConfig.difficulty)
  }

  // Multiple independent questions may legitimately test the same concept or
  // question angle. Identity deduplication removes actual repeated questions
  // without collapsing deliberate concept reinforcement.
  pool = dedupeQuestionList(pool)

  if (expandedScope) {
    pool = pool.map(q => applyExpandedScopeMetadata(q, scope))
  } else if (isSpecificScope(scope)) {
    const meta = {
      rawTopic:       scope.rawTopic       || scope.scopeText,
      canonicalTopic: scope.canonicalTopic || scope.scopeText,
      topicSlug:      scope.topicSlug,
      topicSource:    scope.topicSource    || scope.scopeType,
      subject:        scope.subject,
      system:         scope.system,
    }
    pool = pool.map(q => applyTopicMetadataToQuestion(q, meta))
  }

  const totalBeforeExclusion = pool.length
  const unseenPool = filterReportedQuestions(filterUnseenQuestions(pool, seenState))
  const isStandardized40Q =
    isStandardized40QuestionBlock(normalizedConfig) &&
    normalizedConfig.mode === 'exam' &&
    normalizedConfig.questionCount === 40

  // Standardized blocks must be unique within the block, but old session history
  // should not permanently prevent a user from starting another 40Q exam.
  const dedupedPool = pool
  pool = unseenPool
  if (isStandardized40Q && pool.length < normalizedConfig.questionCount) {
    const reportedFilteredPool = filterReportedQuestions(dedupedPool)
    if (reportedFilteredPool.length >= normalizedConfig.questionCount) {
      pool = reportedFilteredPool
    }
  }
  pool = pool.sort(() => Math.random() - 0.5)
  const excludedCount = totalBeforeExclusion - pool.length

  return { questions: pool, expandedScope, originalScopeType, expandedScopeTo, excludedCount }
}

/**
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {import('./quizTypes').QuizQuestion[]}
 */
export function generateMockQuestions(config) {
  const normalizedConfig = normalizeQuizConfigForGeneration(config)
  const seenState = _seenStateFromHistory()
  const { questions } = _buildMockPool(normalizedConfig, false, seenState)
  return ensureQuestionCount(questions, normalizedConfig)
}

function _buildSessionMetadata(config, finalQuestions, excludedCount) {
  const validation = validateUniqueQuestions(finalQuestions)
  return {
    source:                       'mock-fallback',
    questionSource:               'mock-fallback',
    generatedAt:                  new Date().toISOString(),
    requestedQuestionCount:       config.questionCount,
    uniqueQuestionCount:          validation.uniqueCount,
    hasDuplicateQuestions:        !validation.valid,
    hasClonedQuestions:           false,
    hasReusedQuestions:           false,
    generationConfigSnapshot:     config,
    excludedPreviousQuestionCount: excludedCount,
  }
}

/**
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {import('./quizTypes').QuizSession}
 */
export function createQuizSession(config) {
  const normalizedConfig = normalizeQuizConfigForGeneration(config)
  const seenState = _seenStateFromHistory()

  if (normalizedConfig.mode === 'coach') {
    const { questions, expandedScope, originalScopeType, expandedScopeTo, excludedCount } = _buildMockPool(normalizedConfig, true, seenState)
    const finalQuestions = ensureQuestionCount(questions, normalizedConfig)
      .map(q => enrichQuestionWithUsmleTaxonomy(q, normalizedConfig))
      .map(shuffleQuestionOptions)

    return {
      id: `session_${Date.now()}`,
      mode: 'coach',
      config: normalizedConfig,
      questions: finalQuestions,
      answers: {},
      currentIndex: 0,
      startedAt: new Date().toISOString(),
      ..._buildSessionMetadata(config, finalQuestions, excludedCount),
      ...(expandedScope ? { expandedScope: true, originalScope: originalScopeType, expandedScopeTo } : {}),
    }
  }

  const { questions, expandedScope, originalScopeType, expandedScopeTo, excludedCount } = _buildMockPool(normalizedConfig, false, seenState)
  const finalQuestions = ensureQuestionCount(questions, normalizedConfig)
    .map(q => enrichQuestionWithUsmleTaxonomy(q, normalizedConfig))
    .map(shuffleQuestionOptions)

  return {
    id: `session_${Date.now()}`,
    mode: normalizedConfig.mode,
    config: normalizedConfig,
    questions: finalQuestions,
    answers: {},
    currentIndex: 0,
    startedAt: new Date().toISOString(),
    ..._buildSessionMetadata(config, finalQuestions, excludedCount),
    ...(expandedScope ? { expandedScope: true, originalScope: originalScopeType, expandedScopeTo } : {}),
  }
}
