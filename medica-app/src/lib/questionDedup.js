/**
 * Question deduplication and cross-session exclusion utilities.
 * All functions are pure - no side effects, no imports from storage or API layers.
 */

export function getBaseQuestionId(id) {
  return String(id || '').replace(/_v\d+$/, '')
}

export function normalizeQuestionStem(stem) {
  return String(stem || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function getQuestionFingerprint(question) {
  const stem    = normalizeQuestionStem(question.stem)
  const concept = String(question.testedConcept || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return `${stem}||${concept}`
}

/**
 * Validates that all questions are unique by ID, base ID, stem, and fingerprint.
 * @param {object[]} questions
 * @returns {{ valid: boolean, duplicates: Array<{id:string, reason:string}>, uniqueCount: number }}
 */
export function validateUniqueQuestions(questions) {
  const seenIds          = new Set()
  const seenBaseIds      = new Set()
  const seenStems        = new Set()
  const seenFingerprints = new Set()
  const duplicates       = []

  for (const q of questions) {
    const id          = String(q.id || '')
    const baseId      = getBaseQuestionId(id)
    const stem        = normalizeQuestionStem(q.stem)
    const fingerprint = getQuestionFingerprint(q)

    if (id     && seenIds.has(id))                   { duplicates.push({ id, reason: 'duplicate_id' });          continue }
    if (baseId && seenBaseIds.has(baseId))            { duplicates.push({ id, reason: 'duplicate_base_id' });     continue }
    if (stem   && seenStems.has(stem))                { duplicates.push({ id, reason: 'duplicate_stem' });        continue }
    if (           seenFingerprints.has(fingerprint)) { duplicates.push({ id, reason: 'duplicate_fingerprint' }); continue }

    if (id)     seenIds.add(id)
    if (baseId) seenBaseIds.add(baseId)
    if (stem)   seenStems.add(stem)
    seenFingerprints.add(fingerprint)
  }

  return {
    valid:       duplicates.length === 0,
    duplicates,
    uniqueCount: questions.length - duplicates.length,
  }
}

/**
 * Builds a seen-state record from localStorage session history.
 * @param {object[]} sessionHistory
 * @returns {{ seenIds: Set<string>, seenBaseIds: Set<string>, seenFingerprints: Set<string> }}
 */
export function buildSeenState(sessionHistory) {
  const seenIds          = new Set()
  const seenBaseIds      = new Set()
  const seenFingerprints = new Set()

  for (const session of (sessionHistory || [])) {
    for (const rawId of (session.questionIds || [])) {
      const id   = String(rawId || '')
      const base = getBaseQuestionId(id)
      if (id)   seenIds.add(id)
      if (base) seenBaseIds.add(base)
    }
    for (const q of (session.missedQuestions || [])) {
      if (q.id) {
        seenIds.add(String(q.id))
        seenBaseIds.add(getBaseQuestionId(String(q.id)))
      }
      if (q.stem) seenFingerprints.add(getQuestionFingerprint(q))
    }
  }

  return { seenIds, seenBaseIds, seenFingerprints }
}

/**
 * Returns only questions that have not been seen in any previous session.
 * @param {object[]} questions
 * @param {{ seenIds: Set<string>, seenBaseIds: Set<string>, seenFingerprints: Set<string> }} seenState
 * @returns {object[]}
 */
export function filterUnseenQuestions(questions, seenState) {
  return questions.filter(q => {
    const id   = String(q.id || '')
    const base = getBaseQuestionId(id)
    const fp   = getQuestionFingerprint(q)
    return !seenState.seenIds.has(id)
        && !seenState.seenBaseIds.has(base)
        && !seenState.seenFingerprints.has(fp)
  })
}

export const EMPTY_SEEN_STATE = { seenIds: new Set(), seenBaseIds: new Set(), seenFingerprints: new Set() }

/**
 * Removes duplicate questions by id, base id, stem, and fingerprint (first occurrence wins).
 * Shared by the local bundle (mockQuestions.js), the authored-question export script, and any
 * other consumer that needs the bundle's identity-dedup invariant applied to a question array.
 * @param {object[]} questions
 * @returns {object[]}
 */
export function dedupeQuestionList(questions) {
  const seenIds = new Set()
  const seenBaseIds = new Set()
  const seenStems = new Set()
  const seenFingerprints = new Set()
  return questions.filter(question => {
    const id = String(question?.id || '')
    const baseId = getBaseQuestionId(id)
    const stem = normalizeQuestionStem(question?.stem)
    const fingerprint = getQuestionFingerprint(question)
    if (!id || seenIds.has(id) || seenBaseIds.has(baseId) || seenStems.has(stem) || seenFingerprints.has(fingerprint)) return false
    seenIds.add(id)
    seenBaseIds.add(baseId)
    seenStems.add(stem)
    seenFingerprints.add(fingerprint)
    return true
  })
}
