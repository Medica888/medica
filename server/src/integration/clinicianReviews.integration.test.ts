import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { InMemoryClinicianReviewsRepository } from '../repositories/memory/ClinicianReviewsRepository.js';
import { PgClinicianReviewsRepository } from '../repositories/pg/ClinicianReviewsRepository.js';
import type { IClinicianReviewsRepository } from '../repositories/interfaces.js';
import type { ClinicianReviewPriority } from '../types/index.js';
import { createTestPool, truncateAll } from './helpers.js';

function makeReviewData(
  priority: ClinicianReviewPriority = 'medium',
  dueOffset = 7 * 24 * 3600_000,
  overrides: Record<string, unknown> = {},
) {
  return {
    question_id:   `q-${randomUUID()}`,
    review_priority: priority,
    review_reason: `Test review — ${priority}`,
    review_due_at: new Date(Date.now() + dueOffset),
    ...overrides,
  };
}

// ─── Shared contract suite ─────────────────────────────────────────────────────

function runClinicianReviewsContractSuite(label: string, setup: () => Promise<IClinicianReviewsRepository>) {
  describe(label, () => {
    let repo: IClinicianReviewsRepository;

    beforeEach(async () => { repo = await setup(); });

    it('create returns a review with assigned id and pending status', async () => {
      const review = await repo.create(makeReviewData());
      expect(review.id).toBeTruthy();
      expect(review.review_status).toBe('pending');
      expect(review.reviewed_at).toBeNull();
      expect(review.reviewer_notes).toBeNull();
    });

    it('findLatestActiveByQuestionId returns the created review', async () => {
      const data = makeReviewData('high');
      const created = await repo.create(data);
      const found = await repo.findLatestActiveByQuestionId(data.question_id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
      expect(found!.review_priority).toBe('high');
    });

    it('findLatestActiveByQuestionId returns null for unknown question', async () => {
      expect(await repo.findLatestActiveByQuestionId('no-such-q')).toBeNull();
    });

    it('findLatestActiveByQuestionId ignores completed reviews', async () => {
      const data = makeReviewData();
      const review = await repo.create(data);
      // Complete the review
      await repo.update(review.id, { review_status: 'approved', reviewed_at: new Date() });
      // Now it should not be returned as active
      expect(await repo.findLatestActiveByQuestionId(data.question_id)).toBeNull();
    });

    it('findQueue returns reviews ordered by priority (critical before high before medium)', async () => {
      await repo.create(makeReviewData('medium'));
      await repo.create(makeReviewData('critical'));
      await repo.create(makeReviewData('high'));
      const queue = await repo.findQueue({});
      expect(queue).toHaveLength(3);
      expect(queue[0].review_priority).toBe('critical');
      expect(queue[1].review_priority).toBe('high');
      expect(queue[2].review_priority).toBe('medium');
    });

    it('findQueue filters by status', async () => {
      const r1 = await repo.create(makeReviewData('high'));
      const r2 = await repo.create(makeReviewData('medium'));
      await repo.update(r2.id, { review_status: 'in_review' });
      const pending = await repo.findQueue({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(r1.id);
    });

    it('findQueue overdue filter returns only past-due active reviews', async () => {
      // Overdue review (due in past)
      const overdue = await repo.create(makeReviewData('critical', -3600_000));
      // Future review
      await repo.create(makeReviewData('high', 7 * 24 * 3600_000));
      const queue = await repo.findQueue({ overdue: true });
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe(overdue.id);
    });

    it('findQueue overdue filter excludes completed reviews', async () => {
      const r = await repo.create(makeReviewData('critical', -3600_000)); // past due
      await repo.update(r.id, { review_status: 'approved', reviewed_at: new Date() });
      const queue = await repo.findQueue({ overdue: true });
      expect(queue).toHaveLength(0);
    });

    it('countQueue matches findQueue length', async () => {
      await repo.create(makeReviewData('critical'));
      await repo.create(makeReviewData('high'));
      await repo.create(makeReviewData('medium'));
      const count = await repo.countQueue({});
      const list  = await repo.findQueue({});
      expect(count).toBe(list.length);
      expect(count).toBe(3);
    });

    it('findQueue respects limit and offset', async () => {
      for (let i = 0; i < 5; i++) await repo.create(makeReviewData('medium'));
      const page1 = await repo.findQueue({ limit: 2, offset: 0 });
      const page2 = await repo.findQueue({ limit: 2, offset: 2 });
      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(2);
      // Ids should not overlap
      const ids1 = page1.map(r => r.id);
      const ids2 = page2.map(r => r.id);
      expect(ids1.some(id => ids2.includes(id))).toBe(false);
    });

    it('update changes the requested fields only', async () => {
      const review = await repo.create(makeReviewData('low'));
      const updated = await repo.update(review.id, {
        review_status: 'in_review',
        reviewer_notes: 'Needs fact-check',
      });
      expect(updated).not.toBeNull();
      expect(updated!.review_status).toBe('in_review');
      expect(updated!.reviewer_notes).toBe('Needs fact-check');
      // Priority unchanged
      expect(updated!.review_priority).toBe('low');
    });

    it('update returns null for non-existent review', async () => {
      expect(await repo.update(randomUUID(), { review_status: 'approved' })).toBeNull();
    });

    it('getMetrics counts pending and in_review correctly', async () => {
      await repo.create(makeReviewData('high'));
      const r2 = await repo.create(makeReviewData('medium'));
      await repo.update(r2.id, { review_status: 'in_review' });
      const metrics = await repo.getMetrics();
      expect(metrics.pending).toBe(1);
      expect(metrics.in_review).toBe(1);
    });

    it('getMetrics overdue counts only active past-due reviews', async () => {
      await repo.create(makeReviewData('critical', -3600_000));   // overdue
      await repo.create(makeReviewData('high',     7 * 24 * 3600_000)); // future
      const metrics = await repo.getMetrics();
      expect(metrics.overdue).toBe(1);
      expect(metrics.critical_overdue).toBe(1);
      expect(metrics.high_overdue).toBe(0);
    });

    it('getMetrics completion_rate is null when no reviews exist', async () => {
      const metrics = await repo.getMetrics();
      expect(metrics.completion_rate).toBeNull();
    });

    it('getMetrics completion_rate reflects proportion of completed reviews', async () => {
      const r1 = await repo.create(makeReviewData('high'));
      await repo.create(makeReviewData('medium'));
      await repo.update(r1.id, { review_status: 'approved', reviewed_at: new Date() });
      const metrics = await repo.getMetrics();
      // 1 completed of 2 total = 50%
      expect(metrics.completion_rate).toBeCloseTo(50);
    });

    it('getMetrics average_age_days is null when no active reviews exist', async () => {
      const r = await repo.create(makeReviewData());
      await repo.update(r.id, { review_status: 'approved', reviewed_at: new Date() });
      const metrics = await repo.getMetrics();
      expect(metrics.average_age_days).toBeNull();
    });
  });
}

// ─── InMemory run ──────────────────────────────────────────────────────────────

describe('ClinicianReviewsRepository contract', () => {
  runClinicianReviewsContractSuite(
    'InMemoryClinicianReviewsRepository',
    async () => new InMemoryClinicianReviewsRepository(),
  );

  // ─── PostgreSQL run ──────────────────────────────────────────────────────────

  describe('PgClinicianReviewsRepository', () => {
    let pool: Pool;

    beforeAll(() => { pool = createTestPool(); });
    afterAll(async () => { await pool.end(); });

    runClinicianReviewsContractSuite('contract', async () => {
      await truncateAll(pool);
      return new PgClinicianReviewsRepository(pool);
    });

    // ─── PG-only: FILTER aggregates in getMetrics ────────────────────────────

    it('getMetrics average_age_days is a positive number for active reviews', async () => {
      await truncateAll(pool);
      const repo = new PgClinicianReviewsRepository(pool);
      // Insert a review with an old created_at via raw SQL so age is measurable
      const id = randomUUID();
      await pool.query(
        `INSERT INTO clinician_reviews
           (id, question_id, review_priority, review_reason, review_due_at, created_at)
         VALUES ($1, $2, 'medium', 'age test', now()+interval '7 days', now()-interval '2 days')`,
        [id, `q-${randomUUID()}`],
      );
      const metrics = await repo.getMetrics();
      expect(metrics.average_age_days).not.toBeNull();
      expect(metrics.average_age_days!).toBeGreaterThan(1.5);
      expect(metrics.average_age_days!).toBeLessThan(3);
    });

    // ─── PG-only: priority CASE ordering via SQL ────────────────────────────

    it('findQueue orders critical → high → medium → low using CASE expression', async () => {
      await truncateAll(pool);
      const repo = new PgClinicianReviewsRepository(pool);
      await repo.create(makeReviewData('low'));
      await repo.create(makeReviewData('medium'));
      await repo.create(makeReviewData('critical'));
      await repo.create(makeReviewData('high'));
      const queue = await repo.findQueue({});
      expect(queue[0].review_priority).toBe('critical');
      expect(queue[1].review_priority).toBe('high');
      expect(queue[2].review_priority).toBe('medium');
      expect(queue[3].review_priority).toBe('low');
    });

    // ─── PG-only: dynamic SET in update ─────────────────────────────────────

    it('update with no fields still returns the existing review (updated_at bumps)', async () => {
      await truncateAll(pool);
      const repo = new PgClinicianReviewsRepository(pool);
      const review = await repo.create(makeReviewData());
      // update with no fields — should still return (just bumps updated_at)
      const result = await repo.update(review.id, {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe(review.id);
    });
  });
});
