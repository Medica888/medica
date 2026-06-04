import { z } from 'zod';

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
