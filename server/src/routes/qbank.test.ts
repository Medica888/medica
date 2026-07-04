import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories, type Repositories } from '../repositories/index.js';
import { computeQuestionFingerprint } from '../lib/questionFingerprint.js';

const app = createApp();

let repos: Repositories;

async function registerAndGetToken(): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email: `user_${Date.now()}_${Math.random()}@example.com`,
    name: 'QBank User',
    password: 'password123',
  });
  return res.body.token as string;
}

async function seedAuthored(externalId: string, overrides: Record<string, unknown> = {}) {
  await repos.questions.upsertByExternalId(externalId, {
    subject: 'Cardiology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    body: { stem: `stem ${externalId}`, options: [{ letter: 'A', text: 'x' }], correct: 'A' },
    source: 'authored',
    bankStatus: 'approved',
    ...overrides,
  });
}

async function reportAsQuarantined(fingerprint: string) {
  await repos.questionReports.create({
    user_id: null,
    question_id: null,
    fingerprint,
    reason: 'duplicate',
    source: null,
    mode: null,
    difficulty: null,
    requested_subject: null,
    requested_system: null,
    requested_topic: null,
    actual_subject: null,
    actual_system: null,
    actual_topic: null,
    tested_concept: null,
    usmle_content_area: null,
    physician_task: null,
    stem_preview: null,
  });
}

beforeEach(() => {
  repos = createInMemoryRepositories();
  setRepositories(repos);
});

describe('GET /api/qbank/catalog', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/qbank/catalog');
    expect(res.status).toBe(401);
  });

  it('returns an empty catalog when nothing is seeded', async () => {
    const token = await registerAndGetToken();
    const res = await request(app).get('/api/qbank/catalog').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('returns authored questions stripped of answer fields', async () => {
    await seedAuthored('q1');
    const token = await registerAndGetToken();
    const res = await request(app).get('/api/qbank/catalog').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const question = res.body.data[0];
    expect(question.id).toBe('q1');
    expect(question).not.toHaveProperty('correct');
  });

  it('excludes AI-generated and non-approved authored questions', async () => {
    await seedAuthored('q1');
    await repos.questions.upsertByExternalId('q2', {
      subject: 'Cardiology', system: 'Cardiovascular',
      body: { stem: 'ai stem' }, source: 'ai', bankStatus: 'approved',
    });
    await seedAuthored('q3', { bankStatus: 'legacy' });
    const token = await registerAndGetToken();
    const res = await request(app).get('/api/qbank/catalog').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.map((q: { id: string }) => q.id)).toEqual(['q1']);
  });

  it('applies subject/system/difficulty filters', async () => {
    await seedAuthored('q1');
    await seedAuthored('q2', { subject: 'Neurology', system: 'Nervous' });
    const token = await registerAndGetToken();
    const res = await request(app)
      .get('/api/qbank/catalog')
      .query({ subject: 'Neurology' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.map((q: { id: string }) => q.id)).toEqual(['q2']);
  });

  it('excludes questions whose content fingerprint is cross-user quarantined, with accurate totals', async () => {
    await seedAuthored('q1', { body: { stem: 'quarantined stem', testedConcept: 'bad concept', options: [], correct: 'A' } });
    await seedAuthored('q2', { body: { stem: 'clean stem', testedConcept: 'good concept', options: [], correct: 'A' } });
    await reportAsQuarantined(computeQuestionFingerprint('quarantined stem', 'bad concept'));

    const token = await registerAndGetToken();
    const res = await request(app).get('/api/qbank/catalog').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.map((q: { id: string }) => q.id)).toEqual(['q2']);
    expect(res.body.total).toBe(1);
  });

  it('supports a search query param matching stem/testedConcept/topic/subject/system', async () => {
    await seedAuthored('q1', { body: { stem: 'a rare pericarditis vignette', options: [], correct: 'A' } });
    await seedAuthored('q2', { body: { stem: 'unrelated stem', options: [], correct: 'A' } });
    const token = await registerAndGetToken();
    const res = await request(app)
      .get('/api/qbank/catalog')
      .query({ search: 'pericarditis' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.map((q: { id: string }) => q.id)).toEqual(['q1']);
  });

  it('never returns raw option fields beyond letter/text, even if the stored body has extra keys', async () => {
    await seedAuthored('q1', {
      body: {
        stem: 'stem q1',
        options: [
          { letter: 'A', text: 'Right answer', isCorrect: true, correct: true, explanation: 'secret', metadata: { hidden: true } },
          { letter: 'B', text: 'Wrong answer', isCorrect: false },
        ],
        correct: 'A',
        explanation: 'top-level secret',
      },
    });
    const token = await registerAndGetToken();
    const res = await request(app).get('/api/qbank/catalog').set('Authorization', `Bearer ${token}`);
    const [question] = res.body.data;
    expect(question.options).toEqual([
      { letter: 'A', text: 'Right answer' },
      { letter: 'B', text: 'Wrong answer' },
    ]);
    expect(JSON.stringify(question)).not.toMatch(/isCorrect|explanation|metadata|secret/);
  });
});

describe('POST /api/qbank/sessions', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).post('/api/qbank/sessions').send({ ids: ['q1'] });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty id list', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/qbank/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [] });
    expect(res.status).toBe(400);
  });

  it('returns 400 for more than 40 ids', async () => {
    const token = await registerAndGetToken();
    const ids = Array.from({ length: 41 }, (_, i) => `q${i}`);
    const res = await request(app)
      .post('/api/qbank/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids });
    expect(res.status).toBe(400);
  });

  it('returns 409 when a selected id is no longer available', async () => {
    await seedAuthored('q1');
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/qbank/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: ['q1', 'missing'] });
    expect(res.status).toBe(409);
  });

  it('returns 400 for duplicate ids instead of silently deduping', async () => {
    await seedAuthored('q1');
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/qbank/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: ['q1', 'q1'] });
    expect(res.status).toBe(400);
  });

  it('returns 409 and no partial session when a selected question is cross-user quarantined', async () => {
    await seedAuthored('q1', { body: { stem: 'clean stem', testedConcept: 'good concept', options: [], correct: 'A' } });
    await seedAuthored('q2', { body: { stem: 'quarantined stem', testedConcept: 'bad concept', options: [], correct: 'A' } });
    await reportAsQuarantined(computeQuestionFingerprint('quarantined stem', 'bad concept'));

    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/qbank/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: ['q1', 'q2'] });
    expect(res.status).toBe(409);
    expect(res.body.questions).toBeUndefined();
  });

  it('returns full question bodies for a valid selection', async () => {
    await seedAuthored('q1');
    await seedAuthored('q2');
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/qbank/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: ['q2', 'q1'] });
    expect(res.status).toBe(201);
    expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual(['q2', 'q1']);
    expect(res.body.questions[0].body.correct).toBe('A');
  });
});
