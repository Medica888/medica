import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateUniqueQuestions } from './questionDedup.js'

vi.mock('./storage.js', () => ({
  filterReportedQuestions: vi.fn(questions => questions),
  getSessionHistory: vi.fn(() => []),
  getTrustedGeneratedQuestionsForConfig: vi.fn(() => []),
  appendTrustedGeneratedQuestions: vi.fn(),
}))

vi.mock('./apiClient.js', () => ({
  getAuthToken: vi.fn(() => null),
}))

import { filterReportedQuestions, getSessionHistory } from './storage.js'
import { STANDARDIZED_40Q_BLOCK } from './quizTypes.js'
import {
  createQuizSession,
  ensureQuestionCount,
  getAvailableQuestionCountForConfig,
  getBankQuestionsForConfig,
  QUESTION_BANK,
  ENRICHED_IDS,
  getDifficultyAvailability,
  getQuestionBankDifficultyStats,
  validateHardDifficultyQuestion,
} from './mockQuestions.js'
import { validateBankQuestion } from './ai/generateAIQuestions.js'
import { buildQuestionBankCoverageReport, formatCoverageRows } from './questionBankCoverage.js'

const baseConfig = {
  mode:          'practice',
  subject:       'All Subjects',
  system:        'All Systems',
  topic:         '',
  questionCount: 5,
  difficulty:    'Balanced',
  clinicalFocus: '',
}

const standardized40Config = {
  ...baseConfig,
  mode:          'exam',
  questionCount: 40,
  difficulty:    'standardized',
  blockType:     STANDARDIZED_40Q_BLOCK,
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

// ─── Test 9/10: 40 Question Block ─────────────────────────────────────────────

describe('ensureQuestionCount — test 10: 40Q block rejects insufficient pool', () => {
  it('throws with 40Q message when pool < 40 for exam mode', () => {
    const pool   = Array.from({ length: 20 }, (_, i) => ({ id: `q${i}`, correct: 'A', options: [], stem: `Stem ${i}` }))
    const config = { questionCount: 40, mode: 'exam' }
    expect(() => ensureQuestionCount(pool, config))
      .toThrow('Not enough unique questions available for a standardized 40 Question Block.')
  })
})

describe('createQuizSession — 40Q block behavior', () => {
  it('succeeds when bank has ≥40 unique unseen questions', () => {
    // Bank now has ≥50 questions — 40Q block should work
    const session = createQuizSession(standardized40Config)
    expect(session.questions).toHaveLength(40)
    expect(validateUniqueQuestions(session.questions).valid).toBe(true)
    expect(session.config.blockType).toBe(STANDARDIZED_40Q_BLOCK)
    expect(session.config.difficulty).toBe('Balanced')
  })

  it('does not filter standardized 40Q by fake standardized difficulty', () => {
    expect(getAvailableQuestionCountForConfig(standardized40Config)).toBe(QUESTION_BANK.length)

    const pool = getBankQuestionsForConfig(standardized40Config)

    expect(pool.length).toBeGreaterThanOrEqual(40)
    expect(pool.every(q => q.difficulty !== 'standardized')).toBe(true)
  })

  it('still starts when old seen history leaves fewer than 40 unseen questions', () => {
    // Mark enough questions as seen so <40 remain unseen; standardized blocks
    // may reuse old-session questions while preserving in-block uniqueness.
    const allIds = QUESTION_BANK.slice(0, QUESTION_BANK.length - 39).map(q => q.id)
    vi.mocked(getSessionHistory).mockReturnValueOnce([{ questionIds: allIds, missedQuestions: [] }])
    const session = createQuizSession(standardized40Config)

    expect(session.questions).toHaveLength(40)
    expect(validateUniqueQuestions(session.questions).valid).toBe(true)
  })

  it('still throws when reported questions reduce the standardized pool below 40', () => {
    vi.mocked(filterReportedQuestions).mockImplementation(questions => questions.slice(0, 39))

    expect(() => createQuizSession(standardized40Config)).toThrow('Not enough unique questions')
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
      for (const letter of ['A', 'B', 'C', 'D']) {
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
        expect(['A', 'B', 'C', 'D'].every(l => String(q.optionExplanations?.[l] ?? '').trim())).toBe(true)
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
    expect(stats['NBME Difficult']).toBeGreaterThanOrEqual(80)
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

  it('every question has exactly 4 options labeled A B C D in order', () => {
    const LETTERS = ['A', 'B', 'C', 'D']
    for (const q of QUESTION_BANK) {
      expect(q.options, `${q.id} bad options`).toHaveLength(4)
      q.options.forEach((o, i) => {
        expect(o.letter, `${q.id} opt ${i} letter`).toBe(LETTERS[i])
        expect(String(o.text || '').trim(), `${q.id} opt ${i} empty text`).not.toBe('')
      })
    }
  })

  it('every question has a valid correct answer (A/B/C/D)', () => {
    const VALID = new Set(['A', 'B', 'C', 'D'])
    for (const q of QUESTION_BANK) {
      expect(VALID.has(q.correct), `${q.id} invalid correct: ${q.correct}`).toBe(true)
    }
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

  it('every ENRICHED_ID has non-empty A B C D optionExplanations', () => {
    const failures = []
    for (const q of QUESTION_BANK) {
      if (!ENRICHED_IDS.has(q.id)) continue
      for (const l of ['A', 'B', 'C', 'D']) {
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
  return QUESTION_BANK.filter(q => ENRICHED_IDS.has(q.id))
}

describe('QUESTION_BANK — coverage analytics (hard gates)', () => {
  it('bank has at least 100 questions and can expand beyond the original MVP size', () => {
    expect(QUESTION_BANK.length).toBeGreaterThanOrEqual(100)
  })

  it('ENRICHED_IDS includes the full local bank for Coach-ready reuse', () => {
    expect(ENRICHED_IDS.size).toBe(QUESTION_BANK.length)
  })

  it('every local-bank question has A-D optionExplanations for Coach teaching', () => {
    const coachReady = QUESTION_BANK.filter(q =>
      ['A', 'B', 'C', 'D'].every(letter => String(q.optionExplanations?.[letter] ?? '').trim()),
    )

    expect(coachReady.length).toBe(QUESTION_BANK.length)
  })

  it('wrong-answer explanations include contrastive teaching language', () => {
    const failures = []

    for (const q of QUESTION_BANK) {
      for (const letter of ['A', 'B', 'C', 'D']) {
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
