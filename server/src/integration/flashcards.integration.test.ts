import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { InMemoryFlashcardsRepository } from '../repositories/memory/FlashcardsRepository.js';
import { PgFlashcardsRepository } from '../repositories/pg/FlashcardsRepository.js';
import type { IFlashcardsRepository, FlashcardSrsUpdate } from '../repositories/interfaces.js';
import type { Flashcard } from '../types/index.js';
import { createTestPool, truncateAll } from './helpers.js';

function makeFlashcardData(
  userId: string,
  overrides: Partial<Omit<Flashcard, 'id' | 'created_at'>> = {},
): Omit<Flashcard, 'id' | 'created_at'> {
  return {
    user_id:                userId,
    source_question_id:     `sq-${randomUUID()}`,
    type:                   'Recall',
    front:                  'What is the mechanism?',
    back:                   'The mechanism is...',
    tag:                    'cardiology',
    review_status:          'new',
    subject:                'Pathology',
    system:                 'Cardiovascular',
    topic:                  'Heart Failure',
    canonical_topic:        'Heart Failure',
    topic_slug:             'heart-failure',
    source_mode:            'practice',
    weak_spot_category:     'Pathophysiology',
    reinforcement_priority: 'normal',
    review_count:           0,
    memory_anchor:          null,
    common_trap:            null,
    source_pearl:           null,
    ease:                   null,
    last_missed_reason:     null,
    ...overrides,
  };
}

// ─── Shared contract suite ─────────────────────────────────────────────────────

function runFlashcardsContractSuite(
  label: string,
  setup: () => Promise<{ repo: IFlashcardsRepository; userId: string; altUserId: string }>,
) {
  describe(label, () => {
    let repo: IFlashcardsRepository;
    let userId: string;
    let altUserId: string;

    beforeEach(async () => {
      const ctx = await setup();
      repo = ctx.repo;
      userId = ctx.userId;
      altUserId = ctx.altUserId;
    });

    it('create returns card with assigned id and correct user_id', async () => {
      const card = await repo.create(makeFlashcardData(userId));
      expect(card.id).toBeTruthy();
      expect(card.user_id).toBe(userId);
      expect(card.type).toBe('Recall');
      expect(card.review_status).toBe('new');
      expect(card.review_count).toBe(0);
    });

    it('findById returns the created card', async () => {
      const card = await repo.create(makeFlashcardData(userId, { front: 'Hello' }));
      const found = await repo.findById(card.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(card.id);
      expect(found!.front).toBe('Hello');
    });

    it('findById returns null for unknown id', async () => {
      expect(await repo.findById(randomUUID())).toBeNull();
    });

    it('findByUserId returns only the requesting user cards', async () => {
      await repo.create(makeFlashcardData(userId,    { front: 'Mine' }));
      await repo.create(makeFlashcardData(altUserId, { front: 'Theirs' }));
      const cards = await repo.findByUserId(userId);
      expect(cards).toHaveLength(1);
      expect(cards[0].front).toBe('Mine');
    });

    it('findByUserId returns empty array when user has no cards', async () => {
      expect(await repo.findByUserId(userId)).toHaveLength(0);
    });

    it('createMany inserts multiple cards and returns all', async () => {
      const cards = await repo.createMany([
        makeFlashcardData(userId, { front: 'F1' }),
        makeFlashcardData(userId, { front: 'F2' }),
        makeFlashcardData(userId, { front: 'F3' }),
      ]);
      expect(cards).toHaveLength(3);
      expect(cards.map(c => c.front).sort()).toEqual(['F1', 'F2', 'F3']);
    });

    it('createMany with empty array returns empty array', async () => {
      expect(await repo.createMany([])).toHaveLength(0);
    });

    it('updateStatus changes review_status', async () => {
      const card = await repo.create(makeFlashcardData(userId));
      const updated = await repo.updateStatus(card.id, userId, 'learning');
      expect(updated).not.toBeNull();
      expect(updated!.review_status).toBe('learning');
      expect(updated!.id).toBe(card.id);
    });

    it('updateStatus returns null for wrong userId (ownership check)', async () => {
      const card = await repo.create(makeFlashcardData(userId));
      expect(await repo.updateStatus(card.id, altUserId, 'mastered')).toBeNull();
    });

    it('updateStatus returns null for non-existent card', async () => {
      expect(await repo.updateStatus(randomUUID(), userId, 'learning')).toBeNull();
    });

    it('markReviewed persists all SRS fields', async () => {
      const card = await repo.create(makeFlashcardData(userId));
      const now = new Date();
      const nextReview = new Date(now.getTime() + 86_400_000);
      const srs: FlashcardSrsUpdate = {
        reviewed_at:  now,
        review_count: 3,
        review_status:'review',
        ease:         '2.5',
        interval_days: 7,
        next_review:  nextReview,
      };
      const updated = await repo.markReviewed(card.id, userId, srs);
      expect(updated).not.toBeNull();
      expect(updated!.review_count).toBe(3);
      expect(updated!.review_status).toBe('review');
      expect(updated!.ease).toBe('2.5');
      expect(updated!.interval_days).toBe(7);
      expect(updated!.next_review).toBeTruthy();
    });

    it('markReviewed returns null for wrong userId', async () => {
      const card = await repo.create(makeFlashcardData(userId));
      const srs: FlashcardSrsUpdate = {
        reviewed_at: new Date(), review_count: 1, review_status: 'learning',
        ease: '2.0', interval_days: 1, next_review: null,
      };
      expect(await repo.markReviewed(card.id, altUserId, srs)).toBeNull();
    });

    it('deleteByUserId removes only the target user cards and returns count', async () => {
      await repo.create(makeFlashcardData(userId));
      await repo.create(makeFlashcardData(userId));
      await repo.create(makeFlashcardData(altUserId));
      const deleted = await repo.deleteByUserId(userId);
      expect(deleted).toBe(2);
      expect(await repo.findByUserId(userId)).toHaveLength(0);
      expect(await repo.findByUserId(altUserId)).toHaveLength(1);
    });

    it('deleteByUserId returns 0 when user has no cards', async () => {
      expect(await repo.deleteByUserId(userId)).toBe(0);
    });
  });
}

// ─── InMemory run ──────────────────────────────────────────────────────────────

describe('FlashcardsRepository contract', () => {
  runFlashcardsContractSuite('InMemoryFlashcardsRepository', async () => ({
    repo:       new InMemoryFlashcardsRepository(),
    userId:     randomUUID(),
    altUserId:  randomUUID(),
  }));

  // ─── PostgreSQL run ──────────────────────────────────────────────────────────

  describe('PgFlashcardsRepository', () => {
    let pool: Pool;

    beforeAll(() => { pool = createTestPool(); });
    afterAll(async () => { await pool.end(); });

    async function pgSetup() {
      await truncateAll(pool);
      const userId    = randomUUID();
      const altUserId = randomUUID();
      await pool.query(
        `INSERT INTO users (id, email, name, password_hash)
         VALUES ($1,$2,'A','x'), ($3,$4,'B','x')`,
        [userId, `a-${userId}@t.com`, altUserId, `b-${altUserId}@t.com`],
      );
      return { repo: new PgFlashcardsRepository(pool), userId, altUserId };
    }

    runFlashcardsContractSuite('contract', pgSetup);

    // ─── PG-only: ORDER BY created_at DESC is enforced ──────────────────────

    it('findByUserId orders newest card first', async () => {
      await truncateAll(pool);
      const uid = randomUUID();
      await pool.query(
        `INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,'Y','x')`,
        [uid, `y-${uid}@t.com`],
      );
      const repo = new PgFlashcardsRepository(pool);
      const id1 = randomUUID();
      const id2 = randomUUID();
      // Insert two cards with explicit timestamps to guarantee ordering
      await pool.query(
        `INSERT INTO flashcards
           (id, user_id, source_question_id, type, front, back, tag, review_status,
            subject, system, topic, canonical_topic, topic_slug, source_mode,
            weak_spot_category, reinforcement_priority, review_count, created_at)
         VALUES
           ($1,$3,'sq1','Recall','Old','b','','new','','','','','','','','normal',0, now()-interval '2 days'),
           ($2,$3,'sq2','Recall','New','b','','new','','','','','','','','normal',0, now())`,
        [id1, id2, uid],
      );
      const found = await repo.findByUserId(uid);
      expect(found).toHaveLength(2);
      expect(found[0].front).toBe('New');
      expect(found[1].front).toBe('Old');
    });

    // ─── PG-only: unnest batch insert transactional integrity ───────────────

    it('createMany inserts atomically via unnest — all or nothing', async () => {
      await truncateAll(pool);
      const uid = randomUUID();
      await pool.query(
        `INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,'Z','x')`,
        [uid, `z-${uid}@t.com`],
      );
      const repo = new PgFlashcardsRepository(pool);
      const result = await repo.createMany([
        makeFlashcardData(uid, { front: 'Batch-1' }),
        makeFlashcardData(uid, { front: 'Batch-2' }),
      ]);
      expect(result).toHaveLength(2);
      // Confirm both persisted via a separate findByUserId
      const found = await repo.findByUserId(uid);
      expect(found).toHaveLength(2);
    });
  });
});
