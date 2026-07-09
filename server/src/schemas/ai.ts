import { z } from 'zod';

const generatedBankStatusSchema = z.enum(['validated_generated', 'approved', 'restored', 'quarantined', 'validation_failed', 'rejected']);
const taxonomyCandidateStatusSchema = z.enum(['pending', 'approved_canonical', 'mapped_alias', 'rejected']);
const reviewStatusSchema = z.enum([
  'unreviewed',
  'validator_passed',
  'source_checked',
  'expert_reviewed',
  'changes_requested',
  'rejected',
  'quarantined',
  'retired',
]);
const reviewerDecisionSchema = z.enum(['approved', 'changes_requested', 'rejected', 'quarantined', 'restored', 'retired']);
const reviewRubricStatusSchema = z.enum(['unknown', 'pass', 'minor_issue', 'major_issue', 'fail']);
const authorTypeSchema = z.enum(['human', 'ai', 'imported', 'rewritten']);
const queryBooleanSchema = z.preprocess((value) => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
}, z.boolean());

export const generateQuestionsSchema = z.object({
  config: z.object({
    mode:          z.enum(['exam', 'practice', 'coach']),
    questionCount: z.number().int().min(1).max(40),
    subject:       z.string().max(100).optional(),
    system:        z.string().max(100).optional(),
    topic:         z.string().max(200).optional(),
    difficulty:    z.string().max(50).optional(),
    clinicalFocus: z.string().max(200).optional(),
    blockType:     z.string().max(50).optional(),
  }).passthrough(),  // preserves adaptiveFocusText, canonicalTopic, topicSlug, etc.
  exclude: z.object({
    questionIds:     z.array(z.string().max(200)).max(1000).optional(),
    baseQuestionIds: z.array(z.string().max(200)).max(1000).optional(),
  }).optional(),
});

export const generateFlashcardsSchema = z.object({
  config: z.object({
    count:   z.number().int().min(1).max(30).optional(),
    subject: z.string().max(100).optional(),
    system:  z.string().max(100).optional(),
  }).passthrough().optional().default({}),
});

export const explainSchema = z.object({
  stem:    z.string().min(1).max(2000),
  options: z.array(z.string().max(500)).min(2).max(10),
  correct: z.number().int().min(0).max(9),
  field:   z.string().max(100).optional(),
  pearl:   z.string().max(500).optional(),
});

export const skillsGenerateSchema = z.object({
  skillId:     z.string().max(50).optional(),
  guide:       z.string().min(1).max(10000),
  customSkill: z.object({
    systemPrompt: z.string().max(20000),
    name:         z.string().max(100),
  }).optional(),
});

export const generatedQuestionBankReviewQuerySchema = z.object({
  status:          generatedBankStatusSchema.optional(),
  reviewStatus:    reviewStatusSchema.optional(),
  commercialReady: queryBooleanSchema.optional(),
  limit:           z.coerce.number().int().min(1).max(200).optional(),
  page:            z.coerce.number().int().min(1).max(500).optional(),
  offset:          z.coerce.number().int().min(0).max(10000).optional(),
  sort:            z.enum(['priority', 'newest', 'score', 'usage']).optional(),
});

export const generatedQuestionBankStatusUpdateSchema = z.object({
  status: generatedBankStatusSchema,
});

export const reviewedContentMetadataUpdateSchema = z.object({
  reviewStatus: reviewStatusSchema.optional(),
  reviewedBy: z.string().trim().min(1).max(200).nullable().optional(),
  reviewerId: z.string().trim().min(1).max(100).nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
  reviewNotes: z.string().trim().max(2000).nullable().optional(),
  reviewerDecision: reviewerDecisionSchema.nullable().optional(),
  sourceRefs: z.array(z.string().trim().min(1).max(1000)).max(20).optional(),
  medicalAccuracyStatus: reviewRubricStatusSchema.optional(),
  itemWritingStatus: reviewRubricStatusSchema.optional(),
  difficultyCalibrationStatus: reviewRubricStatusSchema.optional(),
  contentVersion: z.union([z.number().int().min(1), z.string().trim().min(1).max(50)]).optional(),
  lastContentReviewedAt: z.string().datetime().nullable().optional(),
  provenance: z.object({
    authorType: authorTypeSchema.optional(),
    aiModel: z.string().trim().max(100).nullable().optional(),
    validatorVersion: z.string().trim().max(100).nullable().optional(),
    originalQuestionId: z.string().trim().max(300).nullable().optional(),
  }).strict().optional(),
}).strict();

export const taxonomyCandidateReviewQuerySchema = z.object({
  status: taxonomyCandidateStatusSchema.optional(),
  limit:  z.coerce.number().int().min(1).max(200).optional(),
  page:   z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).max(10000).optional(),
});

export const taxonomyCandidateStatusUpdateSchema = z.object({
  status: taxonomyCandidateStatusSchema,
  mappedTo: z.string().max(200).optional(),
  note: z.string().max(1000).optional(),
});

const clinicianReviewStatusSchema = z.enum(['pending', 'in_review', 'approved', 'changes_requested', 'rejected']);
const clinicianReviewPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);

export const clinicianReviewQueueQuerySchema = z.object({
  status:   clinicianReviewStatusSchema.optional(),
  priority: clinicianReviewPrioritySchema.optional(),
  overdue:  z.coerce.boolean().optional(),
  limit:    z.coerce.number().int().min(1).max(200).optional(),
  offset:   z.coerce.number().int().min(0).max(10000).optional(),
});

export const clinicianReviewUpdateSchema = z.object({
  review_status:        clinicianReviewStatusSchema,
  assigned_reviewer_id: z.string().max(100).nullable().optional(),
  reviewer_notes:       z.string().max(2000).nullable().optional(),
});

export const clinicianReviewManualTriggerSchema = z.object({
  priority: clinicianReviewPrioritySchema.optional().default('medium'),
  reason:   z.string().max(500).optional(),
});
