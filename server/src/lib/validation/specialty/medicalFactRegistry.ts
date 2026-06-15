import type { ValidationQuestion, ValidatorResult } from '../validationTypes.js';
import type { MedicalFactRule } from './medicalFactRuleTypes.js';
import { biochemistryFactRules } from './facts/biochemistry.js';
import { cardiologyFactRules } from './facts/cardiology.js';
import { cardiovascularFactRules } from './facts/cardiovascular.js';
import { dermatologyFactRules } from './facts/dermatology.js';
import { endocrineFactRules } from './facts/endocrine.js';
import { gastroenterologyFactRules } from './facts/gastroenterology.js';
import { gastrointestinalFactRules } from './facts/gastrointestinal.js';
import { geneticsFactRules } from './facts/genetics.js';
import { hematologyFactRules } from './facts/hematology.js';
import { hematologyOncologyFactRules } from './facts/hematologyOncology.js';
import { immunologyFactRules } from './facts/immunology.js';
import { microbiologyFactRules } from './facts/microbiology.js';
import { neurologyFactRules } from './facts/neurology.js';
import { pharmacologyFactRules } from './facts/pharmacology.js';
import { psychiatryFactRules } from './facts/psychiatry.js';
import { pulmonaryFactRules } from './facts/pulmonary.js';
import { renalFactRules } from './facts/renal.js';
import { reproductiveFactRules } from './facts/reproductive.js';
import { rheumatologyFactRules } from './facts/rheumatology.js';

export type { MedicalFactRule } from './medicalFactRuleTypes.js';

function has(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function answerSupport(question: ValidationQuestion): string {
  const correct = String(question.correct || '').trim().toUpperCase();
  const correctText = (question.options || []).find(o => o.letter === correct)?.text || '';
  const correctExplanation = question.optionExplanations?.[correct] || '';
  return [correctText, question.explanation, correctExplanation].filter(Boolean).join(' ');
}

function intentTextFor(question: ValidationQuestion): string {
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

function truncate(value: string | undefined, maxLength = 500): string {
  if (!value) return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

function combinedFactFailure(failures: Array<{ rule: MedicalFactRule; detected: string }>): ValidatorResult {
  return {
    name: 'specialty',
    status: 'fail',
    blocking: true,
    score: 0,
    expected: truncate(failures.map(({ rule }) => rule.expected).join(' | '), 600),
    detected: truncate(failures.map(({ detected }) => detected).join(' | '), 600),
    confidence: 0.92,
    reasons: failures.map(({ rule }) => `fact_registry_${rule.id}_contradiction`),
    details: failures.map(({ rule, detected }) => ({
      reason: `fact_registry_${rule.id}_contradiction`,
      factId: rule.id,
      domain: rule.domain,
      expected: truncate(rule.expected),
      detected: truncate(detected),
      source: rule.source,
      reviewStatus: rule.reviewStatus,
      lastReviewed: rule.lastReviewed,
      confidence: 0.92,
      score: 0,
    })),
  };
}

export const medicalFactRules: MedicalFactRule[] = [
  ...biochemistryFactRules,
  ...cardiologyFactRules,
  ...cardiovascularFactRules,
  ...dermatologyFactRules,
  ...endocrineFactRules,
  ...gastroenterologyFactRules,
  ...gastrointestinalFactRules,
  ...geneticsFactRules,
  ...hematologyFactRules,
  ...hematologyOncologyFactRules,
  ...immunologyFactRules,
  ...microbiologyFactRules,
  ...neurologyFactRules,
  ...pharmacologyFactRules,
  ...psychiatryFactRules,
  ...pulmonaryFactRules,
  ...renalFactRules,
  ...reproductiveFactRules,
  ...rheumatologyFactRules,
];

export function validateAgainstFactRegistry(question: ValidationQuestion): ValidatorResult | null {
  const haystack = intentTextFor(question);
  const support = answerSupport(question);
  const failures: Array<{ rule: MedicalFactRule; detected: string }> = [];

  for (const rule of medicalFactRules) {
    const applies = rule.appliesTo.some(pattern => has(haystack, pattern));
    if (!applies) continue;

    const hasContradiction = rule.contradictions.some(pattern => has(support, pattern));
    if (!hasContradiction) continue;

    const hasRequiredSupport = (rule.requiredSupport || []).some(pattern => has(support, pattern));
    if (hasRequiredSupport) continue;

    failures.push({ rule, detected: support.toLowerCase() });
  }

  return failures.length > 0 ? combinedFactFailure(failures) : null;
}
