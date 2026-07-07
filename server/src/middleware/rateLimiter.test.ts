import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Store } from 'express-rate-limit';
import { createQuestionReportLimiter } from './rateLimiter.js';

type Counter = { hits: number; resetTime: Date };

class SharedCounterStore implements Store {
  localKeys = false;
  prefix = 'shared-report-test:';

  constructor(private readonly counters: Map<string, Counter>) {}

  increment(key: string) {
    const current = this.counters.get(key) ?? {
      hits: 0,
      resetTime: new Date(Date.now() + 60 * 60 * 1000),
    };
    current.hits += 1;
    this.counters.set(key, current);
    return { totalHits: current.hits, resetTime: current.resetTime };
  }

  decrement(key: string) {
    const current = this.counters.get(key);
    if (current) current.hits = Math.max(0, current.hits - 1);
  }

  resetKey(key: string) {
    this.counters.delete(key);
  }
}

function makeApp(store: Store | undefined) {
  const app = express();
  app.use((req, _res, next) => {
    (req as express.Request & { userId?: string }).userId = req.header('x-user-id') ?? undefined;
    next();
  });
  app.post('/report', createQuestionReportLimiter(store, {
    limit: 2,
    skip: () => false,
    validate: false,
  }), (_req, res) => res.status(201).json({ ok: true }));
  return app;
}

describe('question report rate limiter', () => {
  it('shares a per-user limit across two application instances', async () => {
    const sharedCounters = new Map<string, Counter>();
    const firstApp = makeApp(new SharedCounterStore(sharedCounters));
    const secondApp = makeApp(new SharedCounterStore(sharedCounters));

    await request(firstApp).post('/report').set('x-user-id', 'user-a').expect(201);
    await request(secondApp).post('/report').set('x-user-id', 'user-a').expect(201);
    const limited = await request(firstApp).post('/report').set('x-user-id', 'user-a').expect(429);

    expect(limited.body.code).toBe('RATE_LIMITED');
    await request(secondApp).post('/report').set('x-user-id', 'user-b').expect(201);
  });

  // Redis fallback policy: when no store is configured (REDIS_URL unset or Redis
  // unreachable), createQuestionReportLimiter(undefined, ...) must still function —
  // falling back to express-rate-limit's own in-memory store per process, matching
  // the same graceful-degradation policy already used by the AI limiters.
  it('falls back to a working per-instance limiter when no Redis store is configured', async () => {
    const app = makeApp(undefined);

    await request(app).post('/report').set('x-user-id', 'user-a').expect(201);
    await request(app).post('/report').set('x-user-id', 'user-a').expect(201);
    const limited = await request(app).post('/report').set('x-user-id', 'user-a').expect(429);

    expect(limited.body.code).toBe('RATE_LIMITED');
  });

  it('does not share state between instances when no Redis store is configured (no shared counter to fall back to)', async () => {
    const firstApp = makeApp(undefined);
    const secondApp = makeApp(undefined);

    await request(firstApp).post('/report').set('x-user-id', 'user-a').expect(201);
    await request(firstApp).post('/report').set('x-user-id', 'user-a').expect(201);
    await request(firstApp).post('/report').set('x-user-id', 'user-a').expect(429);

    // A second instance with its own in-memory store has no knowledge of the first's count.
    await request(secondApp).post('/report').set('x-user-id', 'user-a').expect(201);
  });
});
