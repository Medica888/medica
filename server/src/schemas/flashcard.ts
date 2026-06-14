import { z } from 'zod';

export const createFlashcardSchema = z.object({
  source_question_id: z.string(),
  type: z.enum(['Recall', 'Pearl', 'Trap', 'Mnemonic']),
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(500),
  tag: z.string().min(1),
  review_status: z.enum(['new', 'learning', 'review', 'mastered']).default('new'),
  question_ref_id: z.string().uuid().optional(),
  // v9.0.0-alpha.5 — full-fidelity metadata
  subject:                z.string().max(100).optional(),
  system:                 z.string().max(100).optional(),
  topic:                  z.string().max(200).optional(),
  canonical_topic:        z.string().max(200).optional(),
  topic_slug:             z.string().max(200).optional(),
  source_mode:            z.string().max(50).optional(),
  memory_anchor:          z.string().max(500).nullable().optional(),
  common_trap:            z.string().max(500).nullable().optional(),
  source_pearl:           z.string().max(500).nullable().optional(),
  weak_spot_category:     z.string().max(100).optional(),
  reinforcement_priority: z.enum(['high', 'medium', 'normal']).optional(),
  review_count:           z.number().int().min(0).optional(),
  ease:                   z.enum(['again', 'hard', 'good', 'easy']).nullable().optional(),
  last_missed_reason:     z.string().max(500).nullable().optional(),
});

export const createFlashcardsSchema = z.object({
  flashcards: z.array(createFlashcardSchema).min(1).max(100),
});

export const updateStatusSchema = z.object({
  status: z.enum(['new', 'learning', 'review', 'mastered']),
});

export type CreateFlashcardInput = z.infer<typeof createFlashcardSchema>;
