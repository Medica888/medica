/**
 * Flashcard topic hierarchy helpers.
 * Provides clean topicGroup extraction, concept/angle extraction,
 * system inference, and filtering utilities used by FlashcardsPage
 * and flashcardGenerator.
 *
 * Hierarchy: Subject → System → TopicGroup → Concept → QuestionAngle
 */

import { slugifyTopic } from './topicIntelligence.js'

// ─── Angle detection ──────────────────────────────────────────────────────────

const ANGLE_PHRASES = new Set([
  'recall', 'mechanism', 'common trap', 'trap', 'mnemonic', 'memory hook',
  'pearl', 'high-yield pearl', 'high yield pearl', 'diagnostic association',
  'management decision', 'treatment selection', 'toxicity recognition',
  'adverse effect', 'adverse-effect', 'lab interpretation', 'lab-interpretation',
  'pathophysiology', 'mechanism identification', 'diagnostic approach',
  'complication recognition', 'clinical correlation', 'therapeutic decision',
  'pathophysiology review', 'pharmacology',
])

const ANGLE_WORDS = new Set([
  'recall', 'mechanism', 'trap', 'mnemonic', 'pearl', 'management',
  'treatment', 'diagnostic', 'toxicity', 'pharmacology', 'pathophysiology',
  'complication', 'therapeutic', 'correlation',
])

function _norm(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ')
}

function _isAngleLike(str) {
  const n = _norm(str)
  if (ANGLE_PHRASES.has(n)) return true
  const words = n.split(' ')
  return words.length <= 4 && words.some(w => ANGLE_WORDS.has(w))
}

const TAG_TO_ANGLE = {
  Recall:    'recall',
  Mechanism: 'mechanism',
  Trap:      'common trap',
  Mnemonic:  'memory hook',
  Pearl:     'high-yield pearl',
}

// ─── System inference ─────────────────────────────────────────────────────────

const SYSTEM_INFERENCE = [
  [['tumor marker', 'tumor markers', 'cancer marker', 'oncofetal', 'afp', 'cea', 'psa', 'ca-125', 'ca 125', 'ca 19-9', 'beta-hcg', 'beta hcg', 'carcinoembryonic'], 'Oncology'],
  [['oncology', 'chemotherapy', 'antineoplastic', 'lymphoma', 'leukemia', 'sarcoma', 'carcinoma', 'metastasis', 'neoplasm', 'cancer treatment', 'cancer drug'], 'Oncology'],
  [['loop diuretic', 'nkcc2', 'thiazide', 'diuretic', 'nephritis', 'glomerulo', 'nephrotic', 'nephritic', 'pyelonephritis', 'renal tubular', 'acute kidney', 'proteinuria', 'hematuria', 'creatinine'], 'Renal / Urinary'],
  [['cardiac', 'heart failure', 'coronary', 'aortic', 'arrhythmia', 'myocardial', 'pericardial', 'atrial fibrillation', 'ventricular', 'dissection', 'aortic stenosis', 'valvular'], 'Cardiovascular'],
  [['thyroid', 'adrenal', 'diabetes mellitus', 'insulin', 'parathyroid', 'pituitary', 'cortisol', 'aldosterone', 'graves disease', 'hashimoto', 'hyperparathyroid', 'hypercalcemia'], 'Endocrine'],
  [['pneumonia', 'pulmonary', 'copd', 'asthma', 'pleural', 'bronchial', 'interstitial lung', 'respiratory failure', 'lung fibrosis'], 'Respiratory'],
  [['agammaglobulinemia', 'immunodeficiency', 'scid', 'complement deficiency', 'bruton', 'btk', 'xla', 'hyper-igm', 'common variable'], 'Immunology'],
  [['sepsis', 'hiv', 'aids', 'tuberculosis', 'meningitis', 'antibiotic', 'opportunistic infection', 'mac', 'mycobacterium', 'streptococcal', 'bacterial', 'viral infection'], 'Infectious Disease'],
  [['stroke', 'seizure', 'dementia', 'multiple sclerosis', 'encephalopathy', 'wernicke', 'parkinson', 'neuropathy', 'cranial nerve', 'pontine', 'cerebellar', 'korsakoff'], 'Neurology'],
  [['arthritis', 'rheumatoid', 'gout', 'osteoporosis', 'joint', 'synovial', 'pannus', 'musculoskeletal', 'fracture', 'bone'], 'Musculoskeletal'],
  [['liver', 'hepatic', 'biliary', 'pancreas', 'bowel', 'colitis', 'ascites', 'saag', 'crohn', 'gastrointestinal', 'stomach', 'esophagus'], 'Gastrointestinal'],
  [['galactosemia', 'metabolic disorder', 'inborn error', 'enzyme deficiency', 'glycogen storage', 'lysosomal', 'galactitol'], 'Multisystem'],
]

/**
 * Infers a system from a topic string and optional subject context.
 * Returns '' when no confident match is found.
 *
 * @param {string} topic
 * @param {string} [subject]
 * @returns {string}
 */
export function inferSystemFromTopic(topic, subject) {
  if (!topic) return ''
  const n = _norm(topic)
  for (const [keywords, system] of SYSTEM_INFERENCE) {
    for (const kw of keywords) {
      if (n.includes(_norm(kw))) return system
    }
  }
  return ''
}

// ─── Core extraction ──────────────────────────────────────────────────────────

/**
 * Returns the clean parent topic group from a card.
 *
 * Priority:
 * 1. card.topicGroup (explicit — new cards)
 * 2. card.canonicalTopic — first " — " segment (or as-is if clean)
 * 3. card.rawTopic — first " — " segment (or as-is)
 * 4. card.topic — first " — " segment (or as-is)
 * 5. card.concept — first " — " segment (backward compat for compound testedConcept)
 * 6. card.weakSpotCategory
 * 7. 'General'
 *
 * @param {object} card
 * @returns {string}
 */
export function getTopicGroup(card) {
  if (!card) return 'General'

  if (card.topicGroup && card.topicGroup !== 'General') return card.topicGroup

  const _firstSeg = (s) => s.includes(' — ') ? s.split(' — ')[0].trim() : s

  if (card.canonicalTopic && card.canonicalTopic !== 'General') {
    return _firstSeg(card.canonicalTopic)
  }

  if (card.rawTopic) return _firstSeg(card.rawTopic)

  if (card.topic && card.topic !== 'General') return _firstSeg(card.topic)

  // Backward compat: concept stores q.testedConcept which may be compound
  if (card.concept && card.concept.includes(' — ')) {
    return card.concept.split(' — ')[0].trim()
  }
  if (card.concept) return card.concept

  if (card.weakSpotCategory) return card.weakSpotCategory

  return 'General'
}

/**
 * Returns the specific concept tested on a card.
 * Strips topicGroup prefix from compound strings.
 *
 * Priority:
 * 1. card.concept field — strips topicGroup prefix if compound
 * 2. Middle segment(s) from card.canonicalTopic / card.topic split on " — "
 * 3. ''
 *
 * @param {object} card
 * @returns {string}
 */
export function getConceptFromTopic(card) {
  if (!card) return ''

  if (card.concept) {
    const c = card.concept
    if (!c.includes(' — ')) return c
    // Strip the topicGroup prefix for display
    const tg = getTopicGroup(card)
    const prefix = tg + ' — '
    if (c.startsWith(prefix)) return c.slice(prefix.length).trim()
    return c.split(' — ').slice(1).join(' — ').trim()
  }

  // Derive from canonicalTopic or topic
  const topic = card.canonicalTopic || card.topic || ''
  if (!topic.includes(' — ')) return ''

  const parts = topic.split(' — ')
  if (parts.length === 2) {
    const second = parts[1].trim()
    return _isAngleLike(second.toLowerCase()) ? '' : second
  }
  if (parts.length >= 3) {
    const last = parts[parts.length - 1].trim().toLowerCase()
    return _isAngleLike(last)
      ? parts.slice(1, -1).join(' — ').trim()
      : parts.slice(1).join(' — ').trim()
  }

  return ''
}

/**
 * Returns the question angle label for a card.
 *
 * Priority:
 * 1. card.questionAngle (new cards, set per card type in generator)
 * 2. TAG_TO_ANGLE[card.tag]
 * 3. Last " — " segment if angle-like
 * 4. ''
 *
 * @param {object} card
 * @returns {string}
 */
export function getQuestionAngle(card) {
  if (!card) return ''

  if (card.questionAngle) return card.questionAngle

  if (card.tag) return TAG_TO_ANGLE[card.tag] || card.tag.toLowerCase()

  const topic = card.canonicalTopic || card.topic || ''
  if (topic.includes(' — ')) {
    const parts = topic.split(' — ')
    const last = parts[parts.length - 1].trim()
    if (_isAngleLike(last.toLowerCase())) return last.toLowerCase()
  }

  return ''
}

/**
 * Returns sorted topic group options with card counts.
 * 'General' is always sorted last.
 *
 * @param {object[]} cards
 * @returns {{ topicGroup: string, count: number }[]}
 */
export function getTopicGroupOptions(cards) {
  if (!cards || cards.length === 0) return []
  const map = {}
  for (const card of cards) {
    const tg = getTopicGroup(card)
    map[tg] = (map[tg] || 0) + 1
  }
  return Object.entries(map)
    .map(([topicGroup, count]) => ({ topicGroup, count }))
    .sort((a, b) => {
      if (a.topicGroup === 'General') return 1
      if (b.topicGroup === 'General') return -1
      return b.count - a.count
    })
}

/**
 * Returns the most recently created topic groups (up to `limit`).
 *
 * @param {object[]} cards
 * @param {number} [limit=5]
 * @returns {string[]}
 */
export function getRecentTopicGroups(cards, limit = 5) {
  if (!cards || cards.length === 0) return []
  const sorted = [...cards].sort((a, b) => {
    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return bt - at
  })
  const seen = new Set()
  const result = []
  for (const card of sorted) {
    const tg = getTopicGroup(card)
    if (!seen.has(tg)) {
      seen.add(tg)
      result.push(tg)
      if (result.length >= limit) break
    }
  }
  return result
}

/**
 * Returns the weakest topic groups — lowest mastery ratio first.
 * Only includes groups with at least 2 cards.
 *
 * @param {object[]} cards
 * @param {number} [limit=5]
 * @returns {string[]}
 */
export function getWeakTopicGroups(cards, limit = 5) {
  if (!cards || cards.length === 0) return []
  const map = {}
  for (const card of cards) {
    const tg = getTopicGroup(card)
    if (!map[tg]) map[tg] = { total: 0, mastered: 0 }
    map[tg].total++
    if ((card.reviewStatus || 'new') === 'mastered') map[tg].mastered++
  }
  return Object.entries(map)
    .filter(([, { total }]) => total >= 2)
    .map(([topicGroup, { total, mastered }]) => ({
      topicGroup,
      masteryRate: total > 0 ? mastered / total : 0,
    }))
    .sort((a, b) => a.masteryRate - b.masteryRate)
    .slice(0, limit)
    .map(({ topicGroup }) => topicGroup)
}

/**
 * Returns true when a card belongs to the selected topicGroup.
 *
 * @param {object} card
 * @param {string} selectedTopicGroup - 'all' or a topicGroup string
 * @returns {boolean}
 */
export function matchesTopicGroup(card, selectedTopicGroup) {
  if (!selectedTopicGroup || selectedTopicGroup === 'all') return true
  return getTopicGroup(card) === selectedTopicGroup
}

/**
 * Builds a URL-safe slug from subject + system + topicGroup.
 *
 * Example: ("Pathology", "Oncology", "Rare Tumor Markers")
 *   → "pathology-oncology-rare-tumor-markers"
 *
 * @param {string} subject
 * @param {string} system
 * @param {string} topicGroup
 * @returns {string}
 */
export function buildTopicSlug(subject, system, topicGroup) {
  return [subject, system, topicGroup]
    .filter(v => v && v !== 'General')
    .map(v => slugifyTopic(v))
    .join('-') || ''
}
