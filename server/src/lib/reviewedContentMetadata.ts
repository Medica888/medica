import type { GeneratedBankStatus } from '../repositories/interfaces.js';

export const REVIEW_STATUSES = [
  'unreviewed',
  'validator_passed',
  'source_checked',
  'expert_reviewed',
  'changes_requested',
  'rejected',
  'quarantined',
  'retired',
] as const;

export const REVIEWER_DECISIONS = [
  'approved',
  'changes_requested',
  'rejected',
  'quarantined',
  'restored',
  'retired',
] as const;

export const REVIEW_RUBRIC_STATUSES = [
  'unknown',
  'pass',
  'minor_issue',
  'major_issue',
  'fail',
] as const;

export const AUTHOR_TYPES = ['human', 'ai', 'imported', 'rewritten'] as const;

export type ReviewStatus = typeof REVIEW_STATUSES[number];
export type ReviewerDecision = typeof REVIEWER_DECISIONS[number];
export type ReviewRubricStatus = typeof REVIEW_RUBRIC_STATUSES[number];
export type AuthorType = typeof AUTHOR_TYPES[number];

export interface ReviewedContentMetadata {
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewerId: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  reviewerDecision: ReviewerDecision | null;
  sourceRefs: string[];
  medicalAccuracyStatus: ReviewRubricStatus;
  itemWritingStatus: ReviewRubricStatus;
  difficultyCalibrationStatus: ReviewRubricStatus;
  contentVersion: number | string;
  lastContentReviewedAt: string | null;
  provenance: {
    authorType: AuthorType;
    aiModel: string | null;
    validatorVersion: string | null;
    originalQuestionId: string | null;
  };
}

const REVIEW_STATUS_SET = new Set<string>(REVIEW_STATUSES);
const REVIEWER_DECISION_SET = new Set<string>(REVIEWER_DECISIONS);
const RUBRIC_STATUS_SET = new Set<string>(REVIEW_RUBRIC_STATUSES);
const AUTHOR_TYPE_SET = new Set<string>(AUTHOR_TYPES);

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanSourceRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanString).filter((v): v is string => Boolean(v)))].slice(0, 20);
}

function oneOf<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === 'string' && allowed.has(value) ? value as T : fallback;
}

function inferDefaultReviewStatus(bankStatus?: string | null): ReviewStatus {
  if (bankStatus === 'approved' || bankStatus === 'restored' || bankStatus === 'validated_generated') {
    return 'validator_passed';
  }
  if (bankStatus === 'quarantined') return 'quarantined';
  if (bankStatus === 'rejected') return 'rejected';
  return 'unreviewed';
}

function inferAuthorType(source?: string | null): AuthorType {
  if (source === 'ai') return 'ai';
  if (source === 'authored') return 'human';
  return 'imported';
}

export function normalizeReviewedContentMetadata(
  raw: unknown,
  context: {
    bankStatus?: string | null;
    source?: string | null;
    aiModel?: string | null;
    validatorVersion?: string | null;
    body?: Record<string, unknown> | null;
  } = {},
): ReviewedContentMetadata {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const body = context.body ?? {};
  const provenance = src.provenance && typeof src.provenance === 'object'
    ? src.provenance as Record<string, unknown>
    : {};

  const bodySourceRefs = cleanSourceRefs(body.sourceRefs);
  const reviewStatus = oneOf<ReviewStatus>(
    src.reviewStatus,
    REVIEW_STATUS_SET,
    inferDefaultReviewStatus(context.bankStatus),
  );

  return {
    reviewStatus,
    reviewedBy: cleanString(src.reviewedBy),
    reviewerId: cleanString(src.reviewerId),
    reviewedAt: cleanString(src.reviewedAt),
    reviewNotes: cleanString(src.reviewNotes),
    reviewerDecision: src.reviewerDecision == null
      ? null
      : oneOf<ReviewerDecision>(src.reviewerDecision, REVIEWER_DECISION_SET, 'approved'),
    sourceRefs: cleanSourceRefs(src.sourceRefs).length > 0 ? cleanSourceRefs(src.sourceRefs) : bodySourceRefs,
    medicalAccuracyStatus: oneOf<ReviewRubricStatus>(src.medicalAccuracyStatus, RUBRIC_STATUS_SET, 'unknown'),
    itemWritingStatus: oneOf<ReviewRubricStatus>(src.itemWritingStatus, RUBRIC_STATUS_SET, 'unknown'),
    difficultyCalibrationStatus: oneOf<ReviewRubricStatus>(src.difficultyCalibrationStatus, RUBRIC_STATUS_SET, 'unknown'),
    contentVersion: typeof src.contentVersion === 'number' || typeof src.contentVersion === 'string'
      ? src.contentVersion
      : (typeof body.contentVersion === 'number' || typeof body.contentVersion === 'string' ? body.contentVersion : 1),
    lastContentReviewedAt: cleanString(src.lastContentReviewedAt),
    provenance: {
      authorType: oneOf<AuthorType>(provenance.authorType, AUTHOR_TYPE_SET, inferAuthorType(context.source)),
      aiModel: cleanString(provenance.aiModel) ?? cleanString(context.aiModel),
      validatorVersion: cleanString(provenance.validatorVersion) ?? cleanString(context.validatorVersion),
      originalQuestionId: cleanString(provenance.originalQuestionId),
    },
  };
}

export function mergeReviewedContentMetadataIntoBody(
  body: Record<string, unknown>,
  metadata: ReviewedContentMetadata,
): Record<string, unknown> {
  return {
    ...body,
    sourceRefs: metadata.sourceRefs,
    reviewMetadata: metadata,
    reviewStatus: metadata.reviewStatus,
  };
}

export function isCommerciallyContentReady(input: {
  bankStatus?: string | null;
  difficulty?: string | null;
  reviewMetadata?: unknown;
  source?: string | null;
  aiModel?: string | null;
  validatorVersion?: string | null;
  body?: Record<string, unknown> | null;
}): boolean {
  const bankStatus = String(input.bankStatus || '');
  if (!['approved', 'restored'].includes(bankStatus)) return false;

  const meta = normalizeReviewedContentMetadata(input.reviewMetadata, input);
  if (meta.sourceRefs.length === 0) return false;
  if (meta.medicalAccuracyStatus !== 'pass') return false;
  if (meta.itemWritingStatus === 'major_issue' || meta.itemWritingStatus === 'fail') return false;
  if (meta.difficultyCalibrationStatus === 'major_issue' || meta.difficultyCalibrationStatus === 'fail') return false;

  const difficulty = String(input.difficulty || '');
  const hardMode = difficulty === 'UWorld Challenge' || difficulty === 'NBME Difficult';
  return hardMode
    ? meta.reviewStatus === 'expert_reviewed'
    : meta.reviewStatus === 'source_checked' || meta.reviewStatus === 'expert_reviewed';
}

export function isStudentVisibleStatus(status: GeneratedBankStatus | string | null | undefined): boolean {
  return status === 'approved' || status === 'restored';
}
