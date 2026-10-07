import { describe, it, expect } from 'vitest'
import {
  MODE_FEATURES,
  STANDARDIZED_40Q_BLOCK,
  STANDARDIZED_STEP1_BLOCK,
  getExamDurationSeconds,
  getModeFeatures,
} from './quizTypes'

describe('getModeFeatures', () => {
  it('returns the default exam features for a custom exam set', () => {
    expect(getModeFeatures({ mode: 'exam' })).toEqual(MODE_FEATURES.exam)
  })

  it('replaces the exam pace with the Step 1 block pace', () => {
    const features = getModeFeatures({ mode: 'exam', blockType: STANDARDIZED_STEP1_BLOCK })
    expect(features).toContain('1.5 minutes / question')
    expect(features).not.toContain('1 minute / question')
    expect(features).toHaveLength(MODE_FEATURES.exam.length)
  })

  it('returns an empty list for an unknown mode', () => {
    expect(getModeFeatures({ mode: 'bogus' })).toEqual([])
  })
})

describe('getExamDurationSeconds', () => {
  it('gives one minute per question for custom sets', () => {
    expect(getExamDurationSeconds({ mode: 'exam' }, 10)).toBe(600)
  })

  it('gives the fixed 30-minute block for Step 1 blocks, including the legacy block type', () => {
    expect(getExamDurationSeconds({ blockType: STANDARDIZED_STEP1_BLOCK }, 20)).toBe(1800)
    expect(getExamDurationSeconds({ blockType: STANDARDIZED_40Q_BLOCK }, 40)).toBe(1800)
  })
})
