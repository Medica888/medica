import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';

const app = createApp();

async function registerAndGetToken(): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email: `analytics_${Date.now()}@example.com`,
    name: 'Analytics User',
    password: 'password123',
  });
  return res.body.token as string;
}

const sampleSession = {
  mode: 'practice',
  questions: [
    {
      id: 'q1',
      text: 'Question 1',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'A',
      subject: 'Physiology',
      system: 'Cardiovascular',
      difficulty: 'medium',
    },
    {
      id: 'q2',
      text: 'Question 2',
      options: ['A', 'B', 'C', 'D'],
      correct_answer: 'B',
      subject: 'Pathology',
      system: 'Renal',
      difficulty: 'hard',
    },
  ],
  answers: { q1: 'A', q2: 'C' },
  score: 1,
  percentage: 50,
  medica_score: 55,
  readiness_label: 'Borderline',
  subject_breakdown: {
    Physiology: { total: 1, correct: 1, percentage: 100 },
    Pathology: { total: 1, correct: 0, percentage: 0 },
  },
  system_breakdown: {
    Cardiovascular: { total: 1, correct: 1, percentage: 100 },
    Renal: { total: 1, correct: 0, percentage: 0 },
  },
  missed_questions: [
    { id: 'q2', text: 'Q2', options: ['A', 'B', 'C', 'D'], correct_answer: 'B', subject: 'Pathology', system: 'Renal' },
  ],
  completed_at: new Date().toISOString(),
  duration_seconds: 120,
  difficulty: 'balanced',
};

beforeEach(() => {
  setRepositories(createInMemoryRepositories());
});

describe('GET /api/analytics', () => {
  it('returns empty when no sessions', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(true);
  });

  it('returns analytics after sessions', async () => {
    const token = await registerAndGetToken();
    await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleSession);
    const res = await request(app)
      .get('/api/analytics')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.empty).toBe(false);
    expect(res.body.overview).toBeDefined();
    expect(res.body.subjectBreakdown).toBeDefined();
  });
});

describe('GET /api/analytics/progress', () => {
  it('returns gains after multiple sessions', async () => {
    const token = await registerAndGetToken();
    await request(app).post('/api/exams').set('Authorization', `Bearer ${token}`).send(sampleSession);
    await request(app).post('/api/exams').set('Authorization', `Bearer ${token}`).send({
      ...sampleSession,
      medica_score: 65,
      completed_at: new Date(Date.now() + 1000).toISOString(),
    });
    const res = await request(app)
      .get('/api/analytics/progress')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.gains.length).toBeGreaterThan(0);
  });
});
