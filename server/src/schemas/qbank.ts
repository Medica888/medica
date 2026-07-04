import { z } from 'zod';

export const createQBankSessionSchema = z.object({
  ids: z
    .array(z.string().trim().min(1).max(100))
    .min(1)
    .max(40)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Duplicate question ids are not allowed',
    }),
});

export type CreateQBankSessionInput = z.infer<typeof createQBankSessionSchema>;
