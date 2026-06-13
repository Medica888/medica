import { describe, expect, it } from 'vitest'
import {
  CANONICAL_SUBJECTS,
  CANONICAL_SYSTEMS,
  enrichQuestionWithUsmleTaxonomy,
  inferPhysicianTask,
  inferUsmleContentArea,
  normalizeQuestionTaxonomyFields,
  normalizeSubjectLabel,
  normalizeSystemLabel,
  normalizeUsmleContentArea,
} from './usmleTaxonomy.js'

describe('USMLE taxonomy mapping', () => {
  it('normalizes app system names to official content areas', () => {
    expect(normalizeUsmleContentArea('Renal / Urinary')).toBe('Renal & Urinary System')
    expect(normalizeUsmleContentArea('Neurology')).toBe('Nervous System & Special Senses')
    expect(normalizeUsmleContentArea('Biostatistics')).toBe('Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature')
  })

  it('normalizes subject aliases to one canonical label', () => {
    expect(normalizeSubjectLabel('Neuroscience')).toBe('Neurology')
    expect(normalizeSubjectLabel('Behavioral Health')).toBe('Behavioral Science')
    expect(normalizeSubjectLabel('Cardiology')).toBe('Cardiology')
    expect(CANONICAL_SUBJECTS).toContain('Neurology')
  })

  it('normalizes system aliases to one canonical label', () => {
    expect(normalizeSystemLabel('Cardiovascular System')).toBe('Cardiovascular')
    expect(normalizeSystemLabel('Nervous System & Special Senses')).toBe('Neurology')
    expect(normalizeSystemLabel('Skin')).toBe('Dermatology')
    expect(normalizeSystemLabel('Renal')).toBe('Renal / Urinary')
    expect(CANONICAL_SYSTEMS).toContain('Dermatology')
  })

  it('canonicalizes question subject and system without losing USMLE metadata', () => {
    const question = normalizeQuestionTaxonomyFields({
      subject: 'Neuroscience',
      system: 'Nervous System & Special Senses',
      usmleContentArea: 'cardiology',
      physicianTask: 'diagnosis',
    })

    expect(question.subject).toBe('Neurology')
    expect(question.system).toBe('Neurology')
    expect(question.usmleContentArea).toBe('Cardiovascular System')
    expect(question.physicianTask).toBe('Patient Care: Diagnosis')
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
