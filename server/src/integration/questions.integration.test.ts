import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { InMemoryQuestionsRepository } from '../repositories/memory/QuestionsRepository.js';
import { PgQuestionsRepository } from '../repositories/pg/QuestionsRepository.js';
import type { IQuestionsRepository } from '../repositories/interfaces.js';
import { createTestPool, truncateAll } from './helpers.js';

function makeQuestionData(overrides: Record<string, unknown> = {}) {
  const externalId = `fp-${randomUUID()}`;
  return {
    externalId,
    data: {
      subject:     'Pathology',
      system:      'Cardiovascular',
      body:        { stem: 'A 45-year-old...', bankStatus: 'validated_generated', source: 'ai' } as Record<string, unknown>,
      source:      'ai',
      bankStatus:  'validated_generated',
      mode:        'exam',
      difficulty:  'Medium',
      ...overrides,
    } as {
      subject: string;
      system: string;
      body: Record<string, unknown>;
      source: string;
      bankStatus: string;
      mode?: string;
      difficulty?: string;
      validationScore?: number | null;
      validatedAt?: Date | string | null;
    },
  };
}

// ─── Shared contract suite ─────────────────────────────────────────────────────

function runQuestionsContractSuite(label: string, setup: () => Promise<IQuestionsRepository>) {
  describe(label, () => {
    let repo: IQuestionsRepository;

    beforeEach(async () => { repo = await setup(); });

    it('upsertByExternalId creates a new record and returns an id', async () => {
      const { externalId, data } = makeQuestionData();
      const result = await repo.upsertByExternalId(externalId, data);
      expect(result.id).toBeTruthy();
    });

    it('upsertByExternalId returns the same id on conflict (ON CONFLICT UPDATE)', async () => {
      const { externalId, data } = makeQuestionData();
      const first  = await repo.upsertByExternalId(externalId, data);
      const second = await repo.upsertByExternalId(externalId, { ...data, subject: 'Physiology' });
      expect(second.id).toBe(first.id);
    });

    it('findByExternalId returns null for unknown id', async () => {
      expect(await repo.findByExternalId('no-such-id')).toBeNull();
    });

    it('findByExternalId returns the record after upsert', async () => {
      const { externalId, data } = makeQuestionData();
      const { id } = await repo.upsertByExternalId(externalId, data);
      const found = await repo.findByExternalId(externalId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(id);
    });

    it('updateGeneratedBankStatus changes bankStatus and syncs body.bankStatus', async () => {
      const { externalId, data } = makeQuestionData({ bankStatus: 'validated_generated' });
      await repo.upsertByExternalId(externalId, data);
      const updated = await repo.updateGeneratedBankStatus(externalId, 'approved');
      expect(updated).not.toBeNull();
      expect(updated!['bankStatus']).toBe('approved');
      expect((updated!['body'] as Record<string, unknown>)['bankStatus']).toBe('approved');
    });

    it('updateGeneratedBankStatus returns null for non-existent externalId', async () => {
      expect(await repo.updateGeneratedBankStatus('no-such', 'approved')).toBeNull();
    });

    it('findGeneratedBankReview filters by status', async () => {
      const { externalId: e1, data: d1 } = makeQuestionData({ bankStatus: 'validated_generated' });
      const { externalId: e2, data: d2 } = makeQuestionData({ bankStatus: 'approved' });
      await repo.upsertByExternalId(e1, d1);
      await repo.upsertByExternalId(e2, d2);
      const pending = await repo.findGeneratedBankReview({ status: 'validated_generated' });
      expect(pending).toHaveLength(1);
      expect(pending[0]['bankStatus']).toBe('validated_generated');
    });

    it('countGeneratedBankReview matches findGeneratedBankReview length', async () => {
      const { externalId: e1, data: d1 } = makeQuestionData({ bankStatus: 'validated_generated' });
      const { externalId: e2, data: d2 } = makeQuestionData({ bankStatus: 'validated_generated' });
      const { externalId: e3, data: d3 } = makeQuestionData({ bankStatus: 'approved' });
      await Promise.all([
        repo.upsertByExternalId(e1, d1),
        repo.upsertByExternalId(e2, d2),
        repo.upsertByExternalId(e3, d3),
      ]);
      const count = await repo.countGeneratedBankReview({ status: 'validated_generated' });
      const list  = await repo.findGeneratedBankReview({ status: 'validated_generated' });
      expect(count).toBe(list.length);
      expect(count).toBe(2);
    });

    it('getGeneratedBankMetrics approvalRate = (approved + restored) / reviewable', async () => {
      const { externalId: e1, data: d1 } = makeQuestionData({ bankStatus: 'approved' });
      const { externalId: e2, data: d2 } = makeQuestionData({ bankStatus: 'restored' });
      const { externalId: e3, data: d3 } = makeQuestionData({ bankStatus: 'validated_generated' });
      const { externalId: e4, data: d4 } = makeQuestionData({ bankStatus: 'quarantined' });
      await Promise.all([
        repo.upsertByExternalId(e1, d1),
        repo.upsertByExternalId(e2, d2),
        repo.upsertByExternalId(e3, d3),
        repo.upsertByExternalId(e4, d4),
      ]);
      const metrics = await repo.getGeneratedBankMetrics();
      expect(metrics.approved).toBe(1);
      expect(metrics.restored).toBe(1);
      expect(metrics.quarantined).toBe(1);
      expect(metrics.validatedGenerated).toBe(1);
      // 4 reviewable; 2 approved+restored → 0.5
      expect(metrics.approvalRate).toBeCloseTo(0.5);
      expect(metrics.quarantineRate).toBeCloseTo(0.25);
    });

    it('getGeneratedBankMetrics returns zeros when no questions exist', async () => {
      const metrics = await repo.getGeneratedBankMetrics();
      expect(metrics.total).toBe(0);
      expect(metrics.approvalRate).toBe(0);
      expect(metrics.quarantineRate).toBe(0);
    });

    it('markUsedByExternalIds increments usage count', async () => {
      const { externalId, data } = makeQuestionData();
      await repo.upsertByExternalId(externalId, data);
      await repo.markUsedByExternalIds([externalId]);
      const metrics = await repo.getGeneratedBankMetrics();
      expect(metrics.used).toBe(1);
      expect(metrics.totalUsage).toBe(1);
    });

    it('markUsedByExternalIds is idempotent for unknown ids', async () => {
      await expect(repo.markUsedByExternalIds(['no-such'])).resolves.not.toThrow();
    });
  });
}

// ─── InMemory run ──────────────────────────────────────────────────────────────

describe('QuestionsRepository contract', () => {
  runQuestionsContractSuite(
    'InMemoryQuestionsRepository',
    async () => new InMemoryQuestionsRepository(),
  );

  // ─── PostgreSQL run ──────────────────────────────────────────────────────────

  describe('PgQuestionsRepository', () => {
    let pool: Pool;

    beforeAll(() => { pool = createTestPool(); });
    afterAll(async () => { await pool.end(); });

    runQuestionsContractSuite('contract', async () => {
      await truncateAll(pool);
      return new PgQuestionsRepository(pool);
    });

    // ─── PG-only: ON CONFLICT updates all changed fields ────────────────────

    it('upsertByExternalId updates subject+system on conflict', async () => {
      await truncateAll(pool);
      const repo = new PgQuestionsRepository(pool);
      const eid = `fp-${randomUUID()}`;
      const baseData = {
        subject: 'Pathology', system: 'Cardiovascular',
        body: { source: 'ai', bankStatus: 'validated_generated' } as Record<string, unknown>,
        source: 'ai', bankStatus: 'validated_generated',
      };
      await repo.upsertByExternalId(eid, baseData);
      await repo.upsertByExternalId(eid, { ...baseData, subject: 'Physiology', system: 'Renal' });
      const rows = await repo.findGeneratedBankReview({ externalId: eid });
      expect(rows[0]['subject']).toBe('Physiology');
      expect(rows[0]['system']).toBe('Renal');
    });

    // ─── PG-only: generatedLast7d computation ───────────────────────────────

    it('getGeneratedBankMetrics generatedLast7d counts questions created in last 7 days', async () => {
      await truncateAll(pool);
      const repo = new PgQuestionsRepository(pool);
      // Insert one recent (now) and one old (8 days ago via raw SQL)
      const { externalId: recent, data: recentData } = makeQuestionData();
      await repo.upsertByExternalId(recent, recentData);
      const oldEid = `fp-old-${randomUUID()}`;
      await pool.query(
        `INSERT INTO questions (external_id, subject, system, body, source, bank_status, created_at)
         VALUES ($1,'Pathology','Cardiovascular','{"source":"ai"}'::jsonb,'ai','validated_generated', now()-interval '8 days')`,
        [oldEid],
      );
      const metrics = await repo.getGeneratedBankMetrics();
      expect(metrics.generatedLast7d).toBe(1);
      expect(metrics.total).toBe(2);
    });

    // ─── PG-only: jsonb_set syncs body.bankStatus ────────────────────────────

    it('updateGeneratedBankStatus uses jsonb_set to sync body.bankStatus', async () => {
      await truncateAll(pool);
      const repo = new PgQuestionsRepository(pool);
      const eid = `fp-${randomUUID()}`;
      await repo.upsertByExternalId(eid, {
        subject: 'Pathology', system: 'Cardiovascular',
        body: { source: 'ai', bankStatus: 'validated_generated', stem: 'A patient...' } as Record<string, unknown>,
        source: 'ai', bankStatus: 'validated_generated',
      });
      await repo.updateGeneratedBankStatus(eid, 'approved');
      // Read back via raw query to confirm jsonb was updated in-place
      const res = await pool.query<{ body: Record<string, unknown> }>(
        `SELECT body FROM questions WHERE external_id = $1`,
        [eid],
      );
      expect(res.rows[0].body['bankStatus']).toBe('approved');
      expect(res.rows[0].body['stem']).toBe('A patient...');  // other body fields preserved
    });
  });
});
