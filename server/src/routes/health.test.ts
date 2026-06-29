import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('GET /api/health — liveness', () => {
  it('returns 200 with ok:true and service fields (liveness probe)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('medica-api');
  });

  it('always returns 200 regardless of environment (liveness not readiness)', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/ready — readiness', () => {
  it('returns 200 with ready:true when no DATABASE_URL (in-memory mode)', async () => {
    // Tests run without DATABASE_URL set (vitest.config.ts sets DATABASE_URL='').
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.database).toBe('not-configured');
  });
});
