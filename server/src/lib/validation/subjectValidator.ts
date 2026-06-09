import { isBroadTaxonomyValue, normalizeSubject, normalizeSystem } from '../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from './validationTypes.js';

export function validateSubject(
  question: ValidationQuestion,
  expectedSubject?: string,
): ValidatorResult {
  const expected = normalizeSubject(expectedSubject);
  const rawActual = String(question.subject || '').trim();
  const detected = normalizeSubject(rawActual);
  const actualIsSystem = rawActual ? normalizeSystem(rawActual) !== null : false;

  if (expected) {
    if (!rawActual) {
      return {
        name: 'subject',
        status: 'fail',
        blocking: true,
        score: 0,
        expected,
        detected: '',
        confidence: 1,
        reasons: ['missing_subject'],
      };
    }
    if (!detected) {
      return {
        name: 'subject',
        status: 'fail',
        blocking: true,
        score: 0,
        expected,
        detected: rawActual,
        confidence: actualIsSystem ? 0.9 : 0.6,
        reasons: actualIsSystem ? ['subject_is_system_label'] : ['unknown_subject'],
      };
    }
    if (detected !== expected) {
      return {
        name: 'subject',
        status: 'fail',
        blocking: true,
        score: 0,
        expected,
        detected,
        confidence: 1,
        reasons: ['subject_mismatch'],
      };
    }
    return {
      name: 'subject',
      status: 'pass',
      blocking: false,
      score: 100,
      expected,
      detected,
      confidence: 1,
      reasons: [],
    };
  }

  if (!rawActual || isBroadTaxonomyValue(rawActual)) {
    return {
      name: 'subject',
      status: 'warn',
      blocking: false,
      score: 70,
      expected: '',
      detected: '',
      confidence: 0.4,
      reasons: ['subject_not_declared'],
    };
  }

  if (!detected) {
    return {
      name: 'subject',
      status: 'fail',
      blocking: true,
      score: 0,
      expected: '',
      detected: rawActual,
      confidence: actualIsSystem ? 0.9 : 0.6,
      reasons: actualIsSystem ? ['subject_is_system_label'] : ['unknown_subject'],
    };
  }

  return {
    name: 'subject',
    status: 'pass',
    blocking: false,
    score: 100,
    expected: '',
    detected,
    confidence: 1,
    reasons: [],
  };
}
