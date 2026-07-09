import { CANONICAL_SUBJECTS, CANONICAL_SYSTEMS } from './usmleTaxonomy.js'

/**
 * @typedef {'exam'|'practice'|'coach'} QuizMode
 *
 * @typedef {Object} QuizConfig
 * @property {QuizMode} mode
 * @property {string} subject
 * @property {string} system
 * @property {string} topic
 * @property {3|5|10|20|40} questionCount
 * @property {string} difficulty
 * @property {string} clinicalFocus
 * @property {string} createdAt
 *
 * @typedef {'A'|'B'|'C'|'D'|'E'|'F'|'G'|'H'|'I'|'J'|'K'|'L'} OptionLetter
 *
 * @typedef {Object} QuizOption
 * @property {OptionLetter} letter
 * @property {string} text
 *
 * @typedef {Object} QuizQuestion
 * @property {string} id
 * @property {string} subject
 * @property {string} system
 * @property {string} difficulty
 * @property {string} stem
 * @property {QuizOption[]} options - 4 options by default; trusted/imported USMLE-style items may have 5-12 (A-L)
 * @property {OptionLetter} correct
 * @property {string} explanation
 * @property {string} pearl
 * @property {string} [usmleContentArea]
 * @property {string} [usmleSubdomain]
 * @property {string} [physicianTask]
 * @property {string} [questionAngle]
 *
 * @typedef {Object} QuizSession
 * @property {string} id
 * @property {QuizMode} mode
 * @property {QuizConfig} config
 * @property {QuizQuestion[]} questions
 * @property {Record<string, OptionLetter>} answers
 * @property {number} currentIndex
 * @property {string} startedAt
 */

export const SUBJECTS = [
  'All Subjects',
  ...CANONICAL_SUBJECTS,
]

export const SYSTEMS = [
  'All Systems',
  ...CANONICAL_SYSTEMS.filter(system => system !== 'Multisystem'),
]

export const SYSTEM_LABELS = {
  'All Systems': 'All Systems',
  Multisystem: 'Integrated / Cross-system',
}

export function getSystemLabel(system) {
  return SYSTEM_LABELS[system] || system
}

export const DIFFICULTIES = [
  { id: 'Balanced',         desc: 'Mixed standard Step 1 difficulty.' },
  { id: 'More Easy',        desc: 'Foundation-focused questions.' },
  { id: 'More Hard',        desc: 'More reasoning-heavy questions.' },
  { id: 'NBME Difficult',   desc: 'Board-style challenging vignettes.' },
  { id: 'UWorld Challenge', desc: 'Dense reasoning with difficult distractors.' },
]

export const PUBLIC_DIFFICULTIES = [
  {
    id: 'Foundation',
    label: 'Foundation',
    desc: 'Easier questions that build the core concept before heavy traps.',
  },
  {
    id: 'Balanced',
    label: 'Balanced',
    desc: 'Standard Step 1 practice for daily blocks.',
  },
  {
    id: 'Challenge',
    label: 'Challenge',
    desc: 'Harder board-level reasoning. Exam mode stays concise; Practice and Coach add deeper teaching.',
  },
]

export function getPublicDifficultyId(difficulty) {
  if (difficulty === 'More Easy') return 'Foundation'
  if (difficulty === 'More Hard' || difficulty === 'NBME Difficult' || difficulty === 'UWorld Challenge') return 'Challenge'
  return 'Balanced'
}

export function getDifficultyDisplayLabel(difficulty) {
  return getPublicDifficultyId(difficulty)
}

export function resolveDifficultyForMode(publicDifficulty, mode = 'exam') {
  if (publicDifficulty === 'Foundation') return 'More Easy'
  if (publicDifficulty === 'Challenge') return mode === 'exam' ? 'NBME Difficult' : 'UWorld Challenge'
  return 'Balanced'
}

export function normalizeDifficultyForMode(difficulty, mode = 'exam') {
  return resolveDifficultyForMode(getPublicDifficultyId(difficulty), mode)
}

export const QUESTION_COUNTS = [3, 5, 10, 20, 40]

export const STANDARDIZED_STEP1_BLOCK = 'standardized-step1-block-2026'
// Retained so saved sessions/configurations from the former 40-question preset
// migrate cleanly to the current USMLE delivery format.
export const STANDARDIZED_40Q_BLOCK = 'standardized-40-question-block'

export function isStandardized40QuestionBlock(config) {
  return [STANDARDIZED_STEP1_BLOCK, STANDARDIZED_40Q_BLOCK].includes(config?.blockType)
}

export function normalizeQuizConfigForGeneration(config) {
  if (!isStandardized40QuestionBlock(config)) return config
  return {
    ...config,
    mode: 'exam',
    questionCount: 20,
    subject: 'All Subjects',
    system: 'All Systems',
    topic: '',
    clinicalFocus: '',
    difficulty: 'Balanced',
    blockType: STANDARDIZED_STEP1_BLOCK,
  }
}

export const MODES = [
  {
    id: 'exam',
    label: 'Exam',
    desc: 'Timed block with answers and explanations held until the end.',
  },
  {
    id: 'practice',
    label: 'Practice',
    desc: 'Question-by-question learning with immediate feedback after each answer.',
  },
  {
    id: 'coach',
    label: 'Coach',
    desc: 'Guided tutor mode with deeper teaching, weak-spot repair, notes, and flashcards.',
  },
]

export const MODE_FEATURES = {
  exam: [
    'Timed block',
    '1 minute / question',
    'No explanations until submit',
    'Mark / skip / review',
  ],
  practice: [
    'No time limit',
    'Immediate feedback',
    'High-yield pearls',
    'End summary',
  ],
  coach: [
    'No time limit',
    'Deep explanation',
    'Weak spot diagnosis',
    'Lecture notes',
    'Reference-style guide',
    'Flashcards',
  ],
}

/** @type {QuizConfig} */
export const DEFAULT_CONFIG = {
  mode: 'exam',
  subject: 'All Subjects',
  system: 'All Systems',
  topic: '',
  questionCount: 10,
  difficulty: 'Balanced',
  clinicalFocus: '',
  blockType: '',
}
