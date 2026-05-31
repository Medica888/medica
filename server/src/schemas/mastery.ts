import { z } from 'zod';

export const reviewConceptSchema = z.object({
  result: z.enum(['again', 'hard', 'good', 'easy']),
});
