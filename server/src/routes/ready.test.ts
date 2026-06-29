import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';

// Mock isDbConnected before importing createApp so the route picks it up.
vi.mock('../config/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config/db.js')>();
  return { ...actual, isDbConnected: vi.fn().mockResolvedValue(true) };
});
vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>();
  return {
    ...actual,
    config: { ...actual.config, databaseUrl: 'postgresql://test' },
  };
});

import { createApp } from '../app.js';
import { isDbConnected } from '../config/db.js';

const app = createApp();

afterEach(() => vi.clearAllMocks());

describe('GET /api/ready — readiness probe', () => {
  it('returns 200 ready:true when DB is connected', async () => {
    vi.mocked(isDbConnected).mockResolvedValue(true);
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.database).toBe('connected');
  });

  it('returns 503 ready:false when DB is disconnected', async () => {
    vi.mocked(isDbConnected).mockResolvedValue(false);
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.database).toBe('disconnected');
  });
});
