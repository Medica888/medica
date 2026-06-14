import { SUBJECTS, SYSTEMS } from './quizTypes.js'

export const COVERAGE_STATUS = {
  GOOD: 'Good',
  WATCH: 'Watch',
  GAP: 'Gap',
  ZERO: 'Zero',
}

export const HIGH_YIELD_PAIRS = [
  ['Pharmacology', 'Cardiovascular'],
  ['Pathology', 'Cardiovascular'],
  ['Physiology', 'Renal / Urinary'],
  ['Pharmacology', 'Renal / Urinary'],
  ['Pathology', 'Oncology'],
  ['Pathology', 'Hematology'],
  ['Microbiology', 'Infectious Disease'],
  ['Immunology', 'Immunology'],
  ['Physiology', 'Respiratory'],
  ['Pathology', 'Gastrointestinal'],
  ['Pharmacology', 'Endocrine'],
  ['Pathology', 'Neurology'],
]

export function getCoverageStatus(count) {
  if (count === 0) return COVERAGE_STATUS.ZERO
  if (count < 5) return COVERAGE_STATUS.GAP
  if (count < 10) return COVERAGE_STATUS.WATCH
  return COVERAGE_STATUS.GOOD
}

export function buildQuestionBankCoverageReport(questions, options = {}) {
  const subjects = options.subjects || SUBJECTS.filter(s => s !== 'All Subjects')
  const systems = options.systems || SYSTEMS.filter(s => s !== 'All Systems')
  const highYieldPairs = options.highYieldPairs || HIGH_YIELD_PAIRS

  const subjectRows = subjects.map(subject => {
    const count = questions.filter(q => q.subject === subject).length
    return { subject, count, status: getCoverageStatus(count) }
  })

  const systemRows = systems.map(system => {
    const count = questions.filter(q => q.system === system).length
    return { system, count, status: getCoverageStatus(count) }
  })

  const pairRows = []
  for (const subject of subjects) {
    for (const system of systems) {
      const count = questions.filter(q => q.subject === subject && q.system === system).length
      pairRows.push({ subject, system, count, status: getCoverageStatus(count) })
    }
  }

  const highYieldRows = highYieldPairs.map(([subject, system]) => {
    const count = questions.filter(q => q.subject === subject && q.system === system).length
    return { subject, system, count, status: getCoverageStatus(count) }
  })

  const nextTargets = pairRows
    .filter(row => row.status === COVERAGE_STATUS.ZERO || row.status === COVERAGE_STATUS.GAP)
    .sort((a, b) => {
      const aHigh = highYieldPairs.some(([s, y]) => s === a.subject && y === a.system) ? 0 : 1
      const bHigh = highYieldPairs.some(([s, y]) => s === b.subject && y === b.system) ? 0 : 1
      if (aHigh !== bHigh) return aHigh - bHigh
      if (a.count !== b.count) return a.count - b.count
      return `${a.subject} ${a.system}`.localeCompare(`${b.subject} ${b.system}`)
    })
    .slice(0, options.targetLimit || 20)

  return {
    totalQuestions: questions.length,
    subjects: subjectRows,
    systems: systemRows,
    pairs: pairRows,
    highYieldPairs: highYieldRows,
    summary: {
      subjectGood: subjectRows.filter(row => row.status === COVERAGE_STATUS.GOOD).length,
      subjectWatch: subjectRows.filter(row => row.status === COVERAGE_STATUS.WATCH).length,
      subjectGap: subjectRows.filter(row => row.status === COVERAGE_STATUS.GAP).length,
      subjectZero: subjectRows.filter(row => row.status === COVERAGE_STATUS.ZERO).length,
      systemGood: systemRows.filter(row => row.status === COVERAGE_STATUS.GOOD).length,
      systemWatch: systemRows.filter(row => row.status === COVERAGE_STATUS.WATCH).length,
      systemGap: systemRows.filter(row => row.status === COVERAGE_STATUS.GAP).length,
      systemZero: systemRows.filter(row => row.status === COVERAGE_STATUS.ZERO).length,
      pairGood: pairRows.filter(row => row.status === COVERAGE_STATUS.GOOD).length,
      pairWatch: pairRows.filter(row => row.status === COVERAGE_STATUS.WATCH).length,
      pairGap: pairRows.filter(row => row.status === COVERAGE_STATUS.GAP).length,
      pairZero: pairRows.filter(row => row.status === COVERAGE_STATUS.ZERO).length,
    },
    nextTargets,
  }
}

export function formatCoverageRows(rows, labelKeys) {
  return rows.map(row => {
    const label = labelKeys.map(key => row[key]).join(' + ')
    return `${String(row.count).padStart(3)} | ${row.status.padEnd(5)} | ${label}`
  })
}
