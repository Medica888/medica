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

describe('POST /api/flashcards — full-fidelity fields round-trip', () => {
  it('stores and returns all v9 metadata fields', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        flashcards: [{
          source_question_id:     'q-full',
          type:                   'Recall',
          front:                  'What causes hypertensive urgency?',
          back:                   'Severely elevated BP without acute end-organ damage.',
          tag:                    'Cardiovascular',
          subject:                'Internal Medicine',
          system:                 'Cardiovascular',
          topic:                  'Hypertension',
          canonical_topic:        'Hypertensive Crises',
          topic_slug:             'hypertensive-crises',
          source_mode:            'practice',
          memory_anchor:          'No organ damage = urgency',
          common_trap:            'Confusing urgency with emergency',
          source_pearl:           'DBP > 120 alone does not define emergency',
          weak_spot_category:     'Cardiovascular',
          reinforcement_priority: 'high',
          review_count:           0,
          ease:                   null,
          last_missed_reason:     null,
        }],
      });
    expect(res.status).toBe(201);
    const card = res.body.flashcards[0];
    expect(card.subject).toBe('Internal Medicine');
    expect(card.system).toBe('Cardiovascular');
    expect(card.topic).toBe('Hypertension');
    expect(card.canonical_topic).toBe('Hypertensive Crises');
    expect(card.topic_slug).toBe('hypertensive-crises');
    expect(card.source_mode).toBe('practice');
    expect(card.memory_anchor).toBe('No organ damage = urgency');
    expect(card.common_trap).toBe('Confusing urgency with emergency');
    expect(card.source_pearl).toBe('DBP > 120 alone does not define emergency');
    expect(card.weak_spot_category).toBe('Cardiovascular');
    expect(card.reinforcement_priority).toBe('high');
    expect(card.review_count).toBe(0);
    expect(card.ease).toBeNull();
    expect(card.last_missed_reason).toBeNull();
  });

  it('accepts minimal card without new fields (backward compat)', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    expect(res.status).toBe(201);
    const card = res.body.flashcards[0];
    expect(card.review_count).toBe(0);
    expect(card.reinforcement_priority).toBe('normal');
  });
});

describe('POST /api/flashcards/:id/review — review_count increment', () => {
  it('increments review_count on each review', async () => {
    const token = await registerAndGetToken();
    const created = await request(app)
      .post('/api/flashcards')
      .set('Authorization', `Bearer ${token}`)
      .send(sampleCards);
    const id = created.body.flashcards[0].id as string;

    const first = await request(app)
      .post(`/api/flashcards/${id}/review`)
      .set('Authorization', `Bearer ${token}`);
    expect(first.status).toBe(200);
    expect(first.body.flashcard.review_count).toBe(1);

    const second = await request(app)
      .post(`/api/flashcards/${id}/review`)
      .set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.flashcard.review_count).toBe(2);
  });
});
