import { normalizeDifficulty } from '../medicaTaxonomy.js';
import { ENGINE_DEPTH_BANDS } from './difficultyBands.js';
import type { ValidationQuestion, ValidatorResult } from './validationTypes.js';

function optionText(q: ValidationQuestion): string {
  return (q.options || []).map(o => o.text).join(' ');
}

function reasoningDepth(q: ValidationQuestion): number {
  const stem = String(q.stem || '');
  const text = [stem, optionText(q), q.explanation || ''].join(' ').toLowerCase();
  let score = 0;
  if (stem.length >= 140) score += 20;
  if (stem.length >= 220) score += 15;
  if (/\b(lab|serum|urine|biopsy|ecg|ekg|ct|mri|x-ray|radiograph|vital|blood pressure|mmhg|mg\/dl|meq\/l|ph|paco2|hco3)\b/i.test(text)) score += 20;
  if (/\b(mechanism|pathophysiology|compensation|feedback|receptor|enzyme|transporter|mutation)\b/i.test(text)) score += 20;
  if (/\b(next step|most likely|best explains|which of the following)\b/i.test(text)) score += 10;
  if ((q.options || []).every(o => String(o.text || '').trim().length >= 12)) score += 10;
  if (String(q.explanation || '').length >= 250) score += 15;
  return Math.min(100, score);
}

function expectedBand(difficulty: string): { min: number; max: number } {
  return ENGINE_DEPTH_BANDS[difficulty] ?? ENGINE_DEPTH_BANDS['Balanced'];
}

export function validateDifficulty(
  question: ValidationQuestion,
  requestedDifficulty: string,
  allowWarn: boolean,
): ValidatorResult {
  const expected = normalizeDifficulty(requestedDifficulty);
  if (!expected) {
    return {
      name: 'difficulty',
      status: 'fail',
      blocking: true,
      score: 0,
      expected: requestedDifficulty,
      detected: '',
      confidence: 1,
      reasons: ['unknown_difficulty'],
    };
  }

  const depth = reasoningDepth(question);
  const band = expectedBand(expected);
  const tooEasyBy = band.min - depth;
  const tooHardBy = depth - band.max;
  const extreme = tooEasyBy >= 35 || tooHardBy >= 35;
  const mild = tooEasyBy > 0 || tooHardBy > 0;

  if (extreme) {
    return {
      name: 'difficulty',
      status: 'fail',
      blocking: true,
      score: 0,
      expected,
      detected: String(depth),
      confidence: 0.9,
      reasons: [tooEasyBy > 0 ? 'difficulty_extremely_too_easy' : 'difficulty_extremely_too_hard'],
    };
  }

  if (mild) {
    return {
      name: 'difficulty',
      status: 'warn',
      blocking: !allowWarn,
      score: 70,
      expected,
      detected: String(depth),
      confidence: 0.75,
      reasons: [tooEasyBy > 0 ? 'difficulty_slightly_too_easy' : 'difficulty_slightly_too_hard'],
    };
  }

  return {
    name: 'difficulty',
    status: 'pass',
    blocking: false,
    score: 100,
    expected,
    detected: String(depth),
    confidence: 0.8,
    reasons: [],
  };
}
