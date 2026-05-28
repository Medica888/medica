import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';

const app = createApp();

async function registerAndGetToken(): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email: `flash_${Date.now()}@example.com`,
    name: 'Flash User',
    password: 'password123',
  });
  return res.body.token as string;
}

const sampleCards = {
  flashcards: [
    {
      source_question_id: 'q1',
      type: 'Recall',
      front: 'What is hypertension?',
      back: 'Elevated blood pressure above 130/80 mmHg.',
      tag: 'Cardiovascular',
    },
    {
      source_question_id: 'q1',
      type: 'Pearl',
      front: 'Key pearl for hypertension management',
      back: 'ACE inhibitors are first-line for diabetic patients.',
      tag: 'Pharmacology',
    },
  ],
};

beforeEach(() => {
  setRepositories(createInMemoryRepositories());
});

describe('POST /api/flashcards', () => {
  it('creates flashcards', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    expect(res.status).toBe(201);
    expect(res.body.flashcards.length).toBe(2);
    expect(res.body.flashcards[0].review_status).toBe('new');
  });
});

describe('GET /api/flashcards', () => {
  it('returns user flashcards', async () => {
    const token = await registerAndGetToken();
    await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    const res = await request(app)
      .get('/api/flashcards')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.flashcards.length).toBe(2);
  });
});

describe('PATCH /api/flashcards/:id/status', () => {
  it('updates review status', async () => {
    const token = await registerAndGetToken();
    const created = await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    const id = created.body.flashcards[0].id as string;
    const res = await request(app)
      .patch(`/api/flashcards/${id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'mastered' });
    expect(res.status).toBe(200);
    expect(res.body.flashcard.review_status).toBe('mastered');
  });
});

describe('POST /api/flashcards/:id/review', () => {
  it('marks card as reviewed', async () => {
    const token = await registerAndGetToken();
    const created = await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    const id = created.body.flashcards[0].id as string;
    const res = await request(app)
      .post(`/api/flashcards/${id}/review`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.flashcard.reviewed_at).toBeDefined();
  });
});

describe('DELETE /api/flashcards', () => {
  it('clears all flashcards for user', async () => {
    const token = await registerAndGetToken();
    await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    const res = await request(app)
      .delete('/api/flashcards')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(2);
  });
});
