import { normalizeTopicForAnalytics } from './topicNormalizer.js'
import { getRangeStartDate, isTimestampInRange } from './dateRange.js'
import { normalizeSubjectLabel, normalizeSystemLabel } from './usmleTaxonomy.js'

export { getRangeStartDate }

/**
 * Filters a sorted sessions array to only those whose completedAt falls within the range.
 * Sessions with no valid completedAt are excluded from week/month (included only in 'all').
 * @param {object[]} sessions
 * @param {'week'|'month'|'all'} range
 * @param {Date} [now]
 */
export function filterSessionsByRange(sessions, range, now = new Date()) {
  const start = getRangeStartDate(range, now)
  if (!start) return sessions
  return sessions.filter(s => isTimestampInRange(s.completedAt, start))
}

// ── USMLE Step 1 discipline yield weights ──────────────────────────────────
const USMLE_STEP1_YIELD_MAP = {
  'Pathology':          { weight: 1.30, reason: 'Core Step 1 discipline with high integration across systems.' },
  'Physiology':         { weight: 1.25, reason: 'Essential for mechanism-based questions and clinical reasoning.' },
  'Pharmacology':       { weight: 1.25, reason: 'High-yield for mechanisms, adverse effects, contraindications, and autonomics.' },
  'Microbiology':       { weight: 1.20, reason: 'Frequently tested through organism recognition, virulence, and treatment.' },
  'Immunology':         { weight: 1.20, reason: 'High-yield for hypersensitivity, immune deficiencies, vaccines, and mechanisms.' },
  'Biochemistry':       { weight: 1.15, reason: 'Important for metabolism, genetics, vitamins, and molecular disease.' },
  'Genetics':           { weight: 1.15, reason: 'Commonly tested through inheritance, molecular mechanisms, and disease associations.' },
  'Behavioral Science': { weight: 1.05, reason: 'Important but usually lower priority than core mechanisms unless performance is weak.' },
  'Ethics':             { weight: 1.00, reason: 'Important for exam performance.' },
  'Anatomy':            { weight: 0.95, reason: 'Useful but usually lower Step 1 yield than pathology, physiology, pharm, and micro.' },
  'Embryology':         { weight: 0.90, reason: 'Narrower topic; prioritize strongly only if performance is poor.' },
  'Histology':          { weight: 0.85, reason: 'Lower standalone yield; prioritize when linked to pathology or systems.' },
}

// ── USMLE Step 1 system yield weights ─────────────────────────────────────
const USMLE_SYSTEM_YIELD_MAP = {
  'Cardiovascular':        { weight: 1.25, testedAs: 'Mechanism, pathophysiology, pharmacology, and clinical management.' },
  'Renal / Urinary':       { weight: 1.20, testedAs: 'Acid-base, electrolytes, GFR, tubular disorders, and pharmacology.' },
  'Renal':                 { weight: 1.20, testedAs: 'Acid-base, electrolytes, and renal pharmacology.' },
  'Hematology / Oncology': { weight: 1.20, testedAs: 'Anemias, coagulation, leukemia, and oncology pharmacology.' },
  'Hematology':            { weight: 1.20, testedAs: 'Anemias, coagulation, and leukemia.' },
  'Neurology':             { weight: 1.15, testedAs: 'Localization, stroke syndromes, neurodegenerative disease, and pharmacology.' },
  'Pulmonary':             { weight: 1.15, testedAs: 'Obstructive vs restrictive, V/Q mismatch, and infections.' },
  'Respiratory':           { weight: 1.15, testedAs: 'Obstructive vs restrictive, V/Q mismatch, and infections.' },
  'Endocrine':             { weight: 1.15, testedAs: 'Hormone pathways, diabetes, thyroid, adrenal, and pituitary.' },
  'Infectious Disease':    { weight: 1.10, testedAs: 'Organism recognition, virulence, antibiotic mechanisms, and resistance.' },
  'Gastrointestinal':      { weight: 1.10, testedAs: 'GI pathology, liver disease, and enzyme deficiencies.' },
  'Reproductive':          { weight: 1.05, testedAs: 'OB/GYN, hormonal pathways, and reproductive pharmacology.' },
  'Musculoskeletal':       { weight: 0.95, testedAs: 'Connective tissue disorders and joint pathology.' },
  'Psychiatry':            { weight: 0.90, testedAs: 'DSM criteria, pharmacology, and neurotransmitter pathways.' },
  'Dermatology':           { weight: 0.85, testedAs: 'Classic presentations, autoimmune skin conditions, and skin cancers.' },
}

const USMLE_CONTENT_YIELD_MAP = {
  'Cardiovascular System': { weight: 1.25, testedAs: 'Mechanisms, pharmacotherapy, hemodynamics, and clinical vignettes.' },
  'Renal & Urinary System': { weight: 1.20, testedAs: 'Acid-base, electrolytes, renal physiology, and diuretic pharmacology.' },
  'Respiratory System': { weight: 1.15, testedAs: 'Gas exchange, obstructive/restrictive disease, and pulmonary pathology.' },
  'Nervous System & Special Senses': { weight: 1.15, testedAs: 'Neuroanatomy, localization, sensory systems, and neuropathology.' },
  'Immune System': { weight: 1.20, testedAs: 'Immune mechanisms, hypersensitivity, immunodeficiency, and autoimmunity.' },
  'Blood & Lymphoreticular System': { weight: 1.20, testedAs: 'Anemia, coagulation, heme malignancy, and lymphoid disorders.' },
  'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature': { weight: 1.10, testedAs: 'Study design, risk, bias, and interpretation of medical literature.' },
}

const PHYSICIAN_TASK_YIELD_MAP = {
  'Medical Knowledge: Applying Foundational Science Concepts': { weight: 1.25, testedAs: 'Foundational science mechanisms applied to clinical vignettes.' },
  'Patient Care: Diagnosis': { weight: 1.20, testedAs: 'Pattern recognition, localization, and selecting the most likely diagnosis.' },
  'Patient Care: Laboratory and Diagnostic Studies': { weight: 1.15, testedAs: 'Interpreting labs, imaging, pathology, and diagnostic test results.' },
  'Patient Care: Pharmacotherapy': { weight: 1.20, testedAs: 'Drug choice, mechanism, contraindications, adverse effects, and interactions.' },
  'Patient Care: Health Maintenance and Disease Prevention': { weight: 1.05, testedAs: 'Screening, vaccines, prevention, and risk reduction.' },
  'Professionalism, Legal, and Ethical Principles': { weight: 1.00, testedAs: 'Ethics, consent, confidentiality, and professional conduct.' },
  'Systems-Based Practice and Patient Safety': { weight: 1.00, testedAs: 'Quality, safety, errors, systems thinking, and handoffs.' },
  'Practice-Based Learning and Improvement': { weight: 1.05, testedAs: 'Evidence interpretation, study design, bias, and research ethics.' },
}

/**
 * @param {'week'|'month'|'all'} [range]
 * @param {Date} [now]  — injectable for deterministic tests
 */
export function buildAnalyticsData(storageData, range = 'all', now = new Date()) {
  const { sessions: rawHistory = [], lastPractice = null, lastCoach = null, flashcards = [], flashcardReviewEvents = [] } = storageData ?? {}

  const allSessions = _buildSessions(rawHistory, lastPractice, lastCoach)
  const sessions    = filterSessionsByRange(allSessions, range, now)

  if (sessions.length === 0) {
    // rangeEmpty=true means sessions exist overall but none in this range
    return { empty: true, rangeEmpty: range !== 'all' && allSessions.length > 0 }
  }

  const overview = _computeOverview(sessions)
  const subjectBreakdown = _aggregateSubjects(sessions)
  const systemBreakdown = _aggregateSystems(sessions)
  const usmleContentBreakdown = _aggregateNamedBreakdown(sessions, 'usmleContentBreakdown')
  const physicianTaskBreakdown = _aggregateNamedBreakdown(sessions, 'physicianTaskBreakdown')
  const topicBreakdown = _aggregateTopics(sessions)
  const weaknesses = _detectWeaknesses(subjectBreakdown, systemBreakdown, topicBreakdown, usmleContentBreakdown, physicianTaskBreakdown)
  const mistakeDiagnosis = _diagnoseMistakes(sessions)
  const studyPrescription = _prescribeStudy(weaknesses, overview)
  const sessionComparison = _compareSessions(sessions)
  const trends = _computeTrends(sessions)
  const flashcardSummary = _buildFlashcardSummary(sessions)
  const repeatedMistakes = _detectRepeatedMistakes(sessions)
  const repeatedPatterns = _detectRepeatedPatterns(sessions)
  const improvingTopics = _detectImprovingTopics(sessions)
  const flashcardsData = _buildFlashcardsData(flashcards)
  const flashcardMastery = _buildFlashcardMastery(flashcardReviewEvents)
  const studyStreak = _computeStreak(sessions)
  const nextSession = _recommendNextSession(weaknesses, overview, topicBreakdown, flashcardMastery.weakConcepts)

  return {
    empty: false,
    sessions,
    overview: { ...overview, studyStreak, flashcardsDue: flashcardsData.due },
    subjectBreakdown,
    systemBreakdown,
    usmleContentBreakdown,
    physicianTaskBreakdown,
    topicBreakdown,
    weaknesses,
    mistakeDiagnosis,
    studyPrescription,
    sessionComparison,
    trends,
    nextSession,
    flashcardSummary,
    repeatedMistakes,
    repeatedPatterns,
    improvingTopics,
    flashcardsData,
    flashcardMastery,
  }
}

function _buildSessions(rawHistory, lastPractice, lastCoach) {
  const sessions = [...rawHistory]
  const timestamps = new Set(sessions.map(s => s.completedAt))

  if (lastPractice && lastPractice.completedAt && !timestamps.has(lastPractice.completedAt)) {
    sessions.push({ ...lastPractice, mode: lastPractice.mode || 'practice' })
    timestamps.add(lastPractice.completedAt)
  }

  if (lastCoach && lastCoach.completedAt && !timestamps.has(lastCoach.completedAt)) {
    // eslint-disable-next-line no-unused-vars
    const { flashcards: _f, weakSpotReport: _w, ...coachCore } = lastCoach
    sessions.push({ ...coachCore, mode: 'coach' })
  }

  return sessions.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
}

function _computeOverview(sessions) {
  const totalSessions = sessions.length
  const totalQuestions = sessions.reduce((sum, s) => sum + (s.total || 0), 0)
  const totalCorrect = sessions.reduce((sum, s) => sum + (s.correct || 0), 0)
  const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0

  const scores = sessions.filter(s => s.medicaScore != null).map(s => s.medicaScore)
  const avgMedicaScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  const latest = sessions[0]
  const latestMedicaScore = latest?.medicaScore ?? 0
  const latestReadiness = latest?.readinessLabel ?? 'N/A'

  const practiceSessions = sessions.filter(s => s.mode === 'practice')
  const coachSessions    = sessions.filter(s => s.mode === 'coach')
  const examSessions     = sessions.filter(s => s.mode === 'exam')

  const _acc = (arr) => {
    const c = arr.reduce((sum, s) => sum + (s.correct || 0), 0)
    const t = arr.reduce((sum, s) => sum + (s.total || 0), 0)
    return t > 0 ? Math.round((c / t) * 100) : null
  }

  return {
    totalSessions,
    totalQuestions,
    totalCorrect,
    overallAccuracy,
    avgMedicaScore,
    latestMedicaScore,
    latestReadiness,
    practiceCount: practiceSessions.length,
    coachCount:    coachSessions.length,
    examCount:     examSessions.length,
    practiceAccuracy: _acc(practiceSessions),
    coachAccuracy:    _acc(coachSessions),
    examAccuracy:     _acc(examSessions),
  }
}

function _aggregateSubjects(sessions) {
  const map = {}
  for (const s of sessions) {
    for (const bd of (s.subjectBreakdown || [])) {
      const name = normalizeSubjectLabel(bd.name) || 'Unknown'
      if (!map[name]) map[name] = { correct: 0, total: 0 }
      map[name].correct += bd.correct
      map[name].total   += bd.total
    }
  }
  return Object.entries(map)
    .map(([name, d]) => ({
      name,
      correct: d.correct,
      total: d.total,
      percentage: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

function _aggregateSystems(sessions) {
  const map = {}
  for (const s of sessions) {
    for (const bd of (s.systemBreakdown || [])) {
      const name = normalizeSystemLabel(bd.name) || 'Unknown'
      if (!map[name]) map[name] = { correct: 0, total: 0 }
      map[name].correct += bd.correct
      map[name].total   += bd.total
    }
  }
  return Object.entries(map)
    .map(([name, d]) => ({
      name,
      correct: d.correct,
      total: d.total,
      percentage: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

function _aggregateNamedBreakdown(sessions, key) {
  const map = {}
  for (const s of sessions) {
    for (const bd of (s[key] || [])) {
      if (!bd?.name) continue
      if (!map[bd.name]) map[bd.name] = { correct: 0, total: 0 }
      map[bd.name].correct += bd.correct
      map[bd.name].total   += bd.total
    }
  }
  return Object.entries(map)
    .map(([name, d]) => ({
      name,
      correct: d.correct,
      total: d.total,
      percentage: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total)
}

function _aggregateTopics(sessions) {
  const map = {}
  for (const s of sessions) {
    for (const q of (s.missedQuestions || [])) {
      const rawTopic = q.topicGroup || q.canonicalTopic || q.topic || q.weakSpotCategory || null
      if (!rawTopic) continue
      const stripped = rawTopic.includes(' — ') ? rawTopic.split(' — ')[0].trim() : rawTopic
      const topic = normalizeTopicForAnalytics(stripped)
      if (!map[topic]) map[topic] = { name: topic, missed: 0 }
      map[topic].missed++
    }
  }
  return Object.values(map)
    .sort((a, b) => b.missed - a.missed)
}

function _detectWeaknesses(subjectBreakdown, systemBreakdown, topicBreakdown, usmleContentBreakdown = [], physicianTaskBreakdown = []) {
  const critical = []
  const moderate = []
  const mild = []

  const allAreas = [
    ...subjectBreakdown.filter(x => x.total >= 3).map(x => ({ ...x, category: 'Subject', type: 'subject' })),
    ...systemBreakdown.filter(x => x.total >= 3).map(x => ({ ...x, category: 'System', type: 'system' })),
    ...usmleContentBreakdown.filter(x => x.total >= 3).map(x => ({ ...x, category: 'USMLE Area', type: 'usmleContent' })),
    ...physicianTaskBreakdown.filter(x => x.total >= 3).map(x => ({ ...x, category: 'Physician Task', type: 'physicianTask' })),
  ]

  for (const a of allAreas) {
    if (a.percentage < 50)      critical.push(a)
    else if (a.percentage < 65) moderate.push(a)
    else if (a.percentage < 75) mild.push(a)
  }

  // Topic-level: miss-count-based only (no accuracy denominator available)
  const byTopic = (topicBreakdown || [])
    .filter(t => t.missed >= 3)
    .map(t => ({ name: t.name, missed: t.missed, category: 'Topic', type: 'topic' }))

  return { critical, moderate, mild, byTopic }
}

function _diagnoseMistakes(sessions) {
  const subjectMisses    = {}
  const systemMisses     = {}
  const subjectAttempted = {}
  const systemAttempted  = {}
  const questionInfo     = {}
  let totalMissed    = 0
  let totalAttempted = 0

  for (const s of sessions) {
    totalAttempted += (s.total || 0)
    for (const bd of (s.subjectBreakdown || [])) {
      const name = normalizeSubjectLabel(bd.name) || 'Unknown'
      subjectAttempted[name] = (subjectAttempted[name] || 0) + bd.total
    }
    for (const bd of (s.systemBreakdown || [])) {
      const name = normalizeSystemLabel(bd.name) || 'Unknown'
      systemAttempted[name] = (systemAttempted[name] || 0) + bd.total
    }
    for (const q of (s.missedQuestions || [])) {
      totalMissed++
      const subject = normalizeSubjectLabel(q.subject)
      const system = normalizeSystemLabel(q.system)
      if (subject) subjectMisses[subject] = (subjectMisses[subject] || 0) + 1
      if (system)  systemMisses[system]   = (systemMisses[system]   || 0) + 1
      if (q.id) {
        if (!questionInfo[q.id]) questionInfo[q.id] = { subject, system, count: 0 }
        questionInfo[q.id].count++
      }
    }
  }

  // Per-cluster repeated miss counts
  const subjectRepeatCounts = {}
  const systemRepeatCounts  = {}
  for (const info of Object.values(questionInfo)) {
    if (info.count >= 2) {
      if (info.subject) subjectRepeatCounts[info.subject] = (subjectRepeatCounts[info.subject] || 0) + 1
      if (info.system)  systemRepeatCounts[info.system]   = (systemRepeatCounts[info.system]   || 0) + 1
    }
  }
  const totalRepeated = Object.values(questionInfo).filter(i => i.count >= 2).length

  function clusterSeverity(name, missedCount, type) {
    const entry = type === 'subject'
      ? USMLE_STEP1_YIELD_MAP[name]
      : USMLE_SYSTEM_YIELD_MAP[name]
    const highYieldWeight = entry ? _usmleScore(entry.weight) : 50

    const attempted = type === 'subject'
      ? (subjectAttempted[name] || missedCount * 2)
      : (systemAttempted[name]  || missedCount * 2)
    const density         = attempted > 0 ? (missedCount / attempted) * 100 : 50
    const normalizedN     = Math.min(100, missedCount * 8)
    const easyMissPenalty = density > 55 ? 80 : density > 35 ? 55 : 30

    const repeats       = type === 'subject'
      ? (subjectRepeatCounts[name] || 0)
      : (systemRepeatCounts[name]  || 0)
    const repeatPenalty = Math.min(100, repeats * 25)

    let recentMisses = 0
    const half = Math.ceil(sessions.length / 2)
    for (let i = 0; i < half; i++) {
      for (const q of (sessions[i].missedQuestions || [])) {
        const area = type === 'subject'
          ? normalizeSubjectLabel(q.subject)
          : normalizeSystemLabel(q.system)
        if (area === name) recentMisses++
      }
    }
    const recentRatio   = missedCount > 0 ? recentMisses / missedCount : 0.5
    const recentPenalty = recentRatio >= 0.6 ? 75 : recentRatio >= 0.4 ? 50 : 20

    return Math.min(100, Math.round(
      normalizedN     * 0.35 +
      highYieldWeight * 0.25 +
      easyMissPenalty * 0.15 +
      repeatPenalty   * 0.10 +
      recentPenalty   * 0.10 +
      50              * 0.05
    ))
  }

  const topSubjects = Object.entries(subjectMisses)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => {
      const att     = subjectAttempted[name] || 0
      const density = att > 0 ? Math.round((count / att) * 100) : null
      return { name, count, density, severity: clusterSeverity(name, count, 'subject'), yieldWeight: USMLE_STEP1_YIELD_MAP[name]?.weight || 1.0 }
    })

  const topSystems = Object.entries(systemMisses)
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, count]) => {
      const att     = systemAttempted[name] || 0
      const density = att > 0 ? Math.round((count / att) * 100) : null
      return { name, count, density, severity: clusterSeverity(name, count, 'system'), yieldWeight: USMLE_SYSTEM_YIELD_MAP[name]?.weight || 1.0 }
    })

  const topClusterCount  = Math.max(topSubjects[0]?.count || 0, topSystems[0]?.count || 0)
  const concentrationType = totalMissed > 0 && topClusterCount / totalMissed >= 0.35
    ? 'concentrated' : 'distributed'
  const dataConfidence   = totalMissed < 5 ? 'low' : totalMissed < 20 ? 'medium' : 'high'
  const maxSeverity      = Math.max(topSubjects[0]?.severity || 0, topSystems[0]?.severity || 0)
  const riskLevel        = maxSeverity >= 70 ? 'critical' : maxSeverity >= 50 ? 'high' : maxSeverity >= 30 ? 'moderate' : 'low'

  const overallAccuracy = totalAttempted > 0
    ? Math.round(((totalAttempted - totalMissed) / totalAttempted) * 100) : 0
  const retentionRatio  = totalMissed > 0 ? totalRepeated / totalMissed : 0

  let primaryFailureMode
  if (totalMissed < 5) {
    primaryFailureMode = { type: 'low-exposure', label: 'Low Exposure',
      description: 'Not enough mistakes recorded to identify a pattern. Complete more sessions for targeted analysis.' }
  } else if (retentionRatio >= 0.25) {
    primaryFailureMode = { type: 'retention', label: 'Retention Decay',
      description: 'Repeated misses on the same questions signal material is not consolidating. Apply spaced review and active recall to break the pattern.' }
  } else if (concentrationType === 'concentrated') {
    primaryFailureMode = { type: 'knowledge-gap', label: 'Mechanism Gap',
      description: 'Errors cluster in one area — a targeted knowledge gap, not a broad weakness. Focused drilling will resolve this quickly.' }
  } else if (overallAccuracy >= 75 && totalMissed >= 5) {
    primaryFailureMode = { type: 'blind-spots', label: 'Recognition Gaps',
      description: 'Strong overall accuracy with specific unexpected miss clusters. Short targeted review is the highest-leverage fix.' }
  } else {
    primaryFailureMode = { type: 'knowledge-gap', label: 'Foundational Gaps',
      description: 'Errors spread across multiple subjects indicate foundational instability. Systematic subject-by-subject review will have the highest return.' }
  }

  const mixColors  = ['var(--red)', 'var(--orange)', 'var(--purple)', 'var(--blue)']
  const topMixRaw  = Object.entries(subjectMisses).sort((a, b) => b[1] - a[1]).slice(0, 4)
  const otherCount = totalMissed - topMixRaw.reduce((s, [, c]) => s + c, 0)
  const mistakeMix = topMixRaw.map(([label, count], i) => ({
    label, count, pct: totalMissed > 0 ? Math.round((count / totalMissed) * 100) : 0, color: mixColors[i],
  }))
  if (otherCount > 0) {
    mistakeMix.push({ label: 'Other', count: otherCount, pct: totalMissed > 0 ? Math.round((otherCount / totalMissed) * 100) : 0, color: 'var(--t4)' })
  }

  const hiddenMistakeCount = Object.values(questionInfo)
    .filter(i => i.count >= 2).reduce((s, i) => s + (i.count - 1), 0)

  const diagnosticInsights = []
  if (topSubjects[0]) {
    const entry = USMLE_STEP1_YIELD_MAP[topSubjects[0].name]
    diagnosticInsights.push(entry
      ? `${topSubjects[0].name} is a high-yield Step 1 discipline — ${entry.reason}`
      : `${topSubjects[0].name} is your most-missed subject with ${topSubjects[0].count} errors.`)
  }
  if (topSystems[0]) {
    const entry = USMLE_SYSTEM_YIELD_MAP[topSystems[0].name]
    diagnosticInsights.push(entry
      ? `${topSystems[0].name}: ${entry.testedAs}`
      : `${topSystems[0].name} is your most-missed system with ${topSystems[0].count} errors.`)
  }
  if (totalRepeated >= 2) {
    diagnosticInsights.push(`${totalRepeated} question${totalRepeated > 1 ? 's' : ''} missed more than once — retrieval instability confirmed. These are your highest-priority spaced review targets.`)
  }
  if (concentrationType === 'concentrated' && totalMissed > 0) {
    diagnosticInsights.push(`${Math.round((topClusterCount / totalMissed) * 100)}% of errors come from one cluster — fixing this area alone could significantly move your score.`)
  }

  const recommendedFixes = []
  if (primaryFailureMode.type === 'retention') {
    recommendedFixes.push('Use focused concept flashcards with spaced repetition for weak knowledge points.')
    recommendedFixes.push('Re-attempt related questions in your next Coach session to test transfer and recall.')
  }
  if (topSubjects[0]) {
    recommendedFixes.push(`Schedule a focused ${topSubjects[0].name} block — 20 targeted questions in Coach mode.`)
  }
  if (topSystems[0] && recommendedFixes.length < 3) {
    recommendedFixes.push(`Run a ${topSystems[0].name} system review — connect mechanism to clinical vignette.`)
  }
  if (recommendedFixes.length === 0) {
    recommendedFixes.push('Complete more sessions to unlock specific targeted recommendations.')
  }

  // Backward-compatible patterns field
  const patterns = []
  if (topSubjects[0]?.count >= 2) {
    patterns.push(`${topSubjects[0].name} is the primary miss cluster — review the core mechanism before your next session.`)
  }
  if (topSystems[0]?.count >= 2) {
    patterns.push(`${topSystems[0].name} is a recurring miss pattern — system-level review is the highest-leverage fix.`)
  }
  if (patterns.length === 0) {
    patterns.push('No consistent error patterns detected yet. Keep practicing to build a full picture.')
  }

  return {
    totalMissed, totalAttempted, riskLevel, dataConfidence,
    concentrationType, hiddenMistakeCount, primaryFailureMode,
    mistakeMix, topSubjects, topSystems,
    diagnosticInsights, recommendedFixes, patterns,
  }
}

function _usmleScore(raw) {
  // Map weight range 0.75–1.35 → 0–100
  return Math.min(100, Math.max(0, ((raw || 1.0) - 0.75) / 0.60 * 100))
}

function _computePriorityScore(percentage, total, disciplineWeight, systemWeight) {
  const weakness    = Math.max(0, 100 - percentage)
  const discYield   = _usmleScore(disciplineWeight)
  const sysYield    = _usmleScore(systemWeight)
  const depth       = Math.min(100, (total || 5) * 4)   // more attempts = more reliable signal
  const diffPenalty = percentage < 50 ? 80 : percentage < 65 ? 55 : 28

  return Math.min(100, Math.round(
    weakness    * 0.30 +
    discYield   * 0.20 +
    sysYield    * 0.10 +
    depth       * 0.12 +
    diffPenalty * 0.10 +
    50          * 0.08 +   // trendPenalty — neutral (no per-session trend data)
    depth       * 0.05 +   // consistencyPenalty proxy
    50          * 0.03 +   // timingPenalty — neutral
    50          * 0.02     // confidenceMismatch — neutral
  ))
}

function _prescribeStudy(weaknesses, overview) {
  const allWeakAreas = [
    ...weaknesses.critical.map(w => ({ ...w, _tier: 'critical' })),
    ...weaknesses.moderate.map(w => ({ ...w, _tier: 'moderate' })),
    ...weaknesses.mild.map(w => ({ ...w, _tier: 'mild' })),
  ]

  const items = allWeakAreas.map(w => {
    const isSubject = w.type === 'subject'
    const isSystem = w.type === 'system'
    const isUsmleContent = w.type === 'usmleContent'
    const isPhysicianTask = w.type === 'physicianTask'
    const discEntry = isSubject ? USMLE_STEP1_YIELD_MAP[w.name] : null
    const sysEntry  = isSystem ? USMLE_SYSTEM_YIELD_MAP[w.name] : null
    const contentEntry = isUsmleContent ? USMLE_CONTENT_YIELD_MAP[w.name] : null
    const taskEntry = isPhysicianTask ? PHYSICIAN_TASK_YIELD_MAP[w.name] : null

    const priorityScore = _computePriorityScore(
      w.percentage, w.total,
      discEntry?.weight || taskEntry?.weight,
      sysEntry?.weight || contentEntry?.weight
    )
    const priority = priorityScore >= 75 ? 1 : priorityScore >= 55 ? 2 : 3

    const action = w._tier === 'critical'
      ? `${w.name}: ${w.percentage}% accuracy. Immediate targeted drilling required.`
      : w._tier === 'moderate'
        ? `${w.name}: ${w.percentage}% accuracy. Focused practice should bring this above 70%.`
        : `${w.name}: ${w.percentage}% accuracy. One focused block should stabilize this.`

    return {
      // backward-compatible
      priority,
      label: priority === 1 ? 'Critical' : priority === 2 ? 'Moderate' : 'Mild',
      area: `${w.category}: ${w.name}`,
      action,
      // enriched
      topic: w.name,
      discipline: isSubject ? w.name : null,
      system: isSystem ? w.name : null,
      usmleContentArea: isUsmleContent ? w.name : null,
      physicianTask: isPhysicianTask ? w.name : null,
      accuracy: w.percentage,
      priorityScore,
      usmleImportance: {
        disciplineWeight: discEntry?.weight || taskEntry?.weight || 1.0,
        systemWeight:     sysEntry?.weight || contentEntry?.weight || 1.0,
        reason: discEntry?.reason || sysEntry?.reason || contentEntry?.testedAs || taskEntry?.testedAs
          || `${w.category} performance affects multiple Step 1 question domains.`,
        testedAs: sysEntry?.testedAs || contentEntry?.testedAs || taskEntry?.testedAs
          || 'Mechanisms, pathophysiology, clinical vignettes, and pharmacology.',
        medicaRationale: `Improving ${w.name} from ${w.percentage}% to 70%+ can meaningfully increase your Step 1 readiness score.`,
      },
    }
  })

  // Sort by USMLE-weighted priority score (highest impact first)
  items.sort((a, b) => b.priorityScore - a.priorityScore)

  if (items.length === 0) {
    if (overview.overallAccuracy >= 75) {
      items.push({
        priority: 2, label: 'Next Step', area: 'Difficulty',
        action: 'Strong overall performance. Push to NBME Difficult or UWorld Challenge level questions.',
        topic: 'Difficulty Level',
        priorityScore: 68,
        usmleImportance: {
          disciplineWeight: 1.0, systemWeight: 1.0,
          reason: 'Increasing question difficulty is the key lever for high scorers to maximize exam performance.',
          testedAs: 'Hard-level NBME-style vignettes across all disciplines.',
          medicaRationale: 'Challenge yourself with harder questions to maximize exam readiness.',
        },
      })
    } else {
      items.push({
        priority: 2, label: 'General', area: 'Mixed Practice',
        action: 'Continue mixed practice sessions to build a broad foundation before targeted work.',
        topic: 'Mixed Practice',
        priorityScore: 55,
        usmleImportance: {
          disciplineWeight: 1.0, systemWeight: 1.0,
          reason: 'Broad coverage builds the integrated reasoning required for Step 1 clinical vignettes.',
          testedAs: 'Integrated clinical vignettes across all disciplines.',
          medicaRationale: 'Complete more sessions to unlock specific targeted recommendations.',
        },
      })
    }
  }

  return items
}

function _compareSessions(sessions) {
  if (sessions.length < 2) return { available: false }
  const [latest, previous] = sessions
  return {
    available: true,
    latest: {
      mode: latest.mode,
      accuracy: latest.percentage || 0,
      medicaScore: latest.medicaScore || 0,
      total: latest.total || 0,
      completedAt: latest.completedAt,
    },
    previous: {
      mode: previous.mode,
      accuracy: previous.percentage || 0,
      medicaScore: previous.medicaScore || 0,
      total: previous.total || 0,
      completedAt: previous.completedAt,
    },
    deltaAccuracy:    (latest.percentage   || 0) - (previous.percentage   || 0),
    deltaMedicaScore: (latest.medicaScore  || 0) - (previous.medicaScore  || 0),
  }
}

function _computeTrends(sessions) {
  return sessions.slice(0, 10).reverse().map((s, i) => ({
    index: i + 1,
    mode: s.mode,
    accuracy: s.percentage || 0,
    medicaScore: s.medicaScore || 0,
    completedAt: s.completedAt,
  }))
}

function _recommendNextSession(weaknesses, overview, topicBreakdown, flashcardWeakConcepts = []) {
  let mode = 'practice'
  if (weaknesses.critical.length > 0) {
    mode = 'coach'
  } else if (overview.coachCount === 0 && overview.totalSessions >= 2) {
    mode = 'coach'
  }

  let area = null
  let difficulty = 'Balanced'
  let subject = null
  let system = null

  if (weaknesses.critical[0]) {
    area = weaknesses.critical[0].name
    difficulty = 'Balanced'
    if (weaknesses.critical[0].type === 'subject') subject = weaknesses.critical[0].name
    else system = weaknesses.critical[0].name
  } else if (weaknesses.moderate[0]) {
    area = weaknesses.moderate[0].name
    difficulty = 'More Hard'
    if (weaknesses.moderate[0].type === 'subject') subject = weaknesses.moderate[0].name
    else system = weaknesses.moderate[0].name
  } else if (flashcardWeakConcepts[0]) {
    area = flashcardWeakConcepts[0].concept
    difficulty = 'Balanced'
    mode = 'coach'
    subject = flashcardWeakConcepts[0].subject || null
    system = flashcardWeakConcepts[0].system || null
  } else if (overview.overallAccuracy >= 75) {
    difficulty = 'NBME Difficult'
  }

  let reasoning = 'Continue mixed practice to build coverage breadth. Review every missed question before the next session.'
  if (weaknesses.critical[0]) {
    reasoning = `${weaknesses.critical[0].name} is your most critical weakness at ${weaknesses.critical[0].percentage}%. Coach Mode with targeted explanations will accelerate improvement.`
  } else if (weaknesses.moderate[0]) {
    reasoning = `${weaknesses.moderate[0].name} needs attention at ${weaknesses.moderate[0].percentage}%. A focused practice block will push this above 70%.`
  } else if (flashcardWeakConcepts[0]) {
    reasoning = `${flashcardWeakConcepts[0].concept} is unstable in flashcard review. Run a targeted Coach block to convert recall into question performance.`
  } else if (overview.overallAccuracy >= 75) {
    reasoning = 'Strong overall performance. Increase the challenge with harder questions to keep building toward Step 1 readiness.'
  }

  const topTopic = flashcardWeakConcepts[0]?.topic
    || ((topicBreakdown && topicBreakdown.length > 0) ? topicBreakdown[0].name : null)
  return { mode, area, difficulty, reasoning, subject, system, topic: topTopic, questionCount: 20 }
}

function _buildFlashcardSummary(sessions) {
  const map = {}
  for (const s of sessions) {
    for (const q of (s.missedQuestions || [])) {
      const rawTopic = q.topicGroup || q.canonicalTopic || q.topic || q.weakSpotCategory || null
      if (!rawTopic) continue
      const stripped = rawTopic.includes(' — ') ? rawTopic.split(' — ')[0].trim() : rawTopic
      const topic = normalizeTopicForAnalytics(stripped)
      map[topic] = (map[topic] || 0) + 1
    }
  }
  const topics = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => ({ topic, count }))
  const totalMissed = topics.reduce((sum, t) => sum + t.count, 0)
  return { topics, totalMissed }
}

function _detectRepeatedMistakes(sessions) {
  const counts = {}
  const info = {}
  for (const s of sessions) {
    for (const q of (s.missedQuestions || [])) {
      if (!q.id) continue
      counts[q.id] = (counts[q.id] || 0) + 1
      if (!info[q.id]) info[q.id] = {
        subject: normalizeSubjectLabel(q.subject) || '',
        system: normalizeSystemLabel(q.system) || '',
      }
    }
  }
  return Object.entries(counts)
    .filter(([, c]) => c >= 2)
    .map(([id, count]) => ({ id, count, ...info[id] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
}

function _detectRepeatedPatterns(sessions) {
  const conceptCounts = {}
  const weakspotCounts = {}
  const topicCounts = {}

  for (const s of sessions) {
    for (const q of (s.missedQuestions || [])) {
      if (q.testedConcept) {
        conceptCounts[q.testedConcept] = (conceptCounts[q.testedConcept] || 0) + 1
      }
      if (q.weakSpotCategory) {
        weakspotCounts[q.weakSpotCategory] = (weakspotCounts[q.weakSpotCategory] || 0) + 1
      }
      const raw = q.canonicalTopic || q.rawTopic || q.topic || null
      if (raw) {
        const stripped = raw.includes(' — ') ? raw.split(' — ')[0].trim() : raw
        const key = normalizeTopicForAnalytics(stripped)
        topicCounts[key] = (topicCounts[key] || 0) + 1
      }
    }
  }

  const patterns = []
  for (const [name, count] of Object.entries(conceptCounts)) {
    if (count >= 2) patterns.push({ type: 'concept', name, count })
  }
  for (const [name, count] of Object.entries(weakspotCounts)) {
    if (count >= 3) patterns.push({ type: 'category', name, count })
  }
  for (const [name, count] of Object.entries(topicCounts)) {
    if (count >= 2) patterns.push({ type: 'topic', name, count })
  }

  return patterns.sort((a, b) => b.count - a.count).slice(0, 10)
}

function _detectImprovingTopics(sessions) {
  if (sessions.length < 2) return []
  const mid = Math.ceil(sessions.length / 2)
  const recent = sessions.slice(0, mid)
  const older  = sessions.slice(mid)

  const _agg = (arr) => {
    const map = {}
    for (const s of arr) {
      for (const bd of [...(s.subjectBreakdown || []), ...(s.systemBreakdown || [])]) {
        const name = (s.subjectBreakdown || []).includes(bd)
          ? normalizeSubjectLabel(bd.name)
          : normalizeSystemLabel(bd.name)
        if (!name) continue
        if (!map[name]) map[name] = { correct: 0, total: 0 }
        map[name].correct += bd.correct
        map[name].total   += bd.total
      }
    }
    return map
  }

  const recentMap = _agg(recent)
  const olderMap  = _agg(older)

  const improving = []
  for (const [name, r] of Object.entries(recentMap)) {
    const o = olderMap[name]
    if (!o || o.total < 2 || r.total < 2) continue
    const rPct = Math.round((r.correct / r.total) * 100)
    const oPct = Math.round((o.correct / o.total) * 100)
    if (rPct - oPct >= 10) improving.push({ name, recent: rPct, older: oPct, delta: rPct - oPct })
  }

  return improving.sort((a, b) => b.delta - a.delta).slice(0, 5)
}

function _buildFlashcardsData(flashcards) {
  const due = flashcards.filter(c => c.reviewStatus === 'new' || c.reviewStatus === 'learning').length
  const mastered = flashcards.filter(c => c.reviewStatus === 'mastered').length
  return { total: flashcards.length, due, mastered }
}

function _buildFlashcardMastery(events) {
  const map = {}
  for (const e of events || []) {
    const concept = e.concept || e.topic
    if (!concept) continue
    if (!map[concept]) {
      map[concept] = {
        concept,
        topic: e.topic || concept,
        subject: normalizeSubjectLabel(e.subject) || e.subject || null,
        system: normalizeSystemLabel(e.system) || e.system || null,
        reviews: 0,
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
        lastReviewedAt: e.reviewedAt || null,
      }
    }
    const item = map[concept]
    item.reviews += 1
    if (['again', 'hard', 'good', 'easy'].includes(e.ease)) item[e.ease] += 1
    if (e.reviewedAt && (!item.lastReviewedAt || new Date(e.reviewedAt) > new Date(item.lastReviewedAt))) {
      item.lastReviewedAt = e.reviewedAt
    }
  }

  const concepts = Object.values(map).map(item => {
    const unstable = item.again + item.hard
    const stable = item.good + item.easy
    const retentionScore = item.reviews > 0 ? Math.round((stable / item.reviews) * 100) : 0
    const instabilityScore = item.reviews > 0 ? Math.round((unstable / item.reviews) * 100) : 0
    return {
      ...item,
      retentionScore,
      instabilityScore,
      status: retentionScore >= 75 ? 'stable' : retentionScore >= 50 ? 'watch' : 'unstable',
    }
  }).sort((a, b) => {
    if (b.instabilityScore !== a.instabilityScore) return b.instabilityScore - a.instabilityScore
    return b.reviews - a.reviews
  })

  const weakConcepts = concepts
    .filter(c => c.reviews >= 2 && c.instabilityScore >= 50)
    .slice(0, 5)

  return {
    totalReviews: (events || []).length,
    concepts,
    weakConcepts,
  }
}

function _computeStreak(sessions) {
  if (sessions.length === 0) return 0
  const days = new Set(
    sessions.map(s => s.completedAt ? s.completedAt.slice(0, 10) : null).filter(Boolean)
  )
  const today = new Date().toISOString().slice(0, 10)
  let streak = 0
  let d = new Date(today)
  while (days.has(d.toISOString().slice(0, 10))) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}
