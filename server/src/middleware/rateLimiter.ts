import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const isTest = process.env.NODE_ENV === 'test';

export const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 10 minutes' },
});

export const registerLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again in 10 minutes' },
});

// AI generation rate limiter — applied after optionalAuth so userId is available.
// Keyed by userId when authenticated (per-user bucket) or IP when anonymous.
// Limit: 20 requests / 15 min per bucket. Skipped in test environment.
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as Request & { userId?: string }).userId || ipKeyGenerator(req.ip ?? '') || 'unknown',
  message: { error: 'Too many AI generation requests. Please try again in 15 minutes.', code: 'RATE_LIMITED' },
});
