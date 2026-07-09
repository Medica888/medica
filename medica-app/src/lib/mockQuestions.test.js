import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ANSWER_LETTERS } from './answerNormalize.js'
import { normalizeQuestionStem, validateUniqueQuestions } from './questionDedup.js'

vi.mock('./storage.js', () => ({
  filterReportedQuestions: vi.fn(questions => questions),
  getSessionHistory: vi.fn(() => []),
  getTrustedGeneratedQuestionsForConfig: vi.fn(() => []),
  appendTrustedGeneratedQuestions: vi.fn(),
}))

vi.mock('./apiClient.js', () => ({
  isAuthenticated: vi.fn(() => false),
}))

import { filterReportedQuestions, getSessionHistory } from './storage.js'
import { STANDARDIZED_40Q_BLOCK, STANDARDIZED_STEP1_BLOCK } from './quizTypes.js'
import {
  createQuizSession,
  createSelectedQuestionSession,
  ensureQuestionCount,
  getAvailableQuestionCountForConfig,
  getBankQuestionsForConfig,
  QUESTION_BANK,
  ACTIVE_QUESTION_BANK,
  ENRICHED_IDS,
  getDifficultyAvailability,
  getQuestionBankDifficultyStats,
  getBrowsableQuestionBank,
  getStep1BlueprintGroup,
  STEP1_STANDARD_BLOCK_BLUEPRINT,
  normalizeQuestion,
  validateHardDifficultyQuestion,
} from './mockQuestions.js'
import {
  QUARANTINED_IDS,
  isQuarantined,
  detectTemplateClonesInBank,
} from './questionQualityRegistry.js'
import { validateBankQuestion } from './ai/generateAIQuestions.js'
import {
  buildCommercialQuestionBankReadiness,
  buildQuestionBankCoverageReport,
  formatCoverageRows,
} from './questionBankCoverage.js'

const baseConfig = {
  mode:          'practice',
  subject:       'All Subjects',
  system:        'All Systems',
  topic:         '',
  questionCount: 5,
  difficulty:    'Balanced',
  clinicalFocus: '',
}

const standardizedStep1Config = {
  ...baseConfig,
  mode:          'exam',
  questionCount: 20,
  difficulty:    'standardized',
  blockType:     STANDARDIZED_STEP1_BLOCK,
}

beforeEach(() => {
  vi.mocked(getSessionHistory).mockReturnValue([])
  vi.mocked(filterReportedQuestions).mockImplementation(questions => questions)
})

// ─── Test 1: ensureQuestionCount never clones ─────────────────────────────────

describe('ensureQuestionCount — test 1: no cloning', () => {
  it('throws INSUFFICIENT_QUESTIONS instead of cloning when pool < requested', () => {
    const pool   = [{ id: 'q1', stem: 'A', correct: 'A', options: [] }]
    const config = { questionCount: 3 }
    expect(() => ensureQuestionCount(pool, config)).toThrow('Not enough unique questions')
  })

  it('returns exact slice when pool >= requested', () => {
    const pool   = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `s${i}` }))
    const config = { questionCount: 5 }
    const result = ensureQuestionCount(pool, config)
    expect(result).toHaveLength(5)
    expect(result.every(q => pool.includes(q))).toBe(true)
  })

  it('never produces _v1 or _v2 IDs', () => {
    const pool   = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `Stem number ${i} about medicine` }))
    const config = { questionCount: 5 }
    const result = ensureQuestionCount(pool, config)
    expect(result.every(q => !q.id.includes('_v'))).toBe(true)
  })
})

// ─── Current Step 1 and custom 40-question blocks ─────────────────────────────

describe('ensureQuestionCount — strict block messages', () => {
  it('throws with custom 40Q message when pool < 40 for exam mode', () => {
    const pool   = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `Stem ${i}` }))
    const config = { questionCount: 40, mode: 'exam' }
    expect(() => ensureQuestionCount(pool, config))
      .toThrow('Not enough unique questions available for a 40-question exam.')
  })
})

describe('createQuizSession — current Step 1 block behavior', () => {
  it('creates a unique current-format 20-question block', () => {
    const session = createQuizSession(standardizedStep1Config)
    expect(session.questions).toHaveLength(20)
    expect(validateUniqueQuestions(session.questions).valid).toBe(true)
    expect(session.config.blockType).toBe(STANDARDIZED_STEP1_BLOCK)
    expect(session.config.difficulty).toBe('Balanced')
  })

  it('selects the representative USMLE system blueprint', () => {
    const session = createQuizSession(standardizedStep1Config)
    const counts = new Map()
    for (const question of session.questions) {
      const group = getStep1BlueprintGroup(question)
      counts.set(group, (counts.get(group) || 0) + 1)
    }
    for (const group of STEP1_STANDARD_BLOCK_BLUEPRINT) {
      expect(counts.get(group.id), group.id).toBe(group.count)
    }
  })

  it('does not repeat a tested concept or narrow topic within the block', () => {
    const session = createQuizSession(standardizedStep1Config)
    const concepts = session.questions.map(question => normalizeQuestionStem(question.testedConcept || ''))
    const topics = session.questions.map(question => normalizeQuestionStem(question.topic || question.usmleSubdomain || ''))

    expect(new Set(concepts.filter(Boolean)).size).toBe(concepts.filter(Boolean).length)
    expect(new Set(topics.filter(Boolean)).size).toBe(topics.filter(Boolean).length)
  })

  it('does not filter the current block by a fake standardized difficulty', () => {
    expect(getAvailableQuestionCountForConfig(standardizedStep1Config)).toBe(ACTIVE_QUESTION_BANK.length)

    const pool = getBankQuestionsForConfig(standardizedStep1Config)

    expect(pool.length).toBeGreaterThanOrEqual(20)
    expect(pool.every(q => q.difficulty !== 'standardized')).toBe(true)
  })

  it('still starts when old seen history leaves fewer than 20 unseen questions', () => {
    // Mark enough questions as seen so <20 remain unseen; standardized blocks
    // may reuse old-session questions while preserving in-block uniqueness.
    const allIds = ACTIVE_QUESTION_BANK.slice(0, ACTIVE_QUESTION_BANK.length - 19).map(q => q.id)
    vi.mocked(getSessionHistory).mockReturnValueOnce([{ questionIds: allIds, missedQuestions: [] }])
    const session = createQuizSession(standardizedStep1Config)

    expect(session.questions).toHaveLength(20)
    expect(validateUniqueQuestions(session.questions).valid).toBe(true)
  })

  it('still throws when reported questions reduce the standardized pool below 20', () => {
    vi.mocked(filterReportedQuestions).mockImplementation(questions => questions.slice(0, 19))

    expect(() => createQuizSession(standardizedStep1Config)).toThrow('Not enough unique questions')
  })

  it('migrates the saved legacy 40-question preset to the current format', () => {
    const session = createQuizSession({
      ...standardizedStep1Config,
      questionCount: 40,
      blockType: STANDARDIZED_40Q_BLOCK,
    })
    expect(session.questions).toHaveLength(20)
    expect(session.config.blockType).toBe(STANDARDIZED_STEP1_BLOCK)
  })

  it('keeps NBME 40Q difficulty behavior unchanged', () => {
    const session = createQuizSession({
      ...baseConfig,
      mode: 'exam',
      questionCount: 40,
      difficulty: 'NBME Difficult',
    })

    expect(session.questions).toHaveLength(40)
    expect(session.questions.every(q => q.difficulty === 'NBME Difficult')).toBe(true)
  })

  it('keeps UWorld 40Q difficulty behavior unchanged', () => {
    const config = {
      ...baseConfig,
      mode: 'exam',
      questionCount: 40,
      difficulty: 'UWorld Challenge',
    }
    const availability = getDifficultyAvailability(config)
    const pool = getBankQuestionsForConfig(config)

    expect(availability.target).toBe(40)
    expect(availability.requiresBackend).toBe(false)
    expect(pool.every(q => q.difficulty === 'UWorld Challenge')).toBe(true)
  })
})

describe('local bank scope availability', () => {
  it('never broadens a thin subject selection to unrelated subjects', () => {
    const counts = new Map()
    for (const question of ACTIVE_QUESTION_BANK) {
      counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1)
    }
    const [subject, count] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0]
    const config = {
      ...baseConfig,
      subject,
      system: 'All Systems',
      questionCount: count + 1,
    }

    const pool = getBankQuestionsForConfig(config)
    const availability = getDifficultyAvailability(config)

    expect(pool).toHaveLength(count)
    expect(pool.every(question => question.subject === subject)).toBe(true)
    expect(availability.available).toBe(count)
    expect(availability.requiresBackend).toBe(true)
  })

  it('never broadens a thin system selection to unrelated systems', () => {
    const counts = new Map()
    for (const question of ACTIVE_QUESTION_BANK) {
      counts.set(question.system, (counts.get(question.system) ?? 0) + 1)
    }
    const [system, count] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0]
    const config = {
      ...baseConfig,
      subject: 'All Subjects',
      system,
      questionCount: count + 1,
    }

    const pool = getBankQuestionsForConfig(config)
    const availability = getDifficultyAvailability(config)

    expect(pool).toHaveLength(count)
    expect(pool.every(question => question.system === system)).toBe(true)
    expect(availability.available).toBe(count)
    expect(availability.requiresBackend).toBe(true)
  })

  it('does not substitute another difficulty when an exact hard-mode scope is thin', () => {
    const hardQuestions = ACTIVE_QUESTION_BANK.filter(question => question.difficulty === 'UWorld Challenge')
    const counts = new Map()
    for (const question of hardQuestions) {
      counts.set(question.subject, (counts.get(question.subject) ?? 0) + 1)
    }
    const [subject, count] = [...counts.entries()].sort((a, b) => a[1] - b[1])[0]
    const config = {
      ...baseConfig,
      subject,
      system: 'All Systems',
      difficulty: 'UWorld Challenge',
      questionCount: count + 1,
    }

    const pool = getBankQuestionsForConfig(config)

    expect(pool).toHaveLength(count)
    expect(pool.every(question => question.subject === subject)).toBe(true)
    expect(pool.every(question => question.difficulty === 'UWorld Challenge')).toBe(true)
  })
})

// ─── Test 5: cross-session exclusion ──────────────────────────────────────────

describe('createQuizSession — test 5: excludes previously seen questions', () => {
  it('does not reuse question IDs from session history', () => {
    vi.mocked(getSessionHistory).mockReturnValue([
      { questionIds: ['q001', 'q002', 'q003'], missedQuestions: [] },
    ])
    const session = createQuizSession(baseConfig)
    const ids     = session.questions.map(q => q.id)
    expect(ids).not.toContain('q001')
    expect(ids).not.toContain('q002')
    expect(ids).not.toContain('q003')
  })

  it('passes the mock pool through the reported-question filter', () => {
    createQuizSession(baseConfig)

    expect(filterReportedQuestions).toHaveBeenCalled()
  })
})

// ─── Test 6: fails clearly when not enough unseen questions ───────────────────

describe('createQuizSession — test 6: fails clearly when pool exhausted', () => {
  it('throws INSUFFICIENT_QUESTIONS when all questions have been seen', () => {
    // Mark all questions as seen using the exported QUESTION_BANK
    const allIds = QUESTION_BANK.map(q => q.id)
    vi.mocked(getSessionHistory).mockReturnValue([
      { questionIds: allIds, missedQuestions: [] },
    ])
    const config = { ...baseConfig, questionCount: 3 }
    expect(() => createQuizSession(config)).toThrow('Not enough unique questions')
  })
})

// ─── Tests 12–14: no duplicates per mode ─────────────────────────────────────

describe('createQuizSession — test 12: coach mode no duplicates', () => {
  it('produces unique questions in coach mode', () => {
    const config  = { ...baseConfig, mode: 'coach', questionCount: 3 }
    const session = createQuizSession(config)
    const result  = validateUniqueQuestions(session.questions)
    expect(result.valid).toBe(true)
  })
})

describe('createQuizSession — test 13: practice mode no duplicates', () => {
  it('produces unique questions in practice mode', () => {
    const session = createQuizSession({ ...baseConfig, mode: 'practice', questionCount: 5 })
    const result  = validateUniqueQuestions(session.questions)
    expect(result.valid).toBe(true)
  })
})

describe('createQuizSession — test 14: exam mode no duplicates', () => {
  it('produces unique questions in exam mode', () => {
    const session = createQuizSession({ ...baseConfig, mode: 'exam', questionCount: 10 })
    const result  = validateUniqueQuestions(session.questions)
    expect(result.valid).toBe(true)
  })
})

// ─── Test 15: session metadata ────────────────────────────────────────────────

describe('createQuizSession — test 15: session metadata is written', () => {
  it('includes all required session metadata fields', () => {
    const session = createQuizSession(baseConfig)
    expect(session.source).toBe('mock-fallback')
    expect(session.questionSource).toBe('mock-fallback')
    expect(typeof session.generatedAt).toBe('string')
    expect(session.requestedQuestionCount).toBe(baseConfig.questionCount)
    expect(typeof session.uniqueQuestionCount).toBe('number')
    expect(session.hasDuplicateQuestions).toBe(false)
    expect(session.hasClonedQuestions).toBe(false)
    expect(session.hasReusedQuestions).toBe(false)
    expect(typeof session.excludedPreviousQuestionCount).toBe('number')
    expect(session.generationConfigSnapshot).toMatchObject({ mode: 'practice' })
  })
})

describe('createQuizSession - USMLE taxonomy', () => {
  it('adds official content and physician-task metadata to mock questions', () => {
    const session = createQuizSession({ ...baseConfig, system: 'Cardiovascular', questionCount: 3 })

    expect(session.questions).toHaveLength(3)
    for (const q of session.questions) {
      expect(q.usmleContentArea, `${q.id} missing content area`).toBeTruthy()
      expect(q.physicianTask, `${q.id} missing physician task`).toBeTruthy()
      expect(q.usmleSubdomain, `${q.id} missing subdomain`).toBeTruthy()
    }
  })

  it('uses canonical subject and system labels when filtering and returning questions', () => {
    const cardio = createQuizSession({
      ...baseConfig,
      system: 'Cardiovascular System',
      questionCount: 3,
    })

    expect(cardio.questions).toHaveLength(3)
    expect(cardio.questions.every(q => q.system === 'Cardiovascular')).toBe(true)

    const neuro = createQuizSession({
      ...baseConfig,
      subject: 'Neuroscience',
      questionCount: 3,
    })

    expect(neuro.questions).toHaveLength(3)
    expect(neuro.questions.every(q => q.subject === 'Neurology')).toBe(true)
  })

  it('filters by exact subject and system intersection when both are selected', () => {
    const cases = [
      { subject: 'Pharmacology', system: 'Cardiovascular' },
      { subject: 'Pathology', system: 'Cardiovascular' },
      { subject: 'Physiology', system: 'Renal / Urinary' },
      { subject: 'Microbiology', system: 'Infectious Disease' },
    ]

    for (const { subject, system } of cases) {
      const pool = getBankQuestionsForConfig({
        ...baseConfig,
        subject,
        system,
        questionCount: 10,
      })

      expect(pool.length, `${subject} + ${system} should have exact local candidates`).toBeGreaterThan(0)
      expect(pool.every(q => q.subject === subject), `${subject} + ${system} leaked wrong subject`).toBe(true)
      expect(pool.every(q => q.system === system), `${subject} + ${system} leaked wrong system`).toBe(true)
    }
  })

  it('does not silently expand unmatched manual topics to the global bank', () => {
    const topics = [
      'banana heart magic',
      'breast cancers',
      'patellar dislocations',
    ]

    for (const topic of topics) {
      const pool = getBankQuestionsForConfig({
        ...baseConfig,
        topic,
        questionCount: 10,
      })

      expect(pool, `${topic} should require AI/topic classification instead of global fallback`).toHaveLength(0)
    }
  })

  it('does not broaden thin manual topics to system-level local questions', () => {
    const pool = getBankQuestionsForConfig({
      ...baseConfig,
      topic: 'loop diuretics',
      questionCount: 10,
    })

    expect(pool.length).toBeGreaterThan(0)
    expect(pool.length).toBeLessThan(10)
    expect(pool.every(q => /loop diuretic/i.test([
      q.topic,
      q.testedConcept,
      q.canonicalTopic,
      q.rawTopic,
      q.weakSpotCategory,
    ].join(' ')))).toBe(true)
  })

  it('does not treat broad taxonomy labels entered as topics as local-bank scopes', () => {
    const topics = [
      'Pharmacology',
      'Cardiovascular',
      'Cardiovascular System',
    ]

    for (const topic of topics) {
      const pool = getBankQuestionsForConfig({
        ...baseConfig,
        topic,
        questionCount: 10,
      })

      expect(pool, `${topic} should be selected via subject/system controls, not topic scope`).toHaveLength(0)
    }
  })
})

// ─── Test 5: Coach 10Q session has full optionExplanations ───────────────────

describe('createQuizSession — test 5: coach 10Q has optionExplanations A-D', () => {
  it('all questions in a coach 10Q session have non-empty optionExplanations for A, B, C, D', () => {
    const config = { ...baseConfig, mode: 'coach', questionCount: 10 }
    const session = createQuizSession(config)

    expect(session.questions).toHaveLength(10)
    for (const q of session.questions) {
      expect(q.optionExplanations, `${q.id} missing optionExplanations`).toBeTruthy()
      for (const { letter } of q.options) {
        expect(
          String(q.optionExplanations[letter] ?? '').trim(),
          `${q.id} has empty optionExplanations[${letter}]`,
        ).not.toBe('')
      }
    }
  })

  it('coach session never contains questions missing optionExplanations even after shuffling', () => {
    // Run several times to catch shuffle-dependent failures
    for (let i = 0; i < 5; i++) {
      const session = createQuizSession({ ...baseConfig, mode: 'coach', questionCount: 5 })
      for (const q of session.questions) {
        expect(q.options.every(option => String(q.optionExplanations?.[option.letter] ?? '').trim())).toBe(true)
      }
    }
  })
})

// ─── Bank-wide validation ─────────────────────────────────────────────────────

describe('QUESTION_BANK — structural and semantic validation', () => {
  it('has at least 100 questions after Stage 2 expansion', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(100)
  })

  it('tracks hard-difficulty bank coverage against the hard-mode product targets', () => {
    const stats = getQuestionBankDifficultyStats()

    expect(stats['NBME Difficult']).toBeGreaterThan(0)
    expect(stats['UWorld Challenge']).toBeGreaterThan(0)
    expect(stats['NBME Difficult']).toBeGreaterThanOrEqual(40)
    expect(stats['UWorld Challenge']).toBeGreaterThanOrEqual(40)

    const nbme = getDifficultyAvailability({ difficulty: 'NBME Difficult', questionCount: 40 })
    const uworld = getDifficultyAvailability({ difficulty: 'UWorld Challenge', questionCount: 40 })

    expect(nbme.target).toBe(40)
    expect(uworld.target).toBe(40)
    expect(nbme.meetsProductTarget).toBe(true)
    expect(uworld.meetsProductTarget).toBe(true)
    expect(nbme.requiresBackend).toBe(false)
    expect(uworld.requiresBackend).toBe(false)
  })

  it('every question passes structure + semantic validation in practice mode', () => {
    const config = { mode: 'practice', questionCount: 1 }
    const failures = []
    for (const q of QUESTION_BANK) {
      const reasons = validateBankQuestion(q, config)
      if (reasons.length) failures.push(`${q.id}: ${reasons.join(', ')}`)
    }
    expect(failures, failures.join('\n')).toHaveLength(0)
  })

  it('every hard-difficulty question earns its NBME/UWorld label', () => {
    const hard = QUESTION_BANK.filter(q => q.difficulty === 'NBME Difficult' || q.difficulty === 'UWorld Challenge')
    const failures = []

    for (const q of hard) {
      const reasons = validateHardDifficultyQuestion(q)
      if (reasons.length) failures.push(`${q.id} [${q.difficulty}]: ${reasons.join(', ')}`)
    }

    expect(failures, failures.join('\n')).toHaveLength(0)
  })

  it('hard-difficulty validator rejects fake hard questions', () => {
    const strong = QUESTION_BANK.find(q => q.difficulty === 'UWorld Challenge')
    expect(strong, 'need at least one UWorld control question').toBeTruthy()
    expect(validateHardDifficultyQuestion(strong)).toHaveLength(0)

    const weakStem = {
      ...strong,
      id: 'validator-short-stem',
      difficulty: 'UWorld Challenge',
      stem: 'A patient has fever. What is the diagnosis?',
    }
    expect(validateHardDifficultyQuestion(weakStem)).toEqual(
      expect.arrayContaining(['hard_stem_too_short', 'missing_objective_data']),
    )

    const missingObjectiveData = {
      ...strong,
      id: 'validator-no-objective-data',
      difficulty: 'UWorld Challenge',
      stem: 'A middle-aged man has progressive symptoms and multiple abnormal physical findings after a complicated hospital course. He has worsening physiology despite appropriate supportive care. Which mechanism best explains this presentation?',
    }
    expect(validateHardDifficultyQuestion(missingObjectiveData)).toContain('missing_objective_data')

    const weakDistractors = {
      ...strong,
      id: 'validator-weak-distractors',
      difficulty: 'UWorld Challenge',
      options: [
        { letter: 'A', text: 'Correct' },
        { letter: 'B', text: 'Wrong' },
        { letter: 'C', text: 'No' },
        { letter: 'D', text: 'Other' },
      ],
    }
    expect(validateHardDifficultyQuestion(weakDistractors)).toContain('weak_hard_distractors')

    const missingUworldExplanations = {
      ...strong,
      id: 'validator-missing-option-explanations',
      difficulty: 'UWorld Challenge',
      optionExplanations: { A: 'Correct.' },
    }
    expect(validateHardDifficultyQuestion(missingUworldExplanations)).toContain('missing_uworld_option_explanations')

    const missingMetadata = {
      ...strong,
      id: 'validator-missing-metadata',
      difficulty: 'NBME Difficult',
      testedConcept: '',
      questionAngle: '',
      usmleContentArea: '',
      physicianTask: '',
    }
    expect(validateHardDifficultyQuestion(missingMetadata)).toEqual(
      expect.arrayContaining([
        'missing_tested_concept',
        'missing_question_angle',
        'missing_usmle_content_area',
        'missing_physician_task',
      ]),
    )

    const weakLeadIn = {
      ...strong,
      id: 'validator-weak-lead-in',
      difficulty: 'UWorld Challenge',
      stem: strong.stem.replace(/\?$/, '.'),
    }
    expect(validateHardDifficultyQuestion(weakLeadIn)).toContain('weak_single_best_answer_lead_in')

    const sparseClinicalSignal = {
      ...strong,
      id: 'validator-sparse-clinical-signal',
      difficulty: 'UWorld Challenge',
      stem: 'A 54-year-old woman has progressive symptoms over several weeks and worsening illness despite supportive care. Which mechanism best explains the presentation?',
    }
    expect(validateHardDifficultyQuestion(sparseClinicalSignal)).toContain('insufficient_clinical_signal_density')

    const duplicatedOptions = {
      ...strong,
      id: 'validator-duplicated-options',
      difficulty: 'UWorld Challenge',
      options: [
        { letter: 'A', text: 'Autoantibody-mediated platelet activation through Fc receptor signaling' },
        { letter: 'B', text: 'Autoantibody-mediated platelet activation through Fc receptor signaling' },
        { letter: 'C', text: 'Direct endothelial toxin injury causing diffuse vascular leakage' },
        { letter: 'D', text: 'Complement-mediated hemolysis due to paroxysmal nocturnal hemoglobinuria' },
      ],
    }
    expect(validateHardDifficultyQuestion(duplicatedOptions)).toContain('duplicated_hard_options')

    const shallowUworldOptionTeaching = {
      ...strong,
      id: 'validator-shallow-uworld-option-teaching',
      difficulty: 'UWorld Challenge',
      optionExplanations: {
        A: 'Correct.',
        B: 'Alternative.',
        C: 'Alternative.',
        D: 'Alternative.',
      },
    }
    expect(validateHardDifficultyQuestion(shallowUworldOptionTeaching)).toContain('shallow_uworld_option_explanations')

    const weakWrongOptionTeaching = {
      ...strong,
      id: 'validator-weak-wrong-option-teaching',
      difficulty: 'UWorld Challenge',
      optionExplanations: {
        A: 'The correct option is explained with enough detail to satisfy the UWorld teaching-depth rule for the selected answer.',
        B: 'This alternative explanation is long enough to look educational while avoiding any direct contrast with the selected answer or the clinical findings.',
        C: 'This alternative explanation is long enough to look educational while avoiding any direct contrast with the selected answer or the clinical findings.',
        D: 'This alternative explanation is long enough to look educational while avoiding any direct contrast with the selected answer or the clinical findings.',
      },
    }
    expect(validateHardDifficultyQuestion(weakWrongOptionTeaching)).toContain('weak_wrong_option_teaching')

    const unofficialTaxonomy = {
      ...strong,
      id: 'validator-unofficial-taxonomy',
      difficulty: 'NBME Difficult',
      usmleContentArea: 'Cardiology',
      physicianTask: 'Random Task',
    }
    expect(validateHardDifficultyQuestion(unofficialTaxonomy)).toEqual(
      expect.arrayContaining(['non_official_usmle_content_area', 'non_official_physician_task']),
    )
  })

  it('accepts concise text-only NBME-style questions without requiring UWorld teaching depth', () => {
    const nbme = {
      id: 'validator-nbme-concise-pass',
      subject: 'Pathology',
      system: 'Musculoskeletal',
      difficulty: 'NBME Difficult',
      testedConcept: 'Osteoarthritis cartilage degeneration',
      questionAngle: 'pathology-finding',
      usmleContentArea: 'Musculoskeletal System',
      physicianTask: 'Patient Care: Diagnosis',
      stem: 'A 61-year-old man has gradually worsening knee pain that is worse at the end of the day and improves with rest. Examination shows crepitus with passive movement, and radiographs show asymmetric joint-space narrowing with osteophytes. Tissue from the affected joint would most likely show which finding?',
      options: [
        { letter: 'A', text: 'Crystal deposition within neutrophil cytoplasm' },
        { letter: 'B', text: 'Degeneration of articular cartilage with subchondral bone sclerosis' },
        { letter: 'C', text: 'Granulomatous inflammation with caseous necrosis' },
        { letter: 'D', text: 'Immune complex deposition along synovial capillaries' },
      ],
      correct: 'B',
      explanation: '',
    }

    expect(validateHardDifficultyQuestion(nbme)).toHaveLength(0)
  })

  it('rejects weak NBME questions with no patient anchor or clinical signal', () => {
    const weak = {
      id: 'validator-nbme-weak-fail',
      subject: 'Physiology',
      system: 'Respiratory',
      difficulty: 'NBME Difficult',
      testedConcept: 'Pulmonary pressure',
      questionAngle: 'mechanism',
      usmleContentArea: 'Respiratory System',
      physicianTask: 'Medical Knowledge: Applying Foundational Science Concepts',
      stem: 'What is the mechanism?',
      options: [
        { letter: 'A', text: 'Increased vascular resistance' },
        { letter: 'B', text: 'Decreased venous return' },
        { letter: 'C', text: 'Reduced surfactant production' },
        { letter: 'D', text: 'Increased airway secretion' },
      ],
      correct: 'A',
      explanation: '',
    }

    expect(validateHardDifficultyQuestion(weak)).toEqual(
      expect.arrayContaining(['nbme_stem_too_short', 'missing_patient_anchor', 'weak_clinical_signal']),
    )
  })

  it('keeps UWorld stricter than NBME for the same concise exam-style item', () => {
    const concise = {
      id: 'validator-style-separation',
      subject: 'Pathology',
      system: 'Musculoskeletal',
      testedConcept: 'Osteoarthritis cartilage degeneration',
      questionAngle: 'pathology-finding',
      usmleContentArea: 'Musculoskeletal System',
      physicianTask: 'Patient Care: Diagnosis',
      stem: 'A 61-year-old man has gradually worsening knee pain that is worse at the end of the day and improves with rest. Examination shows crepitus with passive movement, and radiographs show asymmetric joint-space narrowing with osteophytes. Tissue from the affected joint would most likely show which finding?',
      options: [
        { letter: 'A', text: 'Crystal deposition within neutrophil cytoplasm' },
        { letter: 'B', text: 'Degeneration of articular cartilage with subchondral bone sclerosis' },
        { letter: 'C', text: 'Granulomatous inflammation with caseous necrosis' },
        { letter: 'D', text: 'Immune complex deposition along synovial capillaries' },
      ],
      correct: 'B',
      explanation: '',
    }

    expect(validateHardDifficultyQuestion({ ...concise, difficulty: 'NBME Difficult' })).toHaveLength(0)
    expect(validateHardDifficultyQuestion({ ...concise, difficulty: 'UWorld Challenge' })).toEqual(
      expect.arrayContaining(['insufficient_reasoning_depth', 'hard_explanation_too_short', 'missing_uworld_option_explanations']),
    )
  })

  it('every ENRICHED_ID question passes coach mode validation', () => {
    const config = { mode: 'coach', questionCount: 1 }
    const failures = []
    for (const q of QUESTION_BANK.filter(q => ENRICHED_IDS.has(q.id))) {
      const reasons = validateBankQuestion(q, config)
      if (reasons.length) failures.push(`${q.id}: ${reasons.join(', ')}`)
    }
    expect(failures, failures.join('\n')).toHaveLength(0)
  })

  it('every question has a supported Step-style option set labeled sequentially', () => {
    for (const q of QUESTION_BANK) {
      expect(q.options.length, `${q.id} bad option count`).toBeGreaterThanOrEqual(4)
      expect(q.options.length, `${q.id} bad option count`).toBeLessThanOrEqual(ANSWER_LETTERS.length)
      q.options.forEach((o, i) => {
        expect(o.letter, `${q.id} opt ${i} letter`).toBe(ANSWER_LETTERS[i])
        expect(String(o.text || '').trim(), `${q.id} opt ${i} empty text`).not.toBe('')
      })
    }
  })

  it('every question has a valid correct answer matching one rendered option', () => {
    const VALID = new Set(ANSWER_LETTERS)
    for (const q of QUESTION_BANK) {
      expect(VALID.has(q.correct), `${q.id} invalid correct: ${q.correct}`).toBe(true)
      expect(q.options.some(option => option.letter === q.correct), `${q.id} correct option missing: ${q.correct}`).toBe(true)
    }
  })

  it('keeps longer option sets rare in the authored bank', () => {
    const extended = QUESTION_BANK.filter(q => q.options.length > 4)
    expect(extended.length / QUESTION_BANK.length).toBeLessThanOrEqual(0.05)
  })

  it('normalizes rare longer option sets without truncating a correct E option', () => {
    const question = normalizeQuestion({
      id: 'rare-five-option-import',
      stem: 'A patient stem with enough clinical context for a rare longer answer set?',
      subject: 'Pathology',
      system: 'Cardiovascular',
      options: [
        'A. Alpha distractor',
        'B. Beta distractor',
        'C. Gamma distractor',
        'D. Delta distractor',
        'E. Correct fifth answer',
      ],
      correct: 'E',
      explanation: 'Correct fifth answer is the best answer because it matches the key clinical finding.',
    })

    expect(question.options).toHaveLength(5)
    expect(question.options.map(option => option.letter)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(question.correct).toBe('E')
    expect(question.optionExplanations.E).toContain('Correct fifth answer')
  })

  it('safely excludes an option lettered M or beyond instead of mislabeling the rest', () => {
    const question = normalizeQuestion({
      id: 'rare-import-with-invalid-m-option',
      stem: 'A patient stem with a malformed thirteenth option beyond the supported ceiling?',
      subject: 'Pathology',
      system: 'Cardiovascular',
      options: [
        'A. Alpha distractor',
        'B. Beta distractor',
        'C. Gamma distractor',
        'D. Delta distractor',
        'M. Unsupported thirteenth-style option',
      ],
      correct: 'A',
      explanation: 'Alpha distractor is the best answer because it matches the key clinical finding.',
    })

    expect(question.options).toHaveLength(4)
    expect(question.options.map(option => option.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(question.options.some(option => option.text.includes('Unsupported thirteenth'))).toBe(false)
  })

  it('keeps the correct answer pointed at the right text when a malformed middle option shifts positions', () => {
    const question = normalizeQuestion({
      id: 'shifted-correct-answer-guard',
      stem: 'A patient stem with a malformed middle option that must not misalign the correct answer?',
      subject: 'Pathology',
      system: 'Cardiovascular',
      options: [
        { letter: 'A', text: 'Alpha distractor' },
        { letter: 'B', text: 'Beta distractor' },
        { text: 'Malformed entry with no letter or id - must be dropped' },
        { letter: 'D', text: 'Delta distractor (originally D)' },
        { letter: 'E', text: 'Correct fifth answer (originally E)' },
      ],
      correct: 'E',
      optionExplanations: {
        A: 'Alpha is wrong.',
        B: 'Beta is wrong.',
        D: 'Delta is wrong.',
        E: 'Correct fifth answer is correct.',
      },
      explanation: 'Correct fifth answer is the best answer.',
    })

    // The malformed entry is dropped, shifting D and E down by one position and
    // relabeling them C and D - the correct answer must follow the shift, not
    // stay pinned to the stale original letter 'E'.
    expect(question.options).toHaveLength(4)
    expect(question.options.map(option => option.letter)).toEqual(['A', 'B', 'C', 'D'])
    expect(question.correct).toBe('D')
    const correctOption = question.options.find(option => option.letter === question.correct)
    expect(correctOption.text).toBe('Correct fifth answer (originally E)')
    expect(question.optionExplanations.D).toContain('Correct fifth answer is correct')
    expect(question.optionExplanations.C).toContain('Delta is wrong')
  })

  it('no duplicate question IDs', () => {
    const ids = QUESTION_BANK.map(q => q.id)
    const unique = new Set(ids)
    expect(unique.size, 'duplicate ids found').toBe(ids.length)
  })

  it('no duplicate stems (by normalized content)', () => {
    const result = validateUniqueQuestions(QUESTION_BANK)
    const stemDupes = result.duplicates.filter(d => d.reason === 'duplicate_stem')
    expect(stemDupes, stemDupes.map(d => d.id).join(', ')).toHaveLength(0)
  })

  it('every ENRICHED_ID has non-empty option explanations for every rendered option', () => {
    const failures = []
    for (const q of QUESTION_BANK) {
      if (!ENRICHED_IDS.has(q.id)) continue
      for (const { letter: l } of q.options) {
        if (!String(q.optionExplanations?.[l] ?? '').trim()) {
          failures.push(`${q.id} missing optionExplanations[${l}]`)
        }
      }
    }
    expect(failures, failures.join('\n')).toHaveLength(0)
  })

  it('every question in ENRICHED_IDS exists in QUESTION_BANK', () => {
    const bankIds = new Set(QUESTION_BANK.map(q => q.id))
    for (const id of ENRICHED_IDS) {
      expect(bankIds.has(id), `ENRICHED_IDS contains ${id} not in QUESTION_BANK`).toBe(true)
    }
  })
})

// ─── Coverage analytics ───────────────────────────────────────────────────────
// Hard gates enforce non-negotiable floors.
// Advisory checks print distribution tables without failing — they guide
// the next content expansion round without blocking CI.

function _counts(questions, key) {
  const map = new Map()
  for (const q of questions) {
    const v = q[key] || '(missing)'
    map.set(v, (map.get(v) ?? 0) + 1)
  }
  return map
}

function _coverageReport() {
  return buildQuestionBankCoverageReport(QUESTION_BANK)
}

function _coachQuestions() {
  return ACTIVE_QUESTION_BANK.filter(q => ENRICHED_IDS.has(q.id))
}

describe('QUESTION_BANK — coverage analytics (hard gates)', () => {
  it('bank has at least 100 questions and can expand beyond the original MVP size', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(100)
  })

  it('ENRICHED_IDS includes the full active bank for Coach-ready reuse', () => {
    expect(ENRICHED_IDS.size).toBe(ACTIVE_QUESTION_BANK.length)
  })

  it('every local-bank question has option explanations for Coach teaching', () => {
    const coachReady = ACTIVE_QUESTION_BANK.filter(q =>
      q.options.every(option => String(q.optionExplanations?.[option.letter] ?? '').trim()),
    )

    expect(coachReady.length).toBe(ACTIVE_QUESTION_BANK.length)
  })

  it('wrong-answer explanations include contrastive teaching language', () => {
    const failures = []

    for (const q of QUESTION_BANK) {
      for (const { letter } of q.options) {
        if (letter === q.correct) continue
        const explanation = String(q.optionExplanations?.[letter] ?? '')
        if (!/\b(not|does not|do not|instead|whereas|however|although|unlike|lacks?|incorrect|wrong|would|rather|contrast|describes?|causes?|associated with|best answer|less likely|rules out|incompatible|not the|fails to|neither|feature of|opposite of|impossible|excludes?|inferior)\b/i.test(explanation) || explanation.length < 70) {
          failures.push(`${q.id}.${letter}`)
        }
      }
    }

    expect(failures, failures.join(', ')).toHaveLength(0)
  })

  it('generated option explanations use canonical taxonomy labels', () => {
    const dermatologyQuestion = QUESTION_BANK.find(q => q.id === 'qB067')

    expect(dermatologyQuestion?.system).toBe('Dermatology')
    expect(dermatologyQuestion?.optionExplanations?.B).toContain('Dermatology')
    expect(dermatologyQuestion?.optionExplanations?.B).not.toContain('Skin')
  })

  it('Balanced bank has at least 100 questions', () => {
    const difficultyCounts = _counts(QUESTION_BANK, 'difficulty')
    expect(difficultyCounts.get('Balanced')).toBeGreaterThanOrEqual(100)
  })

  it('Phase 1 coverage fills Genetics, Behavioral Science, Dermatology, and Oncology to 10+', () => {
    const subjectCounts = _counts(QUESTION_BANK, 'subject')
    const systemCounts = _counts(QUESTION_BANK, 'system')

    expect(subjectCounts.get('Genetics')).toBeGreaterThanOrEqual(10)
    expect(subjectCounts.get('Behavioral Science')).toBeGreaterThanOrEqual(10)
    expect(systemCounts.get('Dermatology')).toBeGreaterThanOrEqual(10)
    expect(systemCounts.get('Oncology')).toBeGreaterThanOrEqual(10)
  })

  it('Phase 2 coverage keeps high-yield subject-system pairs at 8+ questions', () => {
    const pairs = [
      ['Pharmacology', 'Cardiovascular'],
      ['Pathology', 'Cardiovascular'],
      ['Physiology', 'Renal / Urinary'],
      ['Pharmacology', 'Renal / Urinary'],
      ['Pathology', 'Oncology'],
    ]

    const failures = pairs
      .map(([subject, system]) => ({
        subject,
        system,
        count: QUESTION_BANK.filter(q => q.subject === subject && q.system === system).length,
      }))
      .filter(pair => pair.count < 8)

    expect(
      failures,
      `High-yield pairs below 8Q: ${failures.map(p => `${p.subject}+${p.system}(${p.count})`).join(', ')}`,
    ).toHaveLength(0)
  })

  it('high-yield depth batches keep the three former gap pairs at 10+ active questions', () => {
    const pairs = [
      ['Microbiology', 'Infectious Disease'],
      ['Physiology', 'Respiratory'],
      ['Pathology', 'Neurology'],
    ]
    const failures = pairs
      .map(([subject, system]) => ({
        subject,
        system,
        count: ACTIVE_QUESTION_BANK.filter(
          question => question.subject === subject && question.system === system,
        ).length,
      }))
      .filter(pair => pair.count < 10)

    expect(
      failures,
      `Improved high-yield pairs below 10Q: ${failures.map(pair => `${pair.subject}+${pair.system}(${pair.count})`).join(', ')}`,
    ).toHaveLength(0)
  })

  it('coverage batches protect Human Development, male reproductive, prevention, and prognosis floors', () => {
    const floors = [
      ['Pregnancy content', 10, question => question.usmleContentArea === 'Pregnancy, Childbirth, & the Puerperium'],
      ['Human Development content', 6, question => question.usmleContentArea === 'Human Development'],
      ['Male reproductive content', 5, question => question.usmleContentArea === 'Male and Transgender Reproductive System'],
      ['Prevention task', 5, question => question.physicianTask === 'Patient Care: Health Maintenance and Disease Prevention'],
      ['Prognosis task', 6, question => question.physicianTask === 'Patient Care: Prognosis and Outcome'],
    ]
    const failures = floors
      .map(([label, minimum, matches]) => ({
        label,
        minimum,
        count: ACTIVE_QUESTION_BANK.filter(matches).length,
      }))
      .filter(row => row.count < row.minimum)

    expect(
      failures,
      `Coverage floors missed: ${failures.map(row => `${row.label}(${row.count}/${row.minimum})`).join(', ')}`,
    ).toHaveLength(0)
  })

  it('every subject has at least 10 questions', () => {
    const underfilled = _coverageReport().subjects.filter(row => row.count < 10)

    expect(
      underfilled,
      `Subjects below 10Q: ${underfilled.map(row => `${row.subject}(${row.count})`).join(', ')}`,
    ).toHaveLength(0)
  })

  it('every system has at least 10 questions and no legacy system labels remain', () => {
    const systemCounts = _counts(QUESTION_BANK, 'system')
    const underfilled = _coverageReport().systems.filter(row => row.count < 10)

    expect(systemCounts.has('Loop Diuretics')).toBe(false)
    expect(systemCounts.has('Nervous System')).toBe(false)
    expect(
      underfilled,
      `Systems below 10Q: ${underfilled.map(row => `${row.system}(${row.count})`).join(', ')}`,
    ).toHaveLength(0)
  })

  it('at least 8 distinct usmleContentArea values are represented', () => {
    const areas = new Set(QUESTION_BANK.map(q => q.usmleContentArea).filter(Boolean))
    expect(areas.size).toBeGreaterThanOrEqual(8)
  })

  it('at least 5 distinct physicianTask values are represented', () => {
    const tasks = new Set(QUESTION_BANK.map(q => q.physicianTask).filter(Boolean))
    expect(tasks.size).toBeGreaterThanOrEqual(5)
  })

  it('every content area in the bank has at least 1 question (no orphan area label)', () => {
    const areaCounts = _counts(QUESTION_BANK, 'usmleContentArea')
    for (const [area, count] of areaCounts) {
      expect(count, `Content area "${area}" shows 0`).toBeGreaterThan(0)
    }
  })

  it('40-question exam draws from a pool of at least 80 unseen questions', () => {
    // Bank has 100 questions; marking 20 seen still leaves 80 — well above 40.
    const allIds = QUESTION_BANK.slice(0, 20).map(q => q.id)
    vi.mocked(getSessionHistory).mockReturnValueOnce([{ questionIds: allIds, missedQuestions: [] }])
    const session = createQuizSession({ ...baseConfig, mode: 'exam', questionCount: 40 })
    expect(session.questions).toHaveLength(40)
    expect(validateUniqueQuestions(session.questions).valid).toBe(true)
  })

  it('every system in the bank can serve at least a 1-question session', () => {
    // Hard gate: no system in the bank is so broken that even a 1Q session fails.
    // Depth per system (5Q, 10Q) is reported in the advisory section below.
    const systems = [...new Set(QUESTION_BANK.map(q => q.system).filter(Boolean))]
    for (const sys of systems) {
      expect(
        () => createQuizSession({ ...baseConfig, system: sys, questionCount: 1 }),
        `System "${sys}" cannot serve even 1 question`,
      ).not.toThrow()
    }
  })

  it('no topic+questionAngle combination appears on more than 3 questions', () => {
    const combos = new Map()
    for (const q of QUESTION_BANK) {
      const key = `${q.topic}||${q.questionAngle}`
      combos.set(key, (combos.get(key) ?? 0) + 1)
    }
    const overloaded = [...combos.entries()].filter(([, c]) => c > 3)
    expect(
      overloaded.map(([k]) => k),
      `Over-represented topic+angle combos: ${overloaded.map(([k, c]) => `${k} (${c}x)`).join(', ')}`,
    ).toHaveLength(0)
  })

  it('every ENRICHED_ID question has a non-empty usmleContentArea and physicianTask', () => {
    for (const q of _coachQuestions()) {
      expect(String(q.usmleContentArea ?? '').trim(), `${q.id} missing usmleContentArea`).not.toBe('')
      expect(String(q.physicianTask ?? '').trim(), `${q.id} missing physicianTask`).not.toBe('')
    }
  })

  it('contains no placeholder question-angle metadata after normalization', () => {
    const placeholders = QUESTION_BANK.filter(question =>
      /^(coverage-qb|nbme-text-only-qnb)\d+$/i.test(String(question.questionAngle || '')),
    )

    expect(placeholders.map(question => question.id)).toHaveLength(0)
  })

  it('reports commercial depth against explicit 1,500-question targets', () => {
    const readiness = buildCommercialQuestionBankReadiness(ACTIVE_QUESTION_BANK)

    expect(readiness.current).toBe(ACTIVE_QUESTION_BANK.length)
    expect(readiness.target.totalQuestions).toBe(1500)
    expect(readiness.totalDeficit).toBe(1500 - ACTIVE_QUESTION_BANK.length)
    expect(readiness.difficulty.find(row => row.name === 'UWorld Challenge')?.target).toBe(400)
    expect(readiness.met).toBe(false)
  })
})

describe('QUESTION_BANK — coverage analytics (advisory report)', () => {
  // These tests always pass. They print advisory tables to stdout so the
  // developer can see distribution at a glance when running tests locally.
  // CI does not fail on them — they are structural reporters, not blockers.

  it('prints content area distribution (advisory)', () => {
    const total   = _counts(QUESTION_BANK, 'usmleContentArea')
    const coach   = _counts(_coachQuestions(), 'usmleContentArea')
    const rows = [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([area, n]) => ({
        area,
        total: n,
        coach: coach.get(area) ?? 0,
        status: n < 3 ? 'THIN' : 'ok',
      }))

    console.log('\n=== Content Area Coverage ===')
    console.log('total | coach | status | area')
    for (const r of rows) {
      console.log(`  ${String(r.total).padStart(2)} |   ${String(r.coach).padStart(2)} | ${r.status.padEnd(4)}   | ${r.area}`)
    }
    const thin = rows.filter(r => r.total < 3)
    if (thin.length) {
      console.log(`\nThin areas (<3 questions): ${thin.map(r => r.area).join(', ')}`)
    }
    expect(true).toBe(true) // advisory only
  })

  it('prints physician task distribution (advisory)', () => {
    const total = _counts(QUESTION_BANK, 'physicianTask')
    const coach = _counts(_coachQuestions(), 'physicianTask')
    const rows = [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([task, n]) => ({
        task,
        total: n,
        coach: coach.get(task) ?? 0,
        status: n < 3 ? 'THIN' : 'ok',
      }))

    console.log('\n=== Physician Task Coverage ===')
    console.log('total | coach | status | task')
    for (const r of rows) {
      console.log(`  ${String(r.total).padStart(2)} |   ${String(r.coach).padStart(2)} | ${r.status.padEnd(4)}   | ${r.task}`)
    }
    const thin = rows.filter(r => r.total < 3)
    if (thin.length) {
      console.log(`\nThin tasks (<3 questions): ${thin.map(r => r.task).join(', ')}`)
    }
    expect(true).toBe(true)
  })

  it('prints question angle distribution (advisory)', () => {
    const total = _counts(QUESTION_BANK, 'questionAngle')
    const coach = _counts(_coachQuestions(), 'questionAngle')
    const rows = [...total.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([angle, n]) => ({
        angle,
        total: n,
        coach: coach.get(angle) ?? 0,
      }))

    console.log('\n=== Question Angle Distribution ===')
    console.log('total | coach | angle')
    for (const r of rows) {
      console.log(`  ${String(r.total).padStart(2)} |   ${String(r.coach).padStart(2)} | ${r.angle}`)
    }
    expect(true).toBe(true)
  })

  it('prints coach-coverage gaps by content area (advisory)', () => {
    const total = _counts(QUESTION_BANK, 'usmleContentArea')
    const coach = _counts(_coachQuestions(), 'usmleContentArea')
    const gaps = [...total.entries()]
      .filter(([area]) => (coach.get(area) ?? 0) < 2)
      .sort((a, b) => a[1] - b[1])

    console.log('\n=== Coach-Coverage Gaps (<2 coach-ready per area) ===')
    if (gaps.length === 0) {
      console.log('  None — all content areas have ≥2 Coach-ready questions.')
    } else {
      for (const [area, total_n] of gaps) {
        console.log(`  ${coach.get(area) ?? 0} coach / ${total_n} total | ${area}`)
      }
    }
    expect(true).toBe(true)
  })

  it('prints 10-question readiness by system (advisory)', () => {
    const rows = _coverageReport().systems
      .sort((a, b) => b.count - a.count)
      .map(row => ({
        system: row.system,
        total: row.count,
        can10Q: row.count >= 10 ? 'yes' : 'NO',
        can5Q: row.count >= 5 ? 'yes' : 'NO',
      }))

    console.log('\n=== 10Q Readiness by System (direct scope, no fallback) ===')
    console.log('total | 5Q | 10Q | system')
    for (const r of rows) {
      console.log(`  ${String(r.total).padStart(2)} | ${r.can5Q.padEnd(3)} | ${r.can10Q.padEnd(3)} | ${r.system}`)
    }
    const under10 = rows.filter(r => r.total < 10)
    if (under10.length) {
      console.log(`\nSystems below 10Q: ${under10.map(r => `${r.system}(${r.total})`).join(', ')}`)
    }
    expect(true).toBe(true)
  })

  it('prints high-yield subject-system pair coverage (advisory)', () => {
    const report = _coverageReport()

    console.log('\n=== High-Yield Subject-System Pair Coverage ===')
    console.log('cnt | status | subject + system')
    for (const row of formatCoverageRows(report.highYieldPairs, ['subject', 'system'])) {
      console.log(row)
    }
    expect(true).toBe(true)
  })

  it('prints next candidate gaps for Phase 3 (advisory)', () => {
    const report = _coverageReport()

    console.log('\n=== Phase 3 Candidate Gaps ===')
    console.log('cnt | status | subject + system')
    for (const row of formatCoverageRows(report.nextTargets.slice(0, 20), ['subject', 'system'])) {
      console.log(row)
    }
    console.log(`\nPair summary: Good=${report.summary.pairGood}, Watch=${report.summary.pairWatch}, Gap=${report.summary.pairGap}, Zero=${report.summary.pairZero}`)
    expect(true).toBe(true)
  })

  it('prints duplicate topic+questionAngle combos (advisory)', () => {
    const combos = new Map()
    for (const q of QUESTION_BANK) {
      const key = `${q.topic}||${q.questionAngle}`
      if (!combos.has(key)) combos.set(key, [])
      combos.get(key).push(q.id)
    }
    const dupes = [...combos.entries()].filter(([, ids]) => ids.length > 1)

    console.log('\n=== Duplicate topic+questionAngle Combos ===')
    if (dupes.length === 0) {
      console.log('  None.')
    } else {
      for (const [combo, ids] of dupes.sort((a, b) => b[1].length - a[1].length)) {
        const [topic, angle] = combo.split('||')
        console.log(`  ${ids.length}x | ${topic} | ${angle} → [${ids.join(', ')}]`)
      }
    }
    expect(true).toBe(true)
  })
})

// ─── Quality Governance Sprint tests ─────────────────────────────────────────

describe('ACTIVE_QUESTION_BANK — quarantine exclusion', () => {
  it('active bank is smaller than QUESTION_BANK by exactly the quarantine count', () => {
    expect(ACTIVE_QUESTION_BANK.length).toBe(QUESTION_BANK.length - QUARANTINED_IDS.size)
  })

  it('no quarantined ID appears in ACTIVE_QUESTION_BANK', () => {
    const leaked = ACTIVE_QUESTION_BANK.filter(q => isQuarantined(q.id))
    expect(leaked.map(q => q.id)).toHaveLength(0)
  })

  it('quarantined questions never appear in generated sessions', () => {
    const modes = ['practice', 'coach', 'exam']
    for (const mode of modes) {
      const session = createQuizSession({ ...baseConfig, mode, questionCount: 5 })
      const leaked = session.questions.filter(q => isQuarantined(q.id))
      expect(leaked.map(q => q.id), `mode=${mode} leaked quarantined IDs`).toHaveLength(0)
    }
  })

  it('standardized Step 1 block never contains quarantined questions', () => {
    const session = createQuizSession(standardizedStep1Config)
    const leaked = session.questions.filter(q => isQuarantined(q.id))
    expect(leaked.map(q => q.id)).toHaveLength(0)
  })

  it('active bank still serves ≥40 questions for each NBME and UWorld difficulty', () => {
    const nbmeActive = ACTIVE_QUESTION_BANK.filter(q => q.difficulty === 'NBME Difficult')
    const uwActive = ACTIVE_QUESTION_BANK.filter(q => q.difficulty === 'UWorld Challenge')
    expect(nbmeActive.length).toBeGreaterThanOrEqual(40)
    expect(uwActive.length).toBeGreaterThanOrEqual(40)
  })
})

describe('QBank safe inventory and direct sessions', () => {
  it('exposes only active, report-filtered questions for browsing', () => {
    const blockedId = ACTIVE_QUESTION_BANK[0].id
    vi.mocked(filterReportedQuestions).mockImplementation(questions => questions.filter(question => question.id !== blockedId))

    const inventory = getBrowsableQuestionBank()

    expect(inventory.some(question => question.id === blockedId)).toBe(false)
    expect(inventory.some(question => isQuarantined(question.id))).toBe(false)
    expect(validateUniqueQuestions(inventory).valid).toBe(true)
  })

  it('creates a direct session containing exactly the selected safe questions', () => {
    const selected = ACTIVE_QUESTION_BANK.slice(0, 3)
    const session = createSelectedQuestionSession(
      { ...baseConfig, mode: 'coach', questionCount: selected.length },
      selected,
    )

    expect(session.questions.map(question => question.id)).toEqual(selected.map(question => question.id))
    expect(session.mode).toBe('coach')
    expect(session.source).toBe('validated-qbank')
    expect(session.questionSource).toBe('validated-qbank')
    expect(session.generationTelemetry).toBeUndefined()
  })

  it('fails closed when a selected question becomes reported before launch', () => {
    const selected = ACTIVE_QUESTION_BANK.slice(0, 2)
    vi.mocked(filterReportedQuestions).mockImplementation(questions => questions.filter(question => question.id !== selected[0].id))

    expect(() => createSelectedQuestionSession(baseConfig, selected)).toThrow('no longer available')
  })

  it('rejects selections above the 40-question cap', () => {
    expect(() => createSelectedQuestionSession(baseConfig, ACTIVE_QUESTION_BANK.slice(0, 41))).toThrow('limited to 40')
  })
})

describe('QUESTION_BANK — q012 regression (Millard-Gubler)', () => {
  it('q012 stem describes left facial droop consistent with left pontine lesion', () => {
    const q012 = QUESTION_BANK.find(q => q.id === 'q012')
    expect(q012, 'q012 must exist in QUESTION_BANK').toBeTruthy()
    expect(q012.stem).toMatch(/left facial (droop|weakness)/i)
    expect(q012.stem).not.toMatch(/right facial droop/i)
  })

  it('q012 option A explanation attributes left facial droop to ipsilateral CN VII (not corticobulbar)', () => {
    const q012 = QUESTION_BANK.find(q => q.id === 'q012')
    const explA = q012?.optionExplanations?.A || ''
    // Left pons → left CN VII → left (ipsilateral) facial droop
    expect(explA).toMatch(/left.*facial droop|ipsilateral.*facial|CN VII.*ipsilateral/i)
    // Must not incorrectly say right facial droop comes from the corticobulbar tract
    expect(explA).not.toMatch(/right facial droop result from corticospinal and corticobulbar/i)
  })

  it('localizes isolated abduction weakness to the abducens fascicle, not the nucleus', () => {
    const q012 = QUESTION_BANK.find(q => q.id === 'q012')
    const correctOption = q012?.options?.find(option => option.letter === q012.correct)
    expect(correctOption?.text).toMatch(/abducens.*fascicle/i)
    expect(correctOption?.text).not.toMatch(/nucleus/i)
    expect(q012?.explanation).toMatch(/conjugate gaze/i)
  })
})

describe('QUESTION_BANK — medical accuracy regressions', () => {
  function question(id) {
    const found = QUESTION_BANK.find(item => item.id === id)
    expect(found, `${id} must exist in QUESTION_BANK`).toBeTruthy()
    return found
  }

  it('q023 describes a motor-only posterior interosseous neuropathy', () => {
    const q = question('q023')
    const correctOption = q.options.find(option => option.letter === q.correct)
    expect(correctOption?.text).toMatch(/posterior interosseous/i)
    expect(q.stem).toMatch(/wrist extension is preserved but deviates radially/i)
    expect(q.stem).toMatch(/sensation.*normal/i)
    expect(q.explanation).not.toMatch(/superficial radial nerve.*branches proximal to the radial groove/i)
  })

  it('q021 uses creatinine clearance without falsely contraindicating dabigatran at 32 mL/min', () => {
    const q = question('q021')
    expect(q.stem).toMatch(/creatinine clearance of 32 mL\/min/i)
    expect(q.stem).not.toMatch(/eGFR/i)
    expect(q.explanation).toMatch(/not itself a contraindication/i)
    expect(q.explanation).toMatch(/75 mg twice daily when CrCl is 15–30/i)
  })

  it('q086 identifies exogenous Cushing syndrome without an inappropriate dexamethasone test', () => {
    const q = question('q086')
    expect(q.stem).not.toMatch(/dexamethasone suppression/i)
    expect(q.stem).toMatch(/cortisol and ACTH are both low/i)
    expect(q.explanation).toMatch(/before biochemical testing for endogenous Cushing syndrome/i)
  })

  it('q090 uses current susceptibility-aware H. pylori teaching', () => {
    const q = question('q090')
    expect(q.stem).toMatch(/bismuth quadruple therapy/i)
    expect(q.stem).not.toMatch(/standard triple therapy/i)
    expect(q.explanation).toMatch(/clarithromycin-containing therapy should be avoided unless susceptibility is documented/i)
  })

  it('q001 explicitly demonstrates left subclavian branch-vessel involvement', () => {
    const q = question('q001')
    expect(q.stem).toMatch(/narrowing the origin of the left subclavian artery/i)
    expect(q.stem).not.toMatch(/starting just distal to the left subclavian artery/i)
  })

  it('q080 distinguishes childhood cancer incidence from mortality', () => {
    const q = question('q080')
    expect(q.explanation).toMatch(/most common cancer diagnosed in children/i)
    expect(q.explanation).not.toMatch(/most common cause of cancer death in children/i)
  })

  it('q027 metadata no longer collides with the PKU question during deduplication', () => {
    const q = question('q027')
    expect(q.topic).toBe('Pericardial Disease')
    const nbmePool = getBankQuestionsForConfig({
      ...baseConfig,
      mode: 'exam',
      questionCount: 40,
      difficulty: 'NBME Difficult',
    })
    expect(nbmePool).toHaveLength(40)
    expect(nbmePool.some(item => item.id === 'q046')).toBe(true)
  })

  it('q014 asks specifically about bloodstream immune evasion rather than two bacterial virulence factors', () => {
    const q = question('q014')
    expect(q.stem).toMatch(/resisting opsonization and phagocytic clearance/i)
    expect(q.stem).toMatch(/survival in the bloodstream/i)
  })

  it('q032 uses current low-dose ICS-formoterol maintenance-and-reliever therapy', () => {
    const q = question('q032')
    const correctOption = q.options.find(option => option.letter === q.correct)
    expect(correctOption?.text).toMatch(/ICS-formoterol.*maintenance and reliever/i)
    expect(q.explanation).toMatch(/preferred Step 3/i)
  })

  it('q073 tests appreciation and reasoning as elements of decision-making capacity', () => {
    const q = question('q073')
    expect(q.stem).toMatch(/appreciate the consequences and reason about the decision/i)
    expect(q.explanation).toMatch(/appreciation or reasoning/i)
    expect(q.explanation).toMatch(/demonstrates both/i)
  })

  it('q075 does not teach LH-to-FSH ratio as a PCOS diagnostic requirement', () => {
    const q = question('q075')
    expect(q.stem).not.toMatch(/LH.*FSH ratio/i)
    expect(q.explanation).toMatch(/LH-to-FSH ratio is not required/i)
    expect(q.pearl).toMatch(/letrozole/i)
  })

  it('q096 distinguishes chronic beta-blocker continuation from initiation during decompensation', () => {
    const q = question('q096')
    expect(q.explanation).toMatch(/should not be newly initiated or up-titrated/i)
    expect(q.explanation).toMatch(/chronic beta-blocker.*continued/i)
  })

  it.each([
    ['q043', /spiral arteries/i],
    ['qUW001', /Creatinine is 4\.2 mg\/dL/i],
    ['qUW028', /arterial inflow but no venous flow/i],
    ['qUW032', /absolute neutrophil count is 420\/uL/i],
  ])('%s retains its UWorld reasoning discriminator', (id, discriminator) => {
    expect(question(id).stem).toMatch(discriminator)
  })
})

describe('Clone detection — template family guard', () => {
  it('active bank has fewer than 10% template clones (hard gate)', () => {
    const { totalClones } = detectTemplateClonesInBank(ACTIVE_QUESTION_BANK)
    const cloneShare = totalClones / ACTIVE_QUESTION_BANK.length
    expect(cloneShare, `Active bank clone share ${(cloneShare * 100).toFixed(1)}% exceeds 10% gate`).toBeLessThan(0.10)
  })

  it('QUESTION_BANK contains exactly 107 template clones (regression guard)', () => {
    const { totalClones } = detectTemplateClonesInBank(QUESTION_BANK)
    expect(totalClones).toBe(107)
  })

  it('no generic distractor family appears in more than 5 active questions', () => {
    const GENERIC_SIGNALS = [
      'nonspecific stress response',
      'USMLE-style teaching session',
    ]
    for (const signal of GENERIC_SIGNALS) {
      const matches = ACTIVE_QUESTION_BANK.filter(q => {
        const optTexts = (q.options || []).map(o => o.text || '').join(' ')
        return optTexts.includes(signal) || (q.stem || '').includes(signal)
      })
      expect(
        matches.map(q => q.id),
        `Generic signal "${signal}" found in ${matches.length} active questions (max 5)`,
      ).toHaveLength(0)
    }
  })
})

describe('Active pool — answer distribution (advisory)', () => {
  it('raw correct-answer distribution in active bank is not dominated by a single letter (advisory)', () => {
    const counts = { A: 0, B: 0, C: 0, D: 0 }
    for (const q of ACTIVE_QUESTION_BANK) {
      const letter = q.correct
      if (letter in counts) counts[letter]++
    }
    const total = ACTIVE_QUESTION_BANK.length
    const pct = Object.fromEntries(Object.entries(counts).map(([l, c]) => [l, (c / total * 100).toFixed(1)]))
    console.log('\n=== Active Bank Raw Answer Distribution ===')
    console.log(`A: ${counts.A} (${pct.A}%)  B: ${counts.B} (${pct.B}%)  C: ${counts.C} (${pct.C}%)  D: ${counts.D} (${pct.D}%)`)
    console.log('Note: raw distribution is pre-shuffle; shuffleQuestionOptions randomizes at session time.')
    // Advisory only — raw-A authoring convention is known; this test does not hard-fail.
    expect(true).toBe(true)
  })
})
