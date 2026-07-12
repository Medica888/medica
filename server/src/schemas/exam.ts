import { z } from 'zod';

const questionSchema = z.object({
  id: z.string(),
  text: z.string(),
  options: z.array(z.string()),
  correct_answer: z.string(),
  explanation: z.string().optional(),
  subject: z.string().optional(),
  system: z.string().optional(),
  difficulty: z.string().optional(),
  pearl: z.string().optional(),
  commonTrap: z.string().optional(),
  wrongAnswerExplanations: z.record(z.string(), z.string()).optional(),
  memoryAnchor: z.string().optional(),
  // Concept-signal metadata from AI generation
  testedConcept: z.string().optional(),
  weakSpotCategory: z.string().optional(),
  topic: z.string().optional(),
  canonicalTopic: z.string().optional(),
  topicSlug: z.string().optional(),
  topicSource: z.string().optional(),
  questionAngle: z.string().optional(),
  canonicalConcepts: z.array(z.string()).optional(),
});

const subjectStatsSchema = z.object({
  total: z.number(),
  correct: z.number(),
  percentage: z.number(),
});

export const createSessionSchema = z.object({
  mode: z.enum(['exam', 'practice', 'coach']),
  questions: z.array(questionSchema).min(1).max(280),
  answers: z.record(z.string(), z.string()),
  score: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
  medica_score: z.number().min(0).max(300),
  readiness_label: z.string().max(100),
  subject_breakdown: z.record(z.string(), subjectStatsSchema),
  system_breakdown: z.record(z.string(), subjectStatsSchema),
  missed_questions: z.array(questionSchema),
  completed_at: z.string(),
  duration_seconds: z.number().int().min(0).max(86400),
  difficulty: z.string().max(50),
  time_spent: z.record(z.string(), z.number().int().min(0)).optional(),
  // Client-generated UUID enables idempotent retries: the server uses this as the
  // session's primary key. Duplicate requests with the same key return the existing session.
  clientSessionId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  const seen = new Set<string>();
  data.questions.forEach((question, index) => {
    if (seen.has(question.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions', index, 'id'],
        message: 'Duplicate question id in submitted session',
      });
    }
    seen.add(question.id);
  });
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

// IDs only — never question bodies/answers. A reservation endpoint that accepted
// client-submitted bodies would just move the tamper point earlier instead of
// closing it; the server resolves authoritative bodies itself from stored IDs.
export const reserveSessionSchema = z.object({
  clientSessionId: z.string().uuid(),
  questionIds: z.array(z.string()).min(1).max(280),
});

export type ReserveSessionInput = z.infer<typeof reserveSessionSchema>;
