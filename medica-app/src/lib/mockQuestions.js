import { shuffleQuestionOptions } from './questionNormalizer.js'
import { ANSWER_LETTERS, getQuestionCorrectLetter, normalizeOptions } from './answerNormalize.js'
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
  normalizeQuestionStem,
  validateUniqueQuestions,
  EMPTY_SEEN_STATE,
} from './questionDedup.js'

export { HARD_DIFFICULTY_TARGETS, validateHardDifficultyQuestion }

function _seenStateFromHistory() {
  try { return buildSeenState(getSessionHistory()) } catch { return EMPTY_SEEN_STATE }
}

/**
 * Ensures a question has 4-12 options labeled sequentially A-L (most stay at 4;
 * trusted/imported Step-style items may have more). Never truncates a valid
 * question and never mislabels the correct answer.
 * @param {object} q
 * @returns {import('./quizTypes').QuizQuestion}
 */
export function normalizeQuestion(q) {
  // Support q.correctAnswer (AI-generated) or q.correct (mock), numeric or letter.
  // Locate the correct option's position BEFORE relabeling - normalizeOptions may
  // drop a malformed entry, shifting later positions, so comparing the original
  // letter against the already-relabeled array (post-shift) would silently point
  // at the wrong option's text instead of the one actually authored as correct.
  const preLabelOpts = normalizeOptions(q.options).slice(0, ANSWER_LETTERS.length)
  const rawCorrect = getQuestionCorrectLetter(q)
  const correctIdx = preLabelOpts.findIndex(option => option.letter === rawCorrect)
  if (correctIdx < 0) {
    console.error(`[normalizeQuestion] correct answer '${rawCorrect}' has no matching option for question ${q.id}`)
    throw Object.assign(
      new Error('This question could not be loaded. Please try again or choose a different question.'),
      { code: 'INVALID_CORRECT_ANSWER', questionId: q.id },
    )
  }

  const opts = preLabelOpts.map((o, i) => ({
    letter: ANSWER_LETTERS[i],
    text: o.text,
  }))
  const correct = ANSWER_LETTERS[correctIdx]

  // Remap optionExplanations from original letter -> new letter using the same
  // index correspondence as the options relabel above, so a dropped/shifted
  // option's explanation stays attached to the option it was actually written for.
  const rawExplanations = q.optionExplanations || {}
  const remappedExplanations = {}
  preLabelOpts.forEach((o, i) => {
    const exp = rawExplanations[o.letter]
    if (exp) remappedExplanations[ANSWER_LETTERS[i]] = exp
  })

  const normalized = normalizeQuestionTaxonomyFields({
    ...q,
    options: opts,
    correct,
    optionExplanations: remappedExplanations,
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

  for (const { letter } of question.options || []) {
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

// Representative 20-item block derived from the current USMLE Step 1 system
// specifications. A single 20-item block cannot reproduce every published
// percentage range exactly, so quotas use the nearest practical whole-item mix.
export const STEP1_STANDARD_BLOCK_BLUEPRINT = Object.freeze([
  { id: 'human-development', count: 1, areas: ['Human Development'] },
  { id: 'blood-immune', count: 2, areas: ['Blood & Lymphoreticular System', 'Immune System'] },
  { id: 'behavioral-neuro', count: 2, areas: ['Behavioral Health', 'Nervous System & Special Senses'] },
  { id: 'musculoskeletal-skin', count: 2, areas: ['Musculoskeletal System', 'Skin & Subcutaneous Tissue'] },
  { id: 'cardiovascular', count: 2, areas: ['Cardiovascular System'] },
  { id: 'respiratory-renal', count: 3, areas: ['Respiratory System', 'Renal & Urinary System'] },
  { id: 'gastrointestinal', count: 1, areas: ['Gastrointestinal System'] },
  {
    id: 'reproductive-endocrine',
    count: 3,
    areas: [
      'Pregnancy, Childbirth, & the Puerperium',
      'Female and Transgender Reproductive System & Breast',
      'Male and Transgender Reproductive System',
      'Endocrine System',
    ],
  },
  { id: 'multisystem', count: 2, areas: ['Multisystem Processes & Disorders'] },
  {
    id: 'biostatistics-epidemiology',
    count: 1,
    areas: ['Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  },
  { id: 'social-sciences', count: 1, areas: ['Social Sciences'] },
])

const STEP1_BLUEPRINT_BY_AREA = new Map(
  STEP1_STANDARD_BLOCK_BLUEPRINT.flatMap(group => group.areas.map(area => [area, group.id])),
)

export function getStep1BlueprintGroup(question) {
  return STEP1_BLUEPRINT_BY_AREA.get(question?.usmleContentArea) || null
}

function _shuffleWith(items, random = Math.random) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

/** Selects a representative current-format Step 1 block without duplicating questions. */
export function selectStandardizedStep1Questions(questions, questionCount = 20, random = Math.random) {
  const target = Number(questionCount) || 20
  const unique = dedupeQuestionList(questions || [])
  if (target !== 20) return _shuffleWith(unique, random).slice(0, target)

  const selected = []
  const selectedIds = new Set()
  const selectedConcepts = new Set()
  const selectedTopics = new Set()
  const keyFor = value => normalizeQuestionStem(String(value || ''))
  const canSelect = question => {
    const concept = keyFor(question.testedConcept)
    const topic = keyFor(question.topic || question.usmleSubdomain)
    return !selectedIds.has(question.id)
      && (!concept || !selectedConcepts.has(concept))
      && (!topic || !selectedTopics.has(topic))
  }
  const addQuestion = question => {
    selected.push(question)
    selectedIds.add(question.id)
    const concept = keyFor(question.testedConcept)
    const topic = keyFor(question.topic || question.usmleSubdomain)
    if (concept) selectedConcepts.add(concept)
    if (topic) selectedTopics.add(topic)
  }

  for (const group of STEP1_STANDARD_BLOCK_BLUEPRINT) {
    const candidates = _shuffleWith(
      unique.filter(question =>
        getStep1BlueprintGroup(question) === group.id && canSelect(question)
      ),
      random,
    )
    let groupSelected = 0
    for (const question of candidates) {
      if (!canSelect(question)) continue
      addQuestion(question)
      groupSelected += 1
      if (groupSelected === group.count) break
    }
  }

  if (selected.length < target) {
    const remaining = _shuffleWith(
      unique.filter(canSelect),
      random,
    )
    for (const question of remaining) {
      if (!canSelect(question)) continue
      addQuestion(question)
      if (selected.length === target) break
    }
  }

  return _shuffleWith(selected, random)
}

// Coach Mode can use every active local question because normalization guarantees option explanations.
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

  const isStandardized = isStandardized40QuestionBlock(config)
  const is40Q = target === 40 && config.mode === 'exam'
  const label = isStandardized
    ? 'Not enough unique questions available for a current USMLE Step 1 block.'
    : is40Q
      ? 'Not enough unique questions available for a 40-question exam.'
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
  const isStandardizedStep1Block =
    isStandardized40QuestionBlock(normalizedConfig) &&
    normalizedConfig.mode === 'exam' &&
    normalizedConfig.questionCount === 20

  // Standardized blocks must be unique within the block, but old session history
  // should not permanently prevent a user from starting another current-format block.
  const dedupedPool = pool
  pool = unseenPool
  if (isStandardizedStep1Block && pool.length < normalizedConfig.questionCount) {
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
  const selected = isStandardized40QuestionBlock(normalizedConfig)
    ? selectStandardizedStep1Questions(questions, normalizedConfig.questionCount)
    : questions
  return ensureQuestionCount(selected, normalizedConfig)
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
  const selectedQuestions = isStandardized40QuestionBlock(normalizedConfig)
    ? selectStandardizedStep1Questions(questions, normalizedConfig.questionCount)
    : questions
  const finalQuestions = ensureQuestionCount(selectedQuestions, normalizedConfig)
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
