import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Store } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

const isTest = process.env.NODE_ENV === 'test';

// Redis store — set once by initRedisStore() before the server starts.
// undefined means use express-rate-limit's default in-memory store.
// This preserves the project invariant: npm test works without Docker/Redis.
let redisStore: Store | undefined;

export async function initRedisStore(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url || isTest) return;
  try {
    const { createClient } = await import('redis');
    const { RedisStore } = await import('rate-limit-redis');
    const client = createClient({ url });
    client.on('error', (err: unknown) =>
      console.error('[redis] rate-limit store error:', (err as Error).message),
    );
    await client.connect();
    redisStore = new RedisStore({
      sendCommand: (...args: string[]) => (client as any).sendCommand(args),
      prefix: 'rl:',
    });
    console.log('[redis] rate-limit store connected:', url.replace(/:[^:@]*@/, ':***@'));
  } catch (err) {
    console.warn('[rateLimiter] Redis unavailable, using in-memory store:', (err as Error).message);
  }
}

// Creates a rate limiter that captures the current redisStore on first request.
// initRedisStore() runs before app.listen() so the store is set before any real
// traffic arrives. validate.creationStack is disabled because express-rate-limit's
// stack-detection heuristic flags the lazy-initialization pattern as invalid even
// though the limiter is effectively created at startup (no requests precede it).
function makeLimiter(opts: Parameters<typeof rateLimit>[0]): RequestHandler {
  let limiter: ReturnType<typeof rateLimit> | null = null;
  return (req, res, next) => {
    if (!limiter) {
      limiter = rateLimit({ store: redisStore, validate: { creationStack: false }, ...opts });
    }
    return limiter(req, res, next);
  };
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

// ── AI generation limiters (Redis-backed when REDIS_URL is set) ───────────────

// Broad per-IP limiter — protects unauthenticated paths and prevents IP flooding.
// Applied on /generate-questions (optionalAuth) where anonymous callers can reach the limiter.
export const aiIpLimiter: RequestHandler = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  skip: () => isTest,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? '') || 'unknown-ip',
  message: { error: 'Too many requests from this IP. Please try again in 15 minutes.', code: 'RATE_LIMITED' },
});

// Per-user limiter — the actual AI generation budget (20 req / 15 min per user).
// Falls back to IP when userId is absent (anonymous path on /generate-questions).
export const aiUserLimiter: RequestHandler = makeLimiter({
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
});

// Backward-compat alias — remove once all callers use the dual-limiter pattern.
export const aiLimiter: RequestHandler = aiUserLimiter;
