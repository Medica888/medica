/**
 * Topic Intelligence Layer
 * Normalizes, canonicalizes, and propagates manual topic metadata
 * through the quiz → session → flashcard → analytics pipeline.
 */

import { isEmptySelection } from './generationScope.js'
import { matchDisciplineOrPhrase } from './topicNormalizer.js'

// --------------- Registry ---------------
// Each entry: canonical display name, optional default subject/system,
// and aliases the matcher will recognize.
const TOPIC_REGISTRY = [
  {
    canonical: 'Oncology Pharmacology',
    subject: 'Pharmacology',
    system: 'Oncology',
    aliases: [
      'onco pharmacology', 'oncology drugs', 'cancer pharmacology',
      'chemotherapy pharmacology', 'chemo drugs', 'cancer drugs',
      'antineoplastic agents', 'antineoplastics', 'cancer treatment',
    ],
  },
  {
    canonical: 'Loop Diuretics',
    subject: 'Pharmacology',
    system: 'Renal / Urinary',
    aliases: [
      'loop diuretics', 'loop diuretic', 'furosemide', 'torsemide',
      'bumetanide', 'loop of henle diuretics', 'nkcc2 inhibitors',
      'thick ascending limb',
    ],
  },
  {
    canonical: 'Acid-base Disorders',
    subject: 'Physiology',
    system: 'Renal / Urinary',
    aliases: [
      'acid base disorders', 'acid-base balance', 'anion gap acidosis',
      'metabolic acidosis', 'metabolic alkalosis',
      'respiratory acidosis', 'respiratory alkalosis',
      'henderson hasselbalch',
    ],
  },
  {
    canonical: 'Heart Failure',
    subject: 'Pathology',
    system: 'Cardiovascular',
    aliases: [
      'congestive heart failure', 'systolic dysfunction',
      'diastolic dysfunction', 'left ventricular failure',
      'right heart failure', 'ejection fraction', 'cardiac failure',
    ],
  },
  {
    canonical: 'Aortic Dissection',
    subject: 'Pathology',
    system: 'Cardiovascular',
    aliases: [
      'aortic dissection', 'type a dissection', 'type b dissection',
      'stanford classification dissection', 'debakey classification',
    ],
  },
  {
    canonical: 'Stroke Syndromes',
    subject: 'Pathology',
    system: 'Neurology',
    aliases: [
      'ischemic stroke', 'hemorrhagic stroke', 'cerebrovascular accident',
      'lacunar infarct', 'cerebellar stroke', 'brain stem stroke',
      'transient ischemic attack',
    ],
  },
  {
    canonical: 'Thyroid Disorders',
    subject: 'Pathology',
    system: 'Endocrine',
    aliases: [
      'hypothyroidism', 'hyperthyroidism', 'hashimoto thyroiditis',
      'graves disease', 'thyrotoxicosis', 'thyroid cancer',
      'thyroid nodule',
    ],
  },
  {
    canonical: 'Renal Tubular Disorders',
    subject: 'Pathology',
    system: 'Renal / Urinary',
    aliases: [
      'renal tubular acidosis', 'fanconi syndrome',
      'proximal tubule disorder', 'distal tubule disorder',
    ],
  },
  {
    canonical: 'Antibiotics',
    subject: 'Pharmacology',
    system: 'Infectious Disease',
    aliases: [
      'antibiotic therapy', 'antimicrobial therapy', 'penicillin antibiotics',
      'cephalosporin antibiotics', 'fluoroquinolone antibiotics',
      'macrolide antibiotics', 'tetracycline antibiotics',
      'aminoglycoside antibiotics', 'beta lactam antibiotics',
    ],
  },
  {
    canonical: 'Diabetes Mellitus',
    subject: 'Pathology',
    system: 'Endocrine',
    aliases: [
      'type 1 diabetes', 'type 2 diabetes',
      'diabetic ketoacidosis', 'hyperosmolar hyperglycemic state',
      'insulin resistance', 'diabetes management',
    ],
  },
  {
    canonical: 'Hypertension',
    subject: 'Pathology',
    system: 'Cardiovascular',
    aliases: [
      'high blood pressure', 'arterial hypertension',
      'antihypertensive therapy', 'hypertensive urgency',
      'hypertensive emergency',
    ],
  },
  {
    canonical: 'Respiratory Infections',
    subject: 'Pathology',
    system: 'Respiratory',
    aliases: [
      'pneumonia', 'community acquired pneumonia', 'hospital acquired pneumonia',
      'bronchitis', 'lung infection', 'pulmonary infection',
    ],
  },
]

// --------------- Internal matching ---------------

// Normalize for comparison: lowercase, collapse spaces, strip hyphens
function _norm(s) {
  return String(s || '').toLowerCase().trim().replace(/-/g, ' ').replace(/\s+/g, ' ')
}

// Only match alias if: exact match, OR alias is multi-word AND appears as a phrase in needle.
// This prevents single-word aliases like "stroke" from matching "heat stroke" or "diabetes"
// matching "diabetes insipidus".
function _aliasMatches(alias, needle) {
  const a = _norm(alias)
  const n = _norm(needle)
  if (a === n) return true
  // Multi-word aliases (2+ words) may match as a contained phrase
  if (a.split(' ').length >= 2 && n.includes(a)) return true
  return false
}

// --------------- Public API ---------------

/**
 * Trims and collapses whitespace. Returns '' for null/undefined.
 * @param {*} value
 * @returns {string}
 */
export function normalizeTopicText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim().replace(/\s+/g, ' ')
}

/**
 * Converts a display string to a URL-safe slug.
 * "Oncology Pharmacology" → "oncology-pharmacology"
 * @param {string} value
 * @returns {string}
 */
export function slugifyTopic(value) {
  if (!value) return ''
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Looks up rawTopic in the registry and returns the canonical display name.
 * Falls back to a title-cased version of rawTopic if no registry match is found.
 * @param {string} rawTopic
 * @param {string} [subject]
 * @param {string} [system]
 * @returns {string}
 */
export function getCanonicalTopic(rawTopic, subject, system) {
  if (!rawTopic) return ''

  // 0. Alias / misspelling / discipline abbreviation check (neuro→Neurology, etc.)
  const disciplineOrPhrase = matchDisciplineOrPhrase(rawTopic)
  if (disciplineOrPhrase) return disciplineOrPhrase

  const needle = _norm(rawTopic)

  // 1. Exact canonical match (e.g. user typed exactly "Loop Diuretics")
  for (const entry of TOPIC_REGISTRY) {
    if (_norm(entry.canonical) === needle) return entry.canonical
  }

  // 2. Alias match (exact or multi-word phrase contained in needle)
  for (const entry of TOPIC_REGISTRY) {
    for (const alias of entry.aliases) {
      if (_aliasMatches(alias, needle)) return entry.canonical
    }
  }

  // 3. Subject/system hint — if config subject/system matches a registry entry
  //    AND the raw topic loosely relates (contains the system or subject name)
  if (subject || system) {
    const ns = _norm(subject)
    const ny = _norm(system)
    for (const entry of TOPIC_REGISTRY) {
      const es = _norm(entry.subject || '')
      const ey = _norm(entry.system  || '')
      const subjectMatch = ns && es && (ns === es)
      const systemMatch  = ny && ey && (ny === ey)
      if ((subjectMatch || systemMatch) && (needle.includes(es) || needle.includes(ey))) {
        return entry.canonical
      }
    }
  }

  // 4. No match — create a canonical from the user's raw topic (title-case)
  return normalizeTopicText(rawTopic).replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Builds full topic metadata from a quiz config.
 * Uses config.topic as the raw input.
 * Returns an object with rawTopic, canonicalTopic, topicSlug, subject, system, topicSource.
 * If no topic is entered, all fields are empty and topicSource is 'auto'.
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {{
 *   rawTopic: string,
 *   canonicalTopic: string,
 *   topicSlug: string,
 *   subject: string,
 *   system: string,
 *   topicSource: 'manual' | 'auto'
 * }}
 */
export function buildTopicMetadata(config) {
  const rawTopic = normalizeTopicText(
    config.topic || ''
  )

  // Strip default dropdown sentinels so they never pollute metadata
  const cfgSubject = isEmptySelection(config.subject) ? '' : (config.subject || '')
  const cfgSystem  = isEmptySelection(config.system)  ? '' : (config.system  || '')

  if (!rawTopic) {
    return {
      rawTopic: '',
      canonicalTopic: '',
      topicSlug: '',
      subject: cfgSubject,
      system: cfgSystem,
      topicSource: 'auto',
    }
  }

  const canonicalTopic = getCanonicalTopic(rawTopic, cfgSubject, cfgSystem)
  const topicSlug = slugifyTopic(canonicalTopic || rawTopic)

  // Use registry entry to fill in subject/system if not already set by config
  const registryEntry = TOPIC_REGISTRY.find(e => e.canonical === canonicalTopic)

  return {
    rawTopic,
    canonicalTopic,
    topicSlug,
    subject: cfgSubject || registryEntry?.subject || '',
    system:  cfgSystem  || registryEntry?.system  || '',
    topicSource: config.topicSource || 'manual',
  }
}

/**
 * Merges topic metadata into a question object.
 * Manual topic always takes priority over the AI-assigned topic field.
 * Only subject/system are filled in if missing (AI values are preserved).
 * @param {object} question
 * @param {{rawTopic:string, canonicalTopic:string, topicSlug:string, topicSource:string, subject:string, system:string} | null} topicMetadata
 * @returns {object}
 */
export function applyTopicMetadataToQuestion(question, topicMetadata) {
  if (!topicMetadata || !topicMetadata.rawTopic) return question

  return {
    ...question,
    // Manual topic always wins — spec requirement
    topic:          topicMetadata.canonicalTopic || topicMetadata.rawTopic,
    rawTopic:       topicMetadata.rawTopic,
    canonicalTopic: topicMetadata.canonicalTopic || topicMetadata.rawTopic,
    topicSlug:      topicMetadata.topicSlug,
    topicSource:    topicMetadata.topicSource,
    // Only fill in subject/system if AI didn't set them
    subject: question.subject || topicMetadata.subject || '',
    system:  question.system  || topicMetadata.system  || '',
  }
}

/**
 * Enriches a session and its questions with topic metadata from config.
 * Safe to call on both AI-generated and mock sessions.
 * @param {object} session
 * @param {import('./quizTypes').QuizConfig} config
 * @returns {object}
 */
export function enrichSessionWithTopicMetadata(session, config) {
  const tm = config?.topicMetadata
  if (!tm?.rawTopic) return session

  return {
    ...session,
    topic:          tm.canonicalTopic || tm.rawTopic,
    rawTopic:       tm.rawTopic,
    canonicalTopic: tm.canonicalTopic,
    topicSlug:      tm.topicSlug,
    topicSource:    tm.topicSource,
    questions: (session.questions || []).map(q => applyTopicMetadataToQuestion(q, tm)),
  }
}

/**
 * Priority chain for resolving flashcard topic metadata.
 * Returns a complete {topic, rawTopic, canonicalTopic, topicSlug, topicSource, subject, system}.
 * Never returns 'General' unless every source is empty.
 * @param {object} question
 * @param {object} session
 * @returns {{ topic:string, rawTopic:string, canonicalTopic:string, topicSlug:string, topicSource:string, subject:string, system:string }}
 */
export function resolveFlashcardTopicMetadata(question, session) {
  const q  = question || {}
  const s  = session  || {}
  const sc = s.config || {}

  // Walk the priority chain for rawTopic
  const rawTopic =
    q.rawTopic             ||
    q.canonicalTopic       ||
    q.topic                ||
    s.rawTopic             ||
    s.canonicalTopic       ||
    s.topic                ||
    sc.rawTopic ||
    sc.topic    ||
    ''

  // Canonical — use question's if already set (most reliable), else compute
  const canonicalTopic =
    q.canonicalTopic ||
    s.canonicalTopic ||
    (rawTopic
      ? getCanonicalTopic(rawTopic, q.subject || sc.subject, q.system || sc.system)
      : '')

  const topicSlug =
    q.topicSlug ||
    s.topicSlug ||
    slugifyTopic(canonicalTopic || rawTopic)

  // For display, never show 'General' when a real topic exists
  const topic = canonicalTopic || rawTopic || 'General'

  const topicSource =
    q.topicSource ||
    s.topicSource ||
    (rawTopic ? 'manual' : 'auto')

  const subject = q.subject || sc.subject || ''
  const system  = q.system  || sc.system  || ''

  return { topic, rawTopic, canonicalTopic, topicSlug, topicSource, subject, system }
}
