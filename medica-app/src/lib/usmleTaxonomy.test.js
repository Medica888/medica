import { describe, expect, it } from 'vitest'
import {
  enrichQuestionWithUsmleTaxonomy,
  inferPhysicianTask,
  inferUsmleContentArea,
  normalizeUsmleContentArea,
} from './usmleTaxonomy.js'

describe('USMLE taxonomy mapping', () => {
  it('normalizes app system names to official content areas', () => {
    expect(normalizeUsmleContentArea('Renal / Urinary')).toBe('Renal & Urinary System')
    expect(normalizeUsmleContentArea('Neurology')).toBe('Nervous System & Special Senses')
    expect(normalizeUsmleContentArea('Biostatistics')).toBe('Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature')
  })

  it('infers content area from question metadata and stem keywords', () => {
    expect(inferUsmleContentArea({ system: 'Cardiovascular' })).toBe('Cardiovascular System')
    expect(inferUsmleContentArea({
      stem: 'A patient has tinnitus after a medication that disrupts hearing.',
    })).toBe('Nervous System & Special Senses')
  })

  it('separates reproductive, pregnancy, and male reproductive content', () => {
    expect(inferUsmleContentArea({ system: 'Reproductive', stem: 'A pregnant patient develops preeclampsia.' }))
      .toBe('Pregnancy, Childbirth, & the Puerperium')
    expect(inferUsmleContentArea({ system: 'Reproductive', stem: 'A patient has prostate enlargement.' }))
      .toBe('Male and Transgender Reproductive System')
  })

  it('maps question angles to physician tasks', () => {
    expect(inferPhysicianTask({ questionAngle: 'lab-interpretation' }))
      .toBe('Patient Care: Laboratory and Diagnostic Studies')
    expect(inferPhysicianTask({ questionAngle: 'pharmacology' }))
      .toBe('Patient Care: Pharmacotherapy')
  })

  it('enriches questions without removing existing metadata', () => {
    const question = enrichQuestionWithUsmleTaxonomy({
      id: 'q1',
      system: 'Respiratory',
      questionAngle: 'diagnosis',
      testedConcept: 'COPD pulmonary hypertension',
    })

    expect(question.id).toBe('q1')
    expect(question.usmleContentArea).toBe('Respiratory System')
    expect(question.usmleSubdomain).toBe('COPD pulmonary hypertension')
    expect(question.physicianTask).toBe('Patient Care: Diagnosis')
  })
})
