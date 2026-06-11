import type { QuestionQuality, MedicalReviewResult } from '../questionValidator.js';

export type ValidationStatus = 'pass' | 'warn' | 'fail';

export interface ValidationQuestion {
  subject?: string;
  system?: string;
  difficulty?: string;
  topic?: string;
  testedConcept?: string;
  canonicalConcepts?: string[];
  questionAngle?: string;
  canonicalTopic?: string;
  rawTopic?: string;
  weakSpotCategory?: string;
  stem?: string;
  options?: Array<{ letter: string; text: string }>;
  correct?: string;
  explanation?: string;
  optionExplanations?: Record<string, string>;
  usmleContentArea?: string;
  physicianTask?: string;
}

export interface ValidationScope {
  subject?: string;
  system?: string;
  topic?: string;
}

export interface ValidatorResult {
  name: string;
  status: ValidationStatus;
  blocking: boolean;
  score: number;
  reasons: string[];
  expected?: string;
  detected?: string;
  confidence?: number;
}

export interface ValidationPolicy {
  requiresMedicalReview: boolean;
  allowDifficultyWarn: boolean;
  minimumScore: number;
}

export interface MedicalReviewAdapterResult {
  pass: boolean;
  result: MedicalReviewResult | null;
  failedCategories: string[];
}

export type MedicalReviewAdapter = (
  question: ValidationQuestion,
  difficulty: string,
) => Promise<MedicalReviewAdapterResult>;

export interface ValidateQuestionInput {
  question: ValidationQuestion;
  mode: string;
  difficulty: string;
  requestedScope?: ValidationScope;
  medicalReview?: MedicalReviewAdapter;
  policy?: Partial<ValidationPolicy>;
}

export interface ValidationEngineResult {
  passed: boolean;
  blocking: boolean;
  status: ValidationStatus;
  score: number;
  validators: ValidatorResult[];
  rejectionReasons: string[];
  warnings: string[];
  policy: ValidationPolicy;
  quality: QuestionQuality;
}
