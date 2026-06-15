import type { ValidationQuestion, ValidatorResult } from '../validationTypes.js';

export function intentTextFor(question: ValidationQuestion): string {
  return [
    question.subject,
    question.system,
    question.topic,
    question.testedConcept,
    question.questionAngle,
    question.usmleContentArea,
    question.physicianTask,
    question.stem,
    answerSupport(question),
  ].filter(Boolean).join(' ');
}

export function answerSupport(question: ValidationQuestion): string {
  const correct = String(question.correct || '').trim().toUpperCase();
  const correctText = (question.options || []).find(o => o.letter === correct)?.text || '';
  const correctExplanation = question.optionExplanations?.[correct] || '';
  return [correctText, question.explanation, correctExplanation].filter(Boolean).join(' ');
}

export function pass(reason = 'no_specialty_contradiction'): ValidatorResult {
  return {
    name: 'specialty',
    status: 'pass',
    blocking: false,
    score: 100,
    confidence: 0.8,
    reasons: [reason],
  };
}

export function fail(expected: string, detected: string, reason: string): ValidatorResult {
  return {
    name: 'specialty',
    status: 'fail',
    blocking: true,
    score: 0,
    expected,
    detected,
    confidence: 0.92,
    reasons: [reason],
  };
}

export function warn(expected: string, detected: string, reason: string): ValidatorResult {
  return {
    name: 'specialty',
    status: 'warn',
    blocking: false,
    score: 75,
    expected,
    detected,
    confidence: 0.55,
    reasons: [reason],
  };
}

export function has(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

export function truncate(value: string | undefined, maxLength = 240): string {
  if (!value) return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function joinSummary(values: Array<string | undefined>, maxItemLength = 140, maxTotalLength = 600): string {
  const joined = values
    .filter(Boolean)
    .map(value => truncate(value, maxItemLength))
    .join(' | ');
  return truncate(joined, maxTotalLength);
}
