import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';

const app = createApp();

const sampleSession = {
  mode: 'practice',
  questions: [
    {
      id: 'q1',
      text: 'What causes hypertension?',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A',
      subject: 'Physiology',
      system: 'Cardiovascular',
      difficulty: 'medium',
    },
  ],
  answers: { q1: 'A' },
  score: 1,
  percentage: 100,
  medica_score: 75,
  readiness_label: 'Ready',
  subject_breakdown: { Physiology: { total: 1, correct: 1, percentage: 100 } },
  system_breakdown: { Cardiovascular: { total: 1, correct: 1, percentage: 100 } },
  missed_questions: [],
  completed_at: new Date().toISOString(),
  duration_seconds: 60,
  difficulty: 'balanced',
};

async function registerAndGetToken(): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email: `user_${Date.now()}@example.com`,
    name: 'Exam User',
    password: 'password123',
  });
  return res.body.token as string;
}

beforeEach(() => {
  setRepositories(createInMemoryRepositories());
});

describe('POST /api/exams', () => {
  it('creates a session and returns it', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleSession);
    expect(res.status).toBe(201);
    expect(res.body.session.mode).toBe('practice');
    expect(res.body.session.id).toBeDefined();
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/exams').send(sampleSession);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/exams', () => {
  it('returns paginated sessions', async () => {
    const token = await registerAndGetToken();
    await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleSession);
    const res = await request(app)
      .get('/api/exams')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.total).toBe(1);
  });
});

describe('GET /api/exams/:id', () => {
  it('returns the session', async () => {
    const token = await registerAndGetToken();
    const created = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleSession);
    const id = created.body.session.id as string;
    const res = await request(app)
      .get(`/api/exams/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.session.id).toBe(id);
  });

  it('returns 403 for another user session', async () => {
    const token1 = await registerAndGetToken();
    const token2 = await registerAndGetToken();
    const created = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token1}`)
      .send(sampleSession);
    const id = created.body.session.id as string;
    const res = await request(app)
      .get(`/api/exams/${id}`)
      .set('Authorization', `Bearer ${token2}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/exams/:id', () => {
  it('deletes the session', async () => {
    const token = await registerAndGetToken();
    const created = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleSession);
    const id = created.body.session.id as string;
    const del = await request(app)
      .delete(`/api/exams/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });
});
