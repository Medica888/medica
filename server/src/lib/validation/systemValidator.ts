import { isBroadTaxonomyValue, normalizeSystem } from '../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from './validationTypes.js';

export function validateSystem(
  question: ValidationQuestion,
  expectedSystem?: string,
): ValidatorResult {
  const expected = normalizeSystem(expectedSystem);
  const rawActual = String(question.system || '').trim();
  const detected = normalizeSystem(rawActual);

  if (expected) {
    if (!rawActual) {
      return {
        name: 'system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected,
        detected: '',
        confidence: 1,
        reasons: ['missing_system'],
      };
    }
    if (!detected) {
      return {
        name: 'system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected,
        detected: rawActual,
        confidence: 0.6,
        reasons: ['unknown_system'],
      };
    }
    if (detected !== expected) {
      return {
        name: 'system',
        status: 'fail',
        blocking: true,
        score: 0,
        expected,
        detected,
        confidence: 1,
        reasons: ['system_mismatch'],
      };
    }
    return {
      name: 'system',
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
      name: 'system',
      status: 'warn',
      blocking: false,
      score: 70,
      expected: '',
      detected: '',
      confidence: 0.4,
      reasons: ['system_not_declared'],
    };
  }

  if (!detected) {
    return {
      name: 'system',
      status: 'fail',
      blocking: true,
      score: 0,
      expected: '',
      detected: rawActual,
      confidence: 0.6,
      reasons: ['unknown_system'],
    };
  }

  return {
    name: 'system',
    status: 'pass',
    blocking: false,
    score: 100,
    expected: '',
    detected,
    confidence: 1,
    reasons: [],
  };
}
