import { shuffleQuestionOptions } from './questionNormalizer.js'
import { getQuestionCorrectLetter } from './answerNormalize.js'
import { normalizeQuizConfigForGeneration } from './quizTypes.js'
import { enrichQuestionWithUsmleTaxonomy, PHYSICIAN_TASKS, USMLE_CONTENT_AREAS } from './usmleTaxonomy.js'
import {
  resolveGenerationScope,
  normalizeGenerationConfig,
  isSpecificScope,
  isQuestionInScope,
  detectDuplicateQuestions,
  applyExpandedScopeMetadata,
} from './generationScope.js'
import { applyTopicMetadataToQuestion } from './topicIntelligence.js'
import { filterReportedQuestions, getSessionHistory } from './storage.js'
import { BALANCED_QUESTIONS } from './questionBanks/balancedQuestions.js'
import { NBME_QUESTIONS } from './questionBanks/nbmeQuestions.js'
import { UWORLD_QUESTIONS } from './questionBanks/uworldQuestions.js'
import {
  buildSeenState,
  filterUnseenQuestions,
  validateUniqueQuestions,
  EMPTY_SEEN_STATE,
} from './questionDedup.js'

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
  return enrichQuestionWithUsmleTaxonomy({ ...q, options: opts, correct })
}

// Only these questions have full optionExplanations for Coach Mode.
export const ENRICHED_IDS = new Set(['q001', 'q002', 'q003', 'q004', 'q005', 'q006', 'q007', 'q008', 'q009', 'q010', 'q011', 'q012', 'q013', 'q014', 'q015', 'q016', 'q017', 'q018', 'q019', 'q020', 'q021', 'q022', 'q023', 'q024', 'q025', 'q026', 'q027', 'q028', 'q029', 'q030', 'q031', 'q032', 'q033', 'q034', 'q039', 'q040', 'q041', 'q043', 'q048', 'q052', 'q053', 'q058', 'q061', 'q065', 'q078', 'q079', 'q080', 'qLD001', 'qLD002', 'qLD003'])

/** @type {import('./quizTypes').QuizQuestion[]} */
export const QUESTION_BANK = [
  ...BALANCED_QUESTIONS,
  ...NBME_QUESTIONS,
  ...UWORLD_QUESTIONS,
]

export function getQuestionBankDifficultyStats() {
  return QUESTION_BANK.reduce((acc, q) => {
    const key = q.difficulty || 'Balanced'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

export const HARD_DIFFICULTY_TARGETS = {
  'NBME Difficult': 40,
  'UWorld Challenge': 40,
}

const HARD_DIFFICULTY_RULES = {
  'NBME Difficult': {
    stemMin: 150,
    explanationMin: 220,
    minReasoningTerms: 4,
    minOptionLength: 10,
    minOptionWordCount: 2,
    minClinicalSignals: 2,
    minUworldOptionExplanationLength: 0,
    minWrongOptionContrasts: 0,
    requireOptionExplanations: false,
  },
  'UWorld Challenge': {
    stemMin: 180,
    explanationMin: 350,
    minReasoningTerms: 6,
    minOptionLength: 12,
    minOptionWordCount: 3,
    minClinicalSignals: 3,
    minUworldOptionExplanationLength: 60,
    minWrongOptionContrasts: 2,
    requireOptionExplanations: true,
  },
}

const HARD_REASONING_RE = /\b(because|therefore|leads? to|causes?|results? in|mechanism|pathophysiology|inhibit|activation|deficiency|excess|increase|decrease|risk|diagnosis|treatment|management|complication|contraindicat|mutation|receptor|antibody|antibodies|antigen|enzyme|transport|pressure|volume|perfusion|ischemia|hypoxia|immune|metabolism|renal|cardiac|pulmonary|hepatic|neurologic|fibrosis|fibroblastic|complement|coagulation|microthrombi|obstruction|hypertrophy|dysfunction|shock|casts|proteinuria|gradient|stenosis|fibrinogen|schistocytes|acidosis|alkalosis|potassium|sodium|insulin|glucose|ketone|arrhythmia|thyroid|carcinoma|calcitonin|pheochromocytoma|hyperparathyroidism|neoplasia|antibiotic|peptidoglycan|cross-linking|ribosomal|topoisomerase|gyrase|hypotension|bacteremia)\b/gi
const VIGNETTE_CONTEXT_RE = /\b(\d+[\s-]*(year|month|week|day)s?[\s-]*(old|aged)|man|woman|boy|girl|male|female|patient)\b/i
const OBJECTIVE_DATA_RE = /\b(mg\/dl|mmol\/l|bpm|mmhg|creatinine|hemoglobin|wbc|platelet|sodium|potassium|ph|paco2|hco3|ecg|ekg|x-ray|mri|ct|biopsy|blood pressure|heart rate|temperature|antibody|enzyme|mutation|urinalysis|csf|serum|plasma|oxygen|spo2)\b/i
const LEAD_IN_RE = /\b(which|what|why|how|most likely|best explains|best describes|next step|mechanism|diagnosis|management|treatment)\b/i
const CLINICAL_SIGNAL_RE = /\b(\d+[\s-]*(year|month|week|day|hour)s?[\s-]*(old|aged|flight)?|bp|hr|spo2|wbc|rbc|platelet|creatinine|bun|hemoglobin|hematocrit|sodium|potassium|na|k|chloride|bicarbonate|hco3|ph|paco2|pao2|glucose|calcium|magnesium|phosphate|albumin|bilirubin|ast|alt|alp|inr|pt|ptt|troponin|lactate|cortisol|acth|serum|plasma|urine|ua|urinalysis|csf|biopsy|ct|mri|x-ray|cxr|ecg|ekg|ultrasound|doppler|flow cytometry|wells|dvt|valve area|gradient|ammonia|c3|c4|cd3|t cells?|b cells?|antibody|mutation|enzyme|receptor|mmhg|mg\/dl|µg\/dl|mcg\/dl|meq\/l|mmol\/l|µmol\/l|umol\/l|u\/l|\/ul|cm²|cm2|%|°?c)\b/gi
const WRONG_OPTION_CONTRAST_RE = /\b(not|does not|do not|instead|whereas|however|although|unlike|lacks?|incorrect|wrong|would|rather than|but|in contrast|less likely|rules out|incompatible|not the|fails to|neither|feature of|opposite of)\b/i
const GENERIC_HARD_OPTION_RE = /^(all of the above|none of the above|unknown|other|correct|wrong|no|yes|maybe|not sure)$/i
const OFFICIAL_CONTENT_AREAS = new Set(USMLE_CONTENT_AREAS)
const OFFICIAL_PHYSICIAN_TASKS = new Set(PHYSICIAN_TASKS)
const NBME_PATIENT_ANCHOR_RE = /\b(\d+[\s-]*(year|month|week|day)s?[\s-]*(old|aged)|pregnant|premenopausal|postmenopausal|healthy|newborn|infant|child|adolescent|man|woman|boy|girl|male|female|patient)\b/i
const NBME_CLINICAL_SIGNAL_RE = /\b(history|presents?|comes? to|brought to|admitted|evaluated|complain|reports?|develops?|progressive|sudden|acute|chronic|week|month|day|hour|pain|dyspnea|fatigue|fever|swelling|redness|stiffness|visual|difficulty|fracture|exercise|spotting|pregnancy|mother|family|x-rays?|radiograph|examination|biopsy|catheterization|serum|urine|blood|prothrombin|hcg|vital signs|weight|medication|operation|replacement|risk)\b/i
const NBME_LEAD_IN_RE = /\b(which of the following|which is|what is|why does|most likely|most appropriate|best describes|best explains|next best step|next step|mechanism|diagnosis|location|additional information|finding|cause|risk|drug|treatment|management|intervention|approach|enzyme deficiency|subtype)\b/i
const NBME_TEACHING_STEM_RE = /\b(remember|note that|teaches|high-yield|classic clue|board trick|you should know)\b/i

function _reasoningTermCount(text) {
  return (String(text || '').toLowerCase().match(HARD_REASONING_RE) || []).length
}

function _optionTexts(question) {
  return Array.isArray(question.options)
    ? question.options.map(o => String(o?.text || o || '').trim())
    : []
}

function _normalizeHardOption(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function _wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length
}

function _clinicalSignalCount(text) {
  return new Set(String(text || '').toLowerCase().match(CLINICAL_SIGNAL_RE) || []).size
}

function _hasDuplicateOptionMeaning(options) {
  const normalized = options.map(_normalizeHardOption).filter(Boolean)
  return new Set(normalized).size !== normalized.length
}

function _hasAllOptionExplanations(question) {
  return ['A', 'B', 'C', 'D'].every(letter => String(question.optionExplanations?.[letter] ?? '').trim())
}

function _hasDeepUworldOptionExplanations(question, minLength) {
  if (minLength <= 0) return true
  return ['A', 'B', 'C', 'D'].every(letter => String(question.optionExplanations?.[letter] ?? '').trim().length >= minLength)
}

function _wrongOptionContrastCount(question) {
  const correct = getQuestionCorrectLetter(question)
  return ['A', 'B', 'C', 'D'].filter(letter => {
    if (letter === correct) return false
    return WRONG_OPTION_CONTRAST_RE.test(String(question.optionExplanations?.[letter] || ''))
  }).length
}

function _hasNbmeClueLeakage(question, stem) {
  const correct = getQuestionCorrectLetter(question)
  const correctText = _optionTexts(question)[['A', 'B', 'C', 'D'].indexOf(correct)] || ''
  const answer = _normalizeHardOption(correctText)
  const normalizedStem = _normalizeHardOption(stem)
  if (!answer || answer.length < 9) return false
  if (normalizedStem.includes(answer)) return true

  const answerWords = answer.split(/\s+/).filter(w => w.length >= 6)
  if (answerWords.length < 2) return false
  const leaked = answerWords.filter(w => normalizedStem.includes(w)).length
  return leaked / answerWords.length >= 0.8
}

function _validateHardQuestionMetadata(question, reasons) {
  if (!String(question.testedConcept || '').trim()) reasons.push('missing_tested_concept')
  if (!String(question.questionAngle || '').trim()) reasons.push('missing_question_angle')
  if (!String(question.usmleContentArea || '').trim()) reasons.push('missing_usmle_content_area')
  if (!String(question.physicianTask || '').trim()) reasons.push('missing_physician_task')
  if (question.usmleContentArea && !OFFICIAL_CONTENT_AREAS.has(question.usmleContentArea)) reasons.push('non_official_usmle_content_area')
  if (question.physicianTask && !OFFICIAL_PHYSICIAN_TASKS.has(question.physicianTask)) reasons.push('non_official_physician_task')
}

function validateNbmeDifficultyQuestion(question) {
  const reasons = []
  const stem = String(question.stem || '').trim()
  const options = _optionTexts(question)

  if (stem.length < 70) reasons.push('nbme_stem_too_short')
  if (!NBME_PATIENT_ANCHOR_RE.test(stem)) reasons.push('missing_patient_anchor')
  if (!NBME_CLINICAL_SIGNAL_RE.test(stem) && _clinicalSignalCount(stem) === 0) reasons.push('weak_clinical_signal')
  if (!NBME_LEAD_IN_RE.test(stem) || !/\?\s*$/.test(stem)) reasons.push('weak_single_best_answer_lead_in')
  if (NBME_TEACHING_STEM_RE.test(stem)) reasons.push('teaching_language_in_stem')
  if (options.length !== 4 && options.length !== 5 && options.length !== 6) reasons.push('invalid_options')
  if (options.some(text => !text || text.length < 4)) reasons.push('weak_distractors')
  if (options.some(text => text.length > 160)) reasons.push('non_concise_nbme_options')
  if (options.some(text => GENERIC_HARD_OPTION_RE.test(text))) reasons.push('low_plausibility_hard_options')
  if (_hasDuplicateOptionMeaning(options)) reasons.push('duplicated_hard_options')
  if (_hasNbmeClueLeakage(question, stem)) reasons.push('clue_leakage')

  _validateHardQuestionMetadata(question, reasons)
  return reasons
}

export function validateHardDifficultyQuestion(question) {
  const difficulty = question?.difficulty || 'Balanced'
  if (difficulty === 'NBME Difficult') return validateNbmeDifficultyQuestion(question)

  const rules = HARD_DIFFICULTY_RULES[difficulty]
  if (!rules) return []

  const reasons = []
  const stem = String(question.stem || '').trim()
  const explanation = String(question.explanation || '').trim()
  const options = _optionTexts(question)
  const combinedReasoningText = `${stem} ${explanation}`

  if (stem.length < rules.stemMin) reasons.push('hard_stem_too_short')
  if (!VIGNETTE_CONTEXT_RE.test(stem)) reasons.push('missing_patient_context')
  if (!OBJECTIVE_DATA_RE.test(stem)) reasons.push('missing_objective_data')
  if (_clinicalSignalCount(stem) < rules.minClinicalSignals) reasons.push('insufficient_clinical_signal_density')
  if (!LEAD_IN_RE.test(stem) || !/\?\s*$/.test(stem)) reasons.push('weak_single_best_answer_lead_in')
  if (_reasoningTermCount(combinedReasoningText) < rules.minReasoningTerms) reasons.push('insufficient_reasoning_depth')
  if (explanation.length < rules.explanationMin) reasons.push('hard_explanation_too_short')
  if (options.length !== 4 || options.some(text => text.length < rules.minOptionLength)) reasons.push('weak_hard_distractors')
  if (options.some(text => _wordCount(text) < rules.minOptionWordCount || GENERIC_HARD_OPTION_RE.test(text))) reasons.push('low_plausibility_hard_options')
  if (_hasDuplicateOptionMeaning(options)) reasons.push('duplicated_hard_options')
  _validateHardQuestionMetadata(question, reasons)
  if (rules.requireOptionExplanations && !_hasAllOptionExplanations(question)) reasons.push('missing_uworld_option_explanations')
  if (!_hasDeepUworldOptionExplanations(question, rules.minUworldOptionExplanationLength)) reasons.push('shallow_uworld_option_explanations')
  if (_wrongOptionContrastCount(question) < rules.minWrongOptionContrasts) reasons.push('weak_wrong_option_teaching')

  return reasons
}

export function getAvailableQuestionCountForConfig(config) {
  const normalizedConfig = normalizeQuizConfigForGeneration(config)
  const difficulty = normalizedConfig?.difficulty || 'Balanced'
  if (!difficulty || difficulty === 'Balanced') return QUESTION_BANK.length
  return QUESTION_BANK.filter(q => q.difficulty === difficulty).length
}

export function getDifficultyAvailability(config) {
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
    requiresBackend: difficulty !== 'Balanced' && available < requested,
  }
}

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
 * isQuestionInScope and expands to system → subject → global when < 2 results.
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
    ? QUESTION_BANK.filter(q => ENRICHED_IDS.has(q.id))
    : QUESTION_BANK
  ).map(normalizeQuestion)

  let pool = bank
  let expandedScope = false
  const originalScopeType = scope.scopeType
  let expandedScopeTo = null

  if (isSpecificScope(scope)) {
    const inScope = bank.filter(q => isQuestionInScope(q, scope))
    if (inScope.length >= 2) {
      pool = inScope
    } else {
      expandedScope = true
      const sysPool = scope.system ? bank.filter(q => q.system === scope.system) : []
      const subPool = scope.subject ? bank.filter(q => q.subject === scope.subject) : []

      if (sysPool.length >= 2) {
        pool = sysPool
        expandedScopeTo = 'system'
      } else if (subPool.length >= 2) {
        pool = subPool
        expandedScopeTo = 'subject'
      } else {
        pool = bank
        expandedScopeTo = 'global'
      }
    }
  } else if (scope.scopeType === 'system') {
    const filtered = bank.filter(q => q.system === scope.scopeText)
    if (filtered.length >= 2) pool = filtered
  } else if (scope.scopeType === 'subject') {
    const filtered = bank.filter(q => q.subject === scope.scopeText)
    if (filtered.length >= 2) pool = filtered
  }

  if (normalizedConfig.difficulty && normalizedConfig.difficulty !== 'Balanced') {
    const diffPool = pool.filter(q => q.difficulty === normalizedConfig.difficulty)
    if (diffPool.length >= 2) pool = diffPool
  }

  pool = detectDuplicateQuestions(pool)

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
  pool = filterReportedQuestions(filterUnseenQuestions(pool, seenState)).sort(() => Math.random() - 0.5)
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
