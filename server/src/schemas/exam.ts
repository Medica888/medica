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
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
