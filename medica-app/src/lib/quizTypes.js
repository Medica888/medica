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
 * @typedef {'A'|'B'|'C'|'D'} OptionLetter
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
 * @property {[QuizOption, QuizOption, QuizOption, QuizOption]} options
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
  'All Subjects', 'Anatomy', 'Physiology', 'Pathology',
  'Pharmacology', 'Biochemistry', 'Genetics', 'Microbiology',
  'Immunology', 'Behavioral Science', 'Biostatistics', 'Ethics',
]

export const SYSTEMS = [
  'All Systems', 'Cardiovascular', 'Respiratory', 'Renal / Urinary',
  'Gastrointestinal', 'Endocrine', 'Reproductive', 'Neurology',
  'Psychiatry', 'Musculoskeletal', 'Dermatology', 'Hematology',
  'Oncology', 'Immunology', 'Infectious Disease', 'Multisystem',
]

export const SYSTEM_LABELS = {
  'All Systems': 'Mixed / All Systems',
  Multisystem: 'General Principles / Multisystem',
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

export const QUESTION_COUNTS = [3, 5, 10, 20, 40]

export const STANDARDIZED_40Q_BLOCK = 'standardized-40-question-block'

export function isStandardized40QuestionBlock(config) {
  return config?.blockType === STANDARDIZED_40Q_BLOCK
}

export function normalizeQuizConfigForGeneration(config) {
  if (!isStandardized40QuestionBlock(config)) return config
  return {
    ...config,
    difficulty: 'Balanced',
  }
}

export const MODES = [
  {
    id: 'exam',
    label: 'Exam',
    desc: 'Timed test block. No explanations until submission.',
  },
  {
    id: 'practice',
    label: 'Practice',
    desc: 'No time limit. Immediate simple explanations.',
  },
  {
    id: 'coach',
    label: 'Coach',
    desc: 'No time limit. Deep teaching, weak spot repair, notes, references, and flashcards.',
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
    'Immediate simple feedback',
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
