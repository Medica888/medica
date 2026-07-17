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

let repos: ReturnType<typeof createInMemoryRepositories>;

beforeEach(() => {
  repos = createInMemoryRepositories();
  setRepositories(repos);
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

  it('returns backend-computed results instead of trusting client score fields', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...sampleSession,
        answers: { q1: 'B' },
        score: 1,
        percentage: 100,
        medica_score: 100,
        readiness_label: 'Strong',
        missed_questions: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.session.score).toBe(0);
    expect(res.body.session.percentage).toBe(0);
    expect(res.body.session.readiness_label).toBe('Needs Foundation');
    expect(res.body.session.missed_questions).toHaveLength(1);
  });

  it('ignores a client-supplied integrity_status field — the server computes its own value regardless of what the request body claims', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...sampleSession,
        // No reservation, no authoritative bank match for q1 in this test —
        // the honest classification is unverified_local. A client claiming
        // server_issued in the body must not be able to launder that in.
        integrity_status: 'server_issued',
        status: 'verified',
        verifiedAt: new Date().toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.session.integrity_status).toBe('unverified_local');
  });

  it('rejects duplicate question ids before persistence', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...sampleSession,
        questions: [sampleSession.questions[0], { ...sampleSession.questions[0] }],
      });

    expect(res.status).toBe(400);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/exams').send(sampleSession);
    expect(res.status).toBe(401);
  });

  it('skips the fire-and-forget mastery snapshot for an unverified_local session, even when the user already has mastery history', async () => {
    const token = await registerAndGetToken();
    const concept = { ...sampleSession.questions[0], id: 'q-mastery-concept', canonicalConcepts: ['Route Gate Concept'] };

    // Session 1: trusted — seed the question as an authoritative bank match so
    // this session classifies as client_selected_verified (mode alone no longer
    // grants trust; see sessionIntegrity.ts). Establishes a real mastery
    // snapshot batch tied to session 1's id.
    await repos.questions.upsertByExternalId('q-mastery-concept', {
      subject: 'Physiology', system: 'Cardiovascular', source: 'authored', bankStatus: 'approved',
      body: { id: 'q-mastery-concept', stem: concept.text, options: concept.options, correct: concept.correct_answer },
    });
    const first = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...sampleSession, questions: [concept], answers: { [concept.id]: 'A' } });
    expect(first.status).toBe(201);
    await new Promise((r) => setTimeout(r, 10));

    const batchesAfterFirst = await repos.masterySnapshots.findBatchIds(first.body.session.user_id);
    expect(batchesAfterFirst).toEqual([first.body.session.id]);

    // Session 2: a DIFFERENT question id that never resolves authoritatively
    // (and no reservation) — classifies as unverified_local regardless of
    // mode. Even though this user already HAS mastery rows the snapshot
    // pipeline could read, the route must not create a NEW snapshot batch
    // tagged with this untrusted session.
    const unverifiedConcept = { ...concept, id: 'q-mastery-concept-unverified' };
    const second = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...sampleSession, mode: 'exam', questions: [unverifiedConcept], answers: { [unverifiedConcept.id]: 'A' } });
    expect(second.status).toBe(201);
    expect(second.body.session.integrity_status).toBe('unverified_local');
    await new Promise((r) => setTimeout(r, 10));

    const batchesAfterSecond = await repos.masterySnapshots.findBatchIds(second.body.session.user_id);
    expect(batchesAfterSecond).toEqual([first.body.session.id]);
    expect(batchesAfterSecond).not.toContain(second.body.session.id);
  });
});

describe('POST /api/exams/reservations', () => {
  const aiQuestionId = 'ai-fp-route-test';

  async function seedAiQuestion() {
    await repos.questions.upsertByExternalId(aiQuestionId, {
      subject: 'Cardiology',
      system: 'Cardiovascular',
      source: 'ai',
      bankStatus: 'validated_generated',
      body: {
        id: aiQuestionId,
        subject: 'Cardiology',
        system: 'Cardiovascular',
        stem: 'Authoritative AI stem',
        options: [
          { letter: 'A', text: 'Distractor' },
          { letter: 'B', text: 'Correct' },
        ],
        correct: 'B',
      },
    });
  }

  it('reserves a snapshot and the response contains only { reserved, clientSessionId }', async () => {
    const token = await registerAndGetToken();
    await seedAiQuestion();
    const clientSessionId = '11111111-2222-4333-8444-555555555555';

    const res = await request(app)
      .post('/api/exams/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientSessionId, questionIds: [aiQuestionId] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ reserved: true, clientSessionId });
  });

  it('returns reserved:false (not an error) when a question id does not resolve', async () => {
    const token = await registerAndGetToken();
    const clientSessionId = '22222222-3333-4444-8555-666666666666';

    const res = await request(app)
      .post('/api/exams/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientSessionId, questionIds: ['never-seeded-id'] });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ reserved: false, clientSessionId });
  });

  it('returns 401 without a token', async () => {
    const res = await request(app)
      .post('/api/exams/reservations')
      .send({ clientSessionId: '33333333-4444-4555-8666-777777777777', questionIds: ['x'] });
    expect(res.status).toBe(401);
  });

  it('completion rejects with 409 SNAPSHOT_MISMATCH when submitted questions differ from the reservation', async () => {
    const token = await registerAndGetToken();
    await seedAiQuestion();
    const clientSessionId = '44444444-5555-4666-8777-888888888888';
    await request(app)
      .post('/api/exams/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientSessionId, questionIds: [aiQuestionId] });

    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...sampleSession,
        clientSessionId,
        questions: [{ ...sampleSession.questions[0], id: 'different-id' }],
        answers: { 'different-id': 'A' },
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SNAPSHOT_MISMATCH');
  });

  it('completion scores from the reserved snapshot, ignoring a tampered submitted correct_answer', async () => {
    const token = await registerAndGetToken();
    await seedAiQuestion();
    const clientSessionId = '55555555-6666-4777-8888-999999999999';
    await request(app)
      .post('/api/exams/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientSessionId, questionIds: [aiQuestionId] });

    const res = await request(app)
      .post('/api/exams')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...sampleSession,
        clientSessionId,
        questions: [{
          ...sampleSession.questions[0],
          id: aiQuestionId,
          text: 'Tampered stem',
          correct_answer: 'A',
        }],
        answers: { [aiQuestionId]: 'B' },
      });

    expect(res.status).toBe(201);
    expect(res.body.session.questions[0].text).toBe('Authoritative AI stem');
    expect(res.body.session.score).toBe(1);
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
