import { describe, expect, it } from 'vitest'
import {
  isEmptySelection,
  isQuestionInScope,
  normalizeGenerationConfig,
  resolveGenerationScope,
} from './generationScope.js'

function scopeFor(config) {
  return resolveGenerationScope(normalizeGenerationConfig(config))
}

describe('generationScope - scope priority and normalization', () => {
  it('treats default dropdown labels as empty selections', () => {
    expect(isEmptySelection('All Subjects')).toBe(true)
    expect(isEmptySelection('All Systems')).toBe(true)
    expect(isEmptySelection('Mixed')).toBe(true)
    expect(isEmptySelection('General')).toBe(true)
    expect(isEmptySelection('')).toBe(true)
  })

  it('clinicalFocus overrides rawTopic, topic, system, and subject', () => {
    const scope = scopeFor({
      clinicalFocus: 'heart failure mechanism',
      rawTopic: 'loop diuretics',
      topic: 'ACE inhibitors',
      system: 'Renal',
      subject: 'Pharmacology',
    })

    expect(scope.scopeType).toBe('clinicalFocus')
    expect(scope.scopeText).toBe('heart failure mechanism')
    expect(scope.system).toBe('Renal / Urinary')
    expect(scope.subject).toBe('Pharmacology')
  })

  it('rawTopic overrides selected topic', () => {
    const scope = scopeFor({
      rawTopic: 'loop diuretics',
      topic: 'ACE inhibitors',
      system: 'Cardiovascular',
      subject: 'Pharmacology',
    })

    expect(scope.scopeType).toBe('manualTopic')
    expect(scope.scopeText).toBe('loop diuretics')
  })

  it('topic overrides system and subject', () => {
    const scope = scopeFor({
      topic: 'ACE inhibitors',
      system: 'Renal',
      subject: 'Pharmacology',
    })

    expect(scope.scopeType).toBe('selectedTopic')
    expect(scope.scopeText).toBe('ACE inhibitors')
    expect(scope.system).toBe('Renal / Urinary')
  })

  it('normalizes subject and system aliases', () => {
    expect(scopeFor({ system: 'Skin' })).toMatchObject({
      scopeType: 'system',
      scopeText: 'Dermatology',
      system: 'Dermatology',
    })

    expect(scopeFor({ system: 'Nephrology' })).toMatchObject({
      scopeType: 'system',
      scopeText: 'Renal / Urinary',
      system: 'Renal / Urinary',
    })

    expect(scopeFor({ subject: 'Neuroscience' })).toMatchObject({
      scopeType: 'subject',
      scopeText: 'Neurology',
      subject: 'Neurology',
    })
  })

  it('falls back to global scope when selectors are empty', () => {
    const scope = scopeFor({
      subject: 'All Subjects',
      system: 'All Systems',
      topic: '',
    })

    expect(scope.scopeType).toBe('global')
    expect(scope.scopeText).toBe('Mixed USMLE Step 1')
  })
})

describe('generationScope - topic scope matching', () => {
  it('matches specific topics against topic and concept fields', () => {
    const scope = scopeFor({ topic: 'loop diuretics' })

    expect(isQuestionInScope({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      topic: 'Loop Diuretics',
      testedConcept: 'NKCC2 inhibition',
    }, scope)).toBe(true)
  })

  it('does not treat a broad subject label in topic as a subject-bank selector', () => {
    const scope = scopeFor({ topic: 'Pharmacology' })

    expect(isQuestionInScope({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      topic: 'Renal Pharmacology',
      testedConcept: 'NKCC2 inhibition',
    }, scope)).toBe(false)
  })

  it('does not treat a broad system label in topic as a system-bank selector', () => {
    const scope = scopeFor({ topic: 'Cardiovascular' })

    expect(isQuestionInScope({
      subject: 'Pathology',
      system: 'Cardiovascular',
      topic: 'Cardiovascular Pathology',
      testedConcept: 'foam cells',
    }, scope)).toBe(false)
  })

  it('does not treat system aliases in topic as system-bank selectors', () => {
    const scope = scopeFor({ topic: 'Cardiovascular System' })

    expect(isQuestionInScope({
      subject: 'Physiology',
      system: 'Cardiovascular',
      topic: 'Cardiovascular Physiology',
      testedConcept: 'cardiac output',
    }, scope)).toBe(false)
  })
})
