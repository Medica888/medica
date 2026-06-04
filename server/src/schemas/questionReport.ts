import { z } from 'zod';

const nullableText = (max: number) =>
  z.string().max(max).nullable().optional().transform(v => v ?? null);

export const createQuestionReportSchema = z.object({
  questionId:       z.string().max(200).nullable().optional().transform(v => v ?? null),
  fingerprint:      z.string().min(1).max(200),
  reason:           z.enum(['wrong_answer', 'bad_explanation', 'off_topic']),
  source:           z.enum(['ai', 'mock', 'trusted_bank']).nullable().optional().transform(v => v ?? null),
  mode:             z.enum(['exam', 'practice', 'coach']).nullable().optional().transform(v => v ?? null),
  difficulty:       nullableText(50),
  requestedSubject: nullableText(100),
  requestedSystem:  nullableText(100),
  requestedTopic:   nullableText(200),
  actualSubject:    nullableText(100),
  actualSystem:     nullableText(100),
  actualTopic:      nullableText(200),
  testedConcept:    nullableText(300),
  usmleContentArea: nullableText(100),
  physicianTask:    nullableText(100),
  stemPreview:      nullableText(500),
});

export type CreateQuestionReportInput = z.infer<typeof createQuestionReportSchema>;
