import { describe, expect, it } from 'vitest'
import {
  buildQuestionBankCoverageReport,
  COVERAGE_STATUS,
  getCoverageStatus,
} from './questionBankCoverage.js'

describe('questionBankCoverage', () => {
  it('classifies counts into Zero, Gap, Watch, and Good', () => {
    expect(getCoverageStatus(0)).toBe(COVERAGE_STATUS.ZERO)
    expect(getCoverageStatus(1)).toBe(COVERAGE_STATUS.GAP)
    expect(getCoverageStatus(5)).toBe(COVERAGE_STATUS.WATCH)
    expect(getCoverageStatus(10)).toBe(COVERAGE_STATUS.GOOD)
  })

  it('reports canonical subject, system, and pair zeroes even when labels are absent from the bank', () => {
    const questions = [
      { id: 'q1', subject: 'Pathology', system: 'Cardiovascular' },
      { id: 'q2', subject: 'Pathology', system: 'Cardiovascular' },
      { id: 'q3', subject: 'Pharmacology', system: 'Renal / Urinary' },
    ]

    const report = buildQuestionBankCoverageReport(questions, {
      subjects: ['Pathology', 'Pharmacology', 'Genetics'],
      systems: ['Cardiovascular', 'Renal / Urinary', 'Dermatology'],
      highYieldPairs: [['Pathology', 'Cardiovascular']],
      targetLimit: 5,
    })

    expect(report.subjects.find(row => row.subject === 'Genetics')).toMatchObject({
      count: 0,
      status: COVERAGE_STATUS.ZERO,
    })
    expect(report.systems.find(row => row.system === 'Dermatology')).toMatchObject({
      count: 0,
      status: COVERAGE_STATUS.ZERO,
    })
    expect(report.pairs.find(row => row.subject === 'Genetics' && row.system === 'Dermatology')).toMatchObject({
      count: 0,
      status: COVERAGE_STATUS.ZERO,
    })
    expect(report.highYieldPairs[0]).toMatchObject({
      subject: 'Pathology',
      system: 'Cardiovascular',
      count: 2,
      status: COVERAGE_STATUS.GAP,
    })
  })
})
