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

async function registerAndGetUser(): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/api/auth/register').send({
    email: `analytics_${Date.now()}_${Math.random().toString(36).slice(2)}@example.com`,
    name: 'Analytics User',
    password: 'password123',
  });
  return { token: res.body.token as string, userId: res.body.user.id as string };
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

let repos: ReturnType<typeof createInMemoryRepositories>;

beforeEach(async () => {
  repos = createInMemoryRepositories();
  setRepositories(repos);

  // Trust boundary (Phase 1): analytics now only aggregates sessions the
  // centralized trust policy permits (server_issued / client_selected_verified).
  // Seed q1/q2 as authoritative bank matches so sampleSession classifies as
  // client_selected_verified rather than unverified_local — these tests are
  // about the analytics aggregation math, not integrity classification
  // (which has its own dedicated coverage in ExamService.test.ts).
  for (const q of sampleSession.questions) {
    await repos.questions.upsertByExternalId(q.id, {
      subject: q.subject, system: q.system, source: 'authored', bankStatus: 'approved',
      body: { id: q.id, stem: q.text, options: q.options, correct: q.correct_answer },
    });
  }
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
    // Progress gains use the Medica-Score-eligible (server_issued) tier —
    // seed a real server-issued reservation for each session's
    // clientSessionId so both sessions classify as server_issued, not
    // merely client_selected_verified (bank-matched question ids alone).
    const { token, userId } = await registerAndGetUser();
    const clientSessionId1 = '11111111-1111-4111-a111-111111111111';
    const clientSessionId2 = '22222222-2222-4222-a222-222222222222';
    await repos.examSessionReservations.create({
      userId, clientSessionId: clientSessionId1, questions: sampleSession.questions, source: 'server_issued',
    });
    await repos.examSessionReservations.create({
      userId, clientSessionId: clientSessionId2, questions: sampleSession.questions, source: 'server_issued',
    });

    await request(app).post('/api/exams').set('Authorization', `Bearer ${token}`).send({ ...sampleSession, clientSessionId: clientSessionId1 });
    await request(app).post('/api/exams').set('Authorization', `Bearer ${token}`).send({
      ...sampleSession,
      clientSessionId: clientSessionId2,
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
