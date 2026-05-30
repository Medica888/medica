import { z } from 'zod';

export const createFlashcardSchema = z.object({
  source_question_id: z.string(),
  type: z.enum(['Recall', 'Pearl', 'Trap', 'Mnemonic']),
  front: z.string().min(1).max(200),
  back: z.string().min(1).max(500),
  tag: z.string().min(1),
  review_status: z.enum(['new', 'learning', 'review', 'mastered']).default('new'),
  question_ref_id: z.string().uuid().optional(),
});

export const createFlashcardsSchema = z.object({
  flashcards: z.array(createFlashcardSchema).min(1).max(100),
});

export const updateStatusSchema = z.object({
  status: z.enum(['new', 'learning', 'review', 'mastered']),
});

export type CreateFlashcardInput = z.infer<typeof createFlashcardSchema>;
