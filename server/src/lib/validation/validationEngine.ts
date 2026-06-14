import {
  requiresMedicalReview,
  scoreQuestion,
  scoreScopeAlignment,
} from '../questionValidator.js';
import { validateDifficulty } from './difficultyValidator.js';
import { validateSubject } from './subjectValidator.js';
import { validateSubjectSystem } from './subjectSystemValidator.js';
import { validateSystem } from './systemValidator.js';
import { validateTopic } from './topicValidator.js';
import { validateConcept } from './conceptValidator.js';
import { validateSpecialty } from './specialty/specialtyValidation.js';
import type {
  ValidateQuestionInput,
  ValidationEngineResult,
  ValidationPolicy,
  ValidatorResult,
} from './validationTypes.js';

export const DEFAULT_VALIDATION_THRESHOLD = 70;

export function getValidationPolicy(difficulty: string): ValidationPolicy {
  return {
    requiresMedicalReview: requiresMedicalReview(difficulty),
    allowDifficultyWarn: true,
    minimumScore: DEFAULT_VALIDATION_THRESHOLD,
  };
}

function structuralResult(quality: ReturnType<typeof scoreQuestion>): ValidatorResult {
  const failed = quality.validationStatus !== 'pass';
  return {
    name: 'structural',
    status: failed ? 'fail' : 'pass',
    blocking: failed,
    score: Math.max(0, Math.min(100, quality.qualityScore)),
    reasons: quality.rejectionReasons,
  };
}

function scopeResult(reasons: string[]): ValidatorResult {
  return {
    name: 'scope',
    status: reasons.length > 0 ? 'fail' : 'pass',
    blocking: reasons.length > 0,
    score: reasons.length > 0 ? 0 : 100,
    reasons,
  };
}

function medicalReviewSkippedResult(required: boolean): ValidatorResult {
  return {
    name: 'medical_review',
    status: required ? 'fail' : 'pass',
    blocking: required,
    score: required ? 0 : 100,
    reasons: required ? ['medical_review_required_but_not_available'] : [],
  };
}

function computeScore(results: ValidatorResult[]): number {
  const weights: Record<string, number> = {
    structural: 20,
    medical_review: 20,
    subject: 15,
    system: 15,
    subject_system: 15,
    topic: 10,
    concept: 10,
    specialty: 20,
    difficulty: 5,
    scope: 10,
  };
  let totalWeight = 0;
  let weighted = 0;
  for (const result of results) {
    const weight = weights[result.name] ?? 5;
    totalWeight += weight;
    weighted += weight * Math.max(0, Math.min(100, result.score));
  }
  return totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
}

export async function validateQuestion(input: ValidateQuestionInput): Promise<ValidationEngineResult> {
  const policy = {
    ...getValidationPolicy(input.difficulty),
    ...input.policy,
  };

  const quality = scoreQuestion(input.question as Parameters<typeof scoreQuestion>[0], input.mode, input.difficulty);
  const validators: ValidatorResult[] = [];

  validators.push(structuralResult(quality));
  validators.push(validateSubject(input.question, input.requestedScope?.subject));
  validators.push(validateSystem(input.question, input.requestedScope?.system));
  validators.push(validateSubjectSystem(input.question));
  validators.push(validateTopic(input.question));
  validators.push(validateConcept(input.question));
  validators.push(validateSpecialty(input.question));
  validators.push(validateDifficulty(input.question, input.difficulty, policy.allowDifficultyWarn));

  const scopeReasons = input.requestedScope
    ? scoreScopeAlignment(input.question, input.requestedScope)
    : [];
  validators.push(scopeResult(scopeReasons));

  if (policy.requiresMedicalReview) {
    if (!input.medicalReview) {
      validators.push(medicalReviewSkippedResult(true));
    } else {
      const review = await input.medicalReview(input.question, input.difficulty);
      validators.push({
        name: 'medical_review',
        status: review.pass ? 'pass' : 'fail',
        blocking: !review.pass,
        score: review.pass ? 100 : 0,
        reasons: review.pass ? [] : (review.failedCategories.length ? review.failedCategories : ['medical_review_failed']),
      });
    }
  } else {
    validators.push(medicalReviewSkippedResult(false));
  }

  const warnings = validators
    .filter(v => v.status === 'warn')
    .flatMap(v => v.reasons.map(reason => `${v.name}:${reason}`));
  const rejectionReasons = validators
    .filter(v => v.status === 'fail' || v.blocking)
    .flatMap(v => v.reasons.map(reason => `${v.name}:${reason}`));
  const score = computeScore(validators);
  const blocking = validators.some(v => v.blocking || v.status === 'fail') || score < policy.minimumScore;
  const status = blocking ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';

  return {
    passed: !blocking,
    blocking,
    status,
    score,
    validators,
    rejectionReasons,
    warnings,
    policy,
    quality,
  };
}
