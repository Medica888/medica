import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns 200 with ok and service fields', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe('boolean');
    expect(res.body.service).toBe('medica-api');
    expect(typeof res.body.database).toBe('string');
  });
});
