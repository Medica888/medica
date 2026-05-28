/**
 * Generation scope resolution, duplicate detection, and expansion-honesty helpers.
 * Used by mockQuestions.js (ESM) and the TypeScript backend.
 */

// ─── Empty-selection detection ────────────────────────────────────────────────

const EMPTY_SELECTIONS = new Set([
  '', 'all', 'all subjects', 'all systems', 'all topics',
  'any', 'any subject', 'any system', 'any topic',
  'general', 'mixed',
  'select subject', 'select system', 'select topic',
])

/**
 * Returns true when a config value represents a default / non-specific selection.
 * Covers every sentinel used by dropdowns: 'All Subjects', 'Mixed', 'General', etc.
 * @param {*} v
 * @returns {boolean}
 */
export function isEmptySelection(v) {
  if (v === null || v === undefined) return true
  return EMPTY_SELECTIONS.has(String(v).toLowerCase().trim())
}

// ─── Subject / system inference ───────────────────────────────────────────────

const GEN_SUBJECT_KEYWORDS = [
  {
    keywords: [
      'ascending tract', 'descending tract', 'spinothalamic', 'corticospinal',
      'dorsal column', 'anterolateral', 'medial lemniscus', 'neuroanatomy',
      'spinal cord anatomy', 'brainstem anatomy', 'dermatome', 'myotome',
      'brachial plexus', 'lumbosacral plexus', 'nerve root', 'spinal nerve',
      'muscle origin', 'muscle insertion', 'ligament', 'bone anatomy',
      'foramen', 'fossa', 'sulcus', 'gyrus', 'lobe anatomy',
    ],
    subject: 'Anatomy',
  },
  {
    keywords: [
      'tca cycle', 'krebs cycle', 'citric acid cycle', 'glycolysis', 'gluconeogenesis',
      'oxidative phosphorylation', 'fatty acid synthesis', 'fatty acid oxidation',
      'amino acid metabolism', 'urea cycle', 'purine synthesis', 'pyrimidine synthesis',
      'cholesterol synthesis', 'galactosemia', 'phenylketonuria', 'alkaptonuria',
      'maple syrup urine', 'homocystinuria', 'enzyme deficiency', 'lysosomal storage',
      'glycogen storage', 'inborn error', 'metabolic pathway', 'acetyl coa', 'nadh', 'fadh2',
    ],
    subject: 'Biochemistry',
  },
  {
    keywords: [
      'pharmacokinetics', 'pharmacodynamics', 'drug mechanism', 'adverse effect',
      'drug interaction', 'receptor agonist', 'receptor antagonist', 'loop diuretic',
      'thiazide', 'beta blocker', 'ace inhibitor', 'arb', 'statin', 'antibiotic',
      'antifungal', 'antiviral', 'antineoplastic', 'chemotherapy drug', 'mechanism of action',
    ],
    subject: 'Pharmacology',
  },
  {
    keywords: [
      'action potential', 'cardiac output', 'preload', 'afterload', 'starling law',
      'glomerular filtration rate', 'tubular reabsorption', 'lung compliance', 'surfactant',
      'hormone regulation', 'negative feedback', 'osmoregulation', 'renal clearance',
    ],
    subject: 'Physiology',
  },
  {
    keywords: [
      'gram positive', 'gram negative', 'virulence factor', 'antimicrobial resistance',
      'biofilm', 'bacterial culture', 'spore forming', 'acid fast', 'capsule bacteria',
    ],
    subject: 'Microbiology',
  },
  {
    keywords: [
      'mhc class', 'major histocompatibility', 'immunoglobulin class switch',
      'b cell development', 't cell development', 'complement cascade', 'innate immunity',
      'adaptive immunity', 'hypersensitivity type', 'autoimmune pathogenesis',
    ],
    subject: 'Immunology',
  },
]

const GEN_SYSTEM_KEYWORDS = [
  {
    keywords: [
      'tca cycle', 'krebs cycle', 'glycolysis', 'gluconeogenesis', 'fatty acid',
      'urea cycle', 'amino acid metabolism', 'metabolic pathway', 'enzyme deficiency',
      'lysosomal storage', 'glycogen storage', 'inborn error', 'acetyl coa',
      'cholesterol synthesis', 'oxidative phosphorylation',
    ],
    system: 'Multisystem',
  },
  {
    keywords: [
      'cardiac', 'heart failure', 'coronary artery', 'aortic', 'arrhythmia', 'ventricular',
      'atrial fibrillation', 'myocardial', 'pericardial', 'valvular', 'hypertension',
    ],
    system: 'Cardiovascular',
  },
  {
    keywords: [
      'kidney', 'renal', 'nephron', 'glomerular', 'tubular reabsorption', 'urinary',
      'acid base', 'loop of henle', 'collecting duct', 'nephritis', 'proteinuria',
      'loop diuretic', 'thiazide diuretic', 'diuretic', 'furosemide', 'bumetanide',
      'torsemide', 'electrolyte', 'hypokalemia', 'hyperkalemia',
    ],
    system: 'Renal / Urinary',
  },
  {
    keywords: [
      'neuron', 'spinal cord', 'cranial nerve', 'stroke', 'seizure', 'dementia',
      'parkinson', 'multiple sclerosis', 'encephalopathy', 'neuropathy', 'cerebellar',
      'ascending tract', 'descending tract', 'spinothalamic', 'corticospinal',
      'dorsal column', 'anterolateral', 'medial lemniscus', 'neuroanatomy',
      'brainstem', 'thalamus', 'basal ganglia', 'white matter tract',
      'upper motor neuron', 'lower motor neuron',
    ],
    system: 'Neurology',
  },
  {
    keywords: [
      'lung', 'respiratory', 'bronchial', 'alveolar', 'pulmonary', 'pneumonia',
      'copd', 'asthma', 'pleural effusion', 'surfactant production',
    ],
    system: 'Respiratory',
  },
  {
    keywords: [
      'liver', 'hepatic', 'bile duct', 'gastrointestinal', 'bowel', 'colon',
      'stomach', 'esophagus', 'ascites', 'portal hypertension', 'pancreas exocrine',
    ],
    system: 'Gastrointestinal',
  },
  {
    keywords: [
      'thyroid', 'adrenal', 'pituitary', 'insulin secretion', 'diabetes mellitus',
      'cortisol', 'aldosterone', 'growth hormone', 'parathyroid', 'calcium regulation',
    ],
    system: 'Endocrine',
  },
  {
    keywords: [
      'red blood cell', 'anemia', 'hemoglobin', 'platelet', 'coagulation cascade',
      'hemostasis', 'leukemia', 'lymphoma', 'bone marrow', 'sickle cell',
    ],
    system: 'Hematology',
  },
  {
    keywords: [
      'bacteria', 'virus', 'fungal infection', 'parasitic', 'sepsis',
      'meningitis', 'hiv', 'tuberculosis', 'antibiotic therapy', 'opportunistic',
    ],
    system: 'Infectious Disease',
  },
]

function _normInfer(s) {
  return String(s || '').toLowerCase().trim()
}

/**
 * Infers the most likely subject from a raw topic string.
 * @param {string} rawTopic
 * @returns {string} Subject name or ''
 */
export function inferSubjectFromTopic(rawTopic) {
  if (!rawTopic) return ''
  const n = _normInfer(rawTopic)
  for (const entry of GEN_SUBJECT_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (n.includes(_normInfer(kw))) return entry.subject
    }
  }
  return ''
}

/**
 * Infers the most likely organ system from a raw topic string.
 * @param {string} rawTopic
 * @param {string} [subject]
 * @returns {string} System name or ''
 */
export function inferSystemFromTopic(rawTopic, subject) {
  if (!rawTopic) return ''
  const n = _normInfer(rawTopic)
  for (const entry of GEN_SYSTEM_KEYWORDS) {
    for (const kw of entry.keywords) {
      if (n.includes(_normInfer(kw))) return entry.system
    }
  }
  return ''
}

/**
 * Strips default/empty selections from a config and infers subject/system
 * from the manual topic when config subject/system are default.
 *
 * Call this BEFORE resolveGenerationScope to ensure clean values flow through.
 *
 * @param {object} config
 * @returns {object}
 */
export function normalizeGenerationConfig(config) {
  if (!config) return {}

  const subject = isEmptySelection(config.subject) ? '' : (config.subject || '')
  const system  = isEmptySelection(config.system)  ? '' : (config.system  || '')
  const rawTopic = ((config.rawTopic || config.topic || '')).trim()

  let inferredSubject = subject
  let inferredSystem  = system

  if (rawTopic) {
    if (!inferredSubject) inferredSubject = inferSubjectFromTopic(rawTopic)
    if (!inferredSystem)  inferredSystem  = inferSystemFromTopic(rawTopic, inferredSubject)
  }

  return {
    ...config,
    subject: inferredSubject,
    system:  inferredSystem,
  }
}

// ─── Scope resolution ─────────────────────────────────────────────────────────

/**
 * Resolves the generation scope from a quiz config using the priority chain:
 * clinicalFocus > coachSpecificTopic > rawTopic > topic > system > subject > global
 *
 * @param {object} config
 * @returns {{
 *   scopeType: 'clinicalFocus'|'coachSpecificTopic'|'manualTopic'|'selectedTopic'|'system'|'subject'|'global',
 *   scopeText: string,
 *   subject: string,
 *   system: string,
 *   topic: string,
 *   rawTopic: string,
 *   canonicalTopic: string,
 *   topicSlug: string,
 *   topicSource: string,
 *   priorityReason: string,
 * }}
 */
export function resolveGenerationScope(config) {
  const {
    clinicalFocus      = '',
    coachSpecificTopic = '',
    rawTopic           = '',
    topic              = '',
    canonicalTopic     = '',
    topicSlug          = '',
    topicSource        = '',
    subject            = '',
    system             = '',
  } = config || {}

  const cf  = String(clinicalFocus      || '').trim()
  const cst = String(coachSpecificTopic || '').trim()
  const rt  = String(rawTopic           || '').trim()
  const t   = String(topic              || '').trim()
  const sys = String(system             || '').trim()
  const sub = String(subject            || '').trim()

  const base = {
    subject:        isEmptySelection(sub) ? '' : sub,
    system:         isEmptySelection(sys) ? '' : sys,
    rawTopic:       rt || t,
    canonicalTopic: String(canonicalTopic || '').trim() || t,
    topicSlug:      String(topicSlug      || '').trim(),
    topicSource:    String(topicSource    || '').trim(),
  }

  if (cf)  return { ...base, scopeType: 'clinicalFocus',      scopeText: cf,  topic: cf,  priorityReason: 'clinicalFocus overrides all other scope selectors' }
  if (cst) return { ...base, scopeType: 'coachSpecificTopic', scopeText: cst, topic: cst, priorityReason: 'coachSpecificTopic is the explicit coach override' }
  if (rt)  return { ...base, scopeType: 'manualTopic',        scopeText: rt,  topic: rt,  priorityReason: 'rawTopic from topic intelligence (user-typed topic)' }
  if (t)   return { ...base, scopeType: 'selectedTopic',      scopeText: t,   topic: t,   priorityReason: 'topic field from config (user-selected topic)' }
  if (sys && !isEmptySelection(sys)) return { ...base, scopeType: 'system',  scopeText: sys, topic: '', priorityReason: 'system selected in config' }
  if (sub && !isEmptySelection(sub)) return { ...base, scopeType: 'subject', scopeText: sub, topic: '', priorityReason: 'subject selected in config' }

  return {
    ...base,
    scopeType:      'global',
    scopeText:      'Mixed USMLE Step 1',
    topic:          '',
    priorityReason: 'no specific scope — mixed generation',
  }
}

/**
 * Returns true when scope is specific enough to warrant anti-generic filtering
 * and scope-based question rejection.
 * @param {{ scopeType: string }} scope
 */
export function isSpecificScope(scope) {
  return ['clinicalFocus', 'coachSpecificTopic', 'manualTopic', 'selectedTopic'].includes(scope?.scopeType)
}

/**
 * Returns true if a question is relevant to the given scope.
 * Only enforces scope checking when isSpecificScope(scope) is true.
 *
 * Primary fields (q.topic, q.testedConcept, q.canonicalTopic, q.rawTopic, q.weakSpotCategory):
 *   full bidirectional substring match.
 * Secondary fields (q.system, q.subject):
 *   forward-only match (field ⊆ needle or field === needle), preventing broad subject labels
 *   like "Pharmacology" from matching a narrower needle like "Oncology Pharmacology".
 *
 * @param {object} q
 * @param {{ scopeType: string, scopeText: string, subject: string, system: string }} scope
 */
export function isQuestionInScope(q, scope) {
  if (!isSpecificScope(scope)) return true

  const needle = _norm(scope.scopeText)

  const primary = [q.topic, q.testedConcept, q.canonicalTopic, q.rawTopic, q.weakSpotCategory]
    .map(f => _norm(f || '')).filter(Boolean)

  // system/subject: only forward (field included in needle), never reverse
  const secondary = [q.system, q.subject]
    .map(f => _norm(f || '')).filter(Boolean)

  return (
    primary.some(f => f.includes(needle) || (f.length >= 5 && needle.includes(f))) ||
    secondary.some(f => f === needle || f.includes(needle))
  )
}

/**
 * Removes duplicate questions from an array.
 * Duplicates are detected by:
 *   - normalized testedConcept
 *   - normalized stem prefix (first 80 chars)
 *   - normalized pearl text (only when > 15 chars)
 *   - topic + questionAngle key (only when questionAngle is populated)
 * First occurrence is kept; duplicates are dropped.
 *
 * @param {object[]} questions
 * @returns {object[]}
 */
export function detectDuplicateQuestions(questions) {
  const seenConcepts = new Set()
  const seenStems    = new Set()
  const seenPearls   = new Set()
  const seenAngles   = new Set()
  const result       = []

  for (const q of questions) {
    const concept   = _norm(q.testedConcept || '')
    const stem      = _norm((q.stem || '').slice(0, 80))
    const pearl     = _norm(q.pearl || q.highYieldPearl || '')
    const hasAngle  = !!String(q.questionAngle || '').trim()
    const angleKey  = hasAngle ? _norm((q.topic || '') + '|' + q.questionAngle) : ''

    if (concept  && seenConcepts.has(concept))  continue
    if (stem     && seenStems.has(stem))         continue
    if (pearl && pearl.length > 15 && seenPearls.has(pearl)) continue
    if (hasAngle && seenAngles.has(angleKey))    continue

    if (concept)  seenConcepts.add(concept)
    if (stem)     seenStems.add(stem)
    if (pearl && pearl.length > 15) seenPearls.add(pearl)
    if (hasAngle) seenAngles.add(angleKey)

    result.push(q)
  }

  return result
}

/**
 * Stamps rawTopic/canonicalTopic/topicSlug/topicSource from scope onto a question
 * WITHOUT overwriting q.topic (expansion honesty — the question's own topic is preserved).
 * Call this instead of applyTopicMetadataToQuestion when the mock bank was expanded
 * beyond the user's requested scope.
 *
 * @param {object} q
 * @param {{ rawTopic: string, canonicalTopic: string, topicSlug: string, topicSource: string }} scope
 * @returns {object}
 */
export function applyExpandedScopeMetadata(q, scope) {
  return {
    ...q,
    rawTopic:       q.rawTopic       || scope.rawTopic       || '',
    canonicalTopic: q.canonicalTopic || scope.canonicalTopic || '',
    topicSlug:      q.topicSlug      || scope.topicSlug      || '',
    topicSource:    q.topicSource    || scope.topicSource    || '',
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _norm(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}
