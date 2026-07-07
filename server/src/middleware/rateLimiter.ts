import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Store } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

const isTest = process.env.NODE_ENV === 'test';

// Redis store — set once by initRedisStore() before the server starts.
// undefined means use express-rate-limit's default in-memory store.
// This preserves the project invariant: npm test works without Docker/Redis.
let redisIpStore: Store | undefined;
let redisUserStore: Store | undefined;
let redisQuestionReportStore: Store | undefined;
let redisClient: { quit(): Promise<unknown>; disconnect(): void } | null = null;
let questionReportLimiterImpl: RequestHandler | null = null;

export async function initRedisStore(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url || isTest) return;
  try {
    const { createClient } = await import('redis');
    const { RedisStore } = await import('rate-limit-redis');
    const client = createClient({ url });
    client.on('error', (err: unknown) =>
      logger.error('[redis] rate-limit store error', { error: (err as Error).message }),
    );
    await client.connect();
    redisClient = client;
    redisIpStore = new RedisStore({
      sendCommand: (...args: string[]) => (client as any).sendCommand(args),
      prefix: 'rl:ip:',
    });
    redisUserStore = new RedisStore({
      sendCommand: (...args: string[]) => (client as any).sendCommand(args),
      prefix: 'rl:user:',
    });
    redisQuestionReportStore = new RedisStore({
      sendCommand: (...args: string[]) => (client as any).sendCommand(args),
      prefix: 'rl:question-report:',
    });
    logger.info('[redis] rate-limit store connected', { url: url.replace(/:[^:@]*@/, ':***@') });
  } catch (err) {
    redisClient = null;
    redisIpStore = undefined;
    redisUserStore = undefined;
    redisQuestionReportStore = undefined;
    logger.warn('[rateLimiter] Redis unavailable, using in-memory store', { error: (err as Error).message });
  }
}

export async function closeRedisStore(): Promise<void> {
  const client = redisClient;
  redisClient = null;
  redisIpStore = undefined;
  redisUserStore = undefined;
  redisQuestionReportStore = undefined;
  questionReportLimiterImpl = null;
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}

// ── Auth-path limiters (in-memory; fine for low-volume auth endpoints) ────────

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

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many password reset requests, please try again in an hour' },
});

const questionReportLimiterOptions: Parameters<typeof rateLimit>[0] = {
  windowMs: 60 * 60 * 1000,
  limit: 20,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    (req as Request & { userId?: string }).userId ||
    ipKeyGenerator(req.ip ?? '') ||
    'unknown',
  message: { error: 'Too many question reports. Please try again later.', code: 'RATE_LIMITED' },
};

export function createQuestionReportLimiter(
  store: Store | undefined = redisQuestionReportStore,
  overrides: Partial<Parameters<typeof rateLimit>[0]> = {},
): RequestHandler {
  return rateLimit({ store, ...questionReportLimiterOptions, ...overrides });
}

export function initializeQuestionReportLimiter(): void {
  if (questionReportLimiterImpl) return;
  questionReportLimiterImpl = createQuestionReportLimiter();
}

export const questionReportLimiter: RequestHandler = dispatchLimiter(() => questionReportLimiterImpl);

// ── AI generation limiters (Redis-backed when REDIS_URL is set) ───────────────

// Broad per-IP limiter — protects unauthenticated paths and prevents IP flooding.
// Applied on /generate-questions (optionalAuth) where anonymous callers can reach the limiter.
const aiIpLimiterOptions: Parameters<typeof rateLimit>[0] = {
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? '') || 'unknown-ip',
  message: { error: 'Too many requests from this IP. Please try again in 15 minutes.', code: 'RATE_LIMITED' },
};

// Per-user limiter — the actual AI generation budget (20 req / 15 min per user).
// Falls back to IP when userId is absent (anonymous path on /generate-questions).
const aiUserLimiterOptions: Parameters<typeof rateLimit>[0] = {
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) =>
    (req as Request & { userId?: string }).userId ||
    ipKeyGenerator(req.ip ?? '') ||
    'unknown',
  message: { error: 'Too many AI generation requests. Please try again in 15 minutes.', code: 'RATE_LIMITED' },
};

let aiIpLimiterImpl: RequestHandler | null = null;
let aiUserLimiterImpl: RequestHandler | null = null;

/** Construct Redis-backed AI limiters after initRedisStore(), before requests arrive. */
export function initializeAiLimiters(): void {
  if (aiIpLimiterImpl && aiUserLimiterImpl) return;
  aiIpLimiterImpl = rateLimit({ store: redisIpStore, ...aiIpLimiterOptions });
  aiUserLimiterImpl = rateLimit({ store: redisUserStore, ...aiUserLimiterOptions });
}

function dispatchLimiter(getLimiter: () => RequestHandler | null): RequestHandler {
  return (req, res, next) => {
    const limiter = getLimiter();
    if (!limiter) {
      next(new Error('RATE_LIMITERS_NOT_INITIALIZED'));
      return;
    }
    return limiter(req, res, next);
  };
}

export const aiIpLimiter: RequestHandler = dispatchLimiter(() => aiIpLimiterImpl);
export const aiUserLimiter: RequestHandler = dispatchLimiter(() => aiUserLimiterImpl);

// Backward-compat alias — remove once all callers use the dual-limiter pattern.
export const aiLimiter: RequestHandler = aiUserLimiter;
