import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { InMemoryQuestionsRepository } from '../repositories/memory/QuestionsRepository.js';
import { PgQuestionsRepository } from '../repositories/pg/QuestionsRepository.js';
import type { IQuestionsRepository } from '../repositories/interfaces.js';
import { createTestPool, truncateAll } from './helpers.js';

// Commercial-readiness metadata for fixtures that must clear findStudentCatalog's
// isCommerciallyContentReady gate (see reviewedContentMetadata.ts). Authored questions
// need this explicitly — bank_status alone is not sufficient since 698e41a.
const READY_METADATA = {
  reviewStatus: 'source_checked',
  sourceRefs: ['USMLE Content Outline'],
  medicalAccuracyStatus: 'pass',
};

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
      aiModel?: string | null;
      validatorVersion?: string | null;
      reviewMetadata?: Record<string, unknown> | null;
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

    it('persists AI model and validator version provenance', async () => {
      const { externalId, data } = makeQuestionData({
        aiModel: 'claude-test-model',
        validatorVersion: 'validator-test-v2',
      });
      await repo.upsertByExternalId(externalId, data);
      const rows = await repo.findGeneratedBankReview({ externalId, limit: 1 });
      expect(rows[0]['aiModel']).toBe('claude-test-model');
      expect(rows[0]['validatorVersion']).toBe('validator-test-v2');
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

    // ─── Authored questions are reviewable through the same governance endpoints ──
    // (see seedAuthoredQuestions.ts: frozen authored rows are "pending explicit
    // admin review via the governance endpoints" — this is that review path.)

    it('findGeneratedBankReview includes authored questions alongside ai questions', async () => {
      const { externalId: authored, data: authoredData } = makeQuestionData({ source: 'authored', bankStatus: 'approved' });
      const { externalId: aiSourced, data: aiData } = makeQuestionData({ source: 'ai', bankStatus: 'approved' });
      await repo.upsertByExternalId(authored, authoredData);
      await repo.upsertByExternalId(aiSourced, aiData);

      const rows = await repo.findGeneratedBankReview({ status: 'approved' });
      const ids = rows.map((r) => r['externalId']);
      expect(ids).toContain(authored);
      expect(ids).toContain(aiSourced);
    });

    it('findGeneratedBankReview excludes questions from sources other than ai/authored', async () => {
      const { externalId: legacy, data: legacyData } = makeQuestionData({ source: 'legacy', bankStatus: 'approved' });
      await repo.upsertByExternalId(legacy, legacyData);

      const rows = await repo.findGeneratedBankReview({ status: 'approved' });
      expect(rows.map((r) => r['externalId'])).not.toContain(legacy);
    });

    it('countGeneratedBankReview counts authored questions alongside ai questions', async () => {
      const { externalId: authored, data: authoredData } = makeQuestionData({ source: 'authored', bankStatus: 'approved' });
      const { externalId: aiSourced, data: aiData } = makeQuestionData({ source: 'ai', bankStatus: 'approved' });
      await repo.upsertByExternalId(authored, authoredData);
      await repo.upsertByExternalId(aiSourced, aiData);

      expect(await repo.countGeneratedBankReview({ status: 'approved' })).toBe(2);
    });

    it('updateGeneratedBankStatus updates an authored question status', async () => {
      const { externalId, data } = makeQuestionData({ source: 'authored', bankStatus: 'approved' });
      await repo.upsertByExternalId(externalId, data);

      const updated = await repo.updateGeneratedBankStatus(externalId, 'quarantined');
      expect(updated).not.toBeNull();
      expect(updated!['bankStatus']).toBe('quarantined');
    });

    it('updateGeneratedBankStatus returns null for a question with an unreviewable source', async () => {
      const { externalId, data } = makeQuestionData({ source: 'legacy', bankStatus: 'approved' });
      await repo.upsertByExternalId(externalId, data);

      expect(await repo.updateGeneratedBankStatus(externalId, 'quarantined')).toBeNull();
    });

    it('updateReviewedContentMetadata can make an authored question commercially ready', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', difficulty: 'Balanced',
        body: { stem: 'stem', options: [] },
      });
      await repo.upsertByExternalId(externalId, data);

      const updated = await repo.updateReviewedContentMetadata(externalId, {
        reviewStatus: 'source_checked',
        sourceRefs: ['First Aid 2025'],
        medicalAccuracyStatus: 'pass',
      });
      expect(updated).not.toBeNull();

      const catalog = await repo.findStudentCatalog({});
      expect(catalog.data.map((q) => q.id)).toContain(externalId);
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

    // ─── Student-safe catalog (findStudentCatalog / findByExternalIds) ─────────

    it('findStudentCatalog only returns authored questions with approved/restored status', async () => {
      const { externalId: authored, data: authoredData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: { stem: 'Authored stem', options: [{ letter: 'A', text: 'x' }], correct: 'A' },
      });
      const { externalId: restored, data: restoredData } = makeQuestionData({
        source: 'authored', bankStatus: 'restored', reviewMetadata: READY_METADATA,
        body: { stem: 'Restored stem', options: [], correct: 'A' },
      });
      const { externalId: pending, data: pendingData } = makeQuestionData({
        source: 'authored', bankStatus: 'legacy',
        body: { stem: 'Legacy stem', options: [], correct: 'A' },
      });
      const { externalId: aiSourced, data: aiData } = makeQuestionData({
        source: 'ai', bankStatus: 'approved',
        body: { stem: 'AI stem', options: [], correct: 'A' },
      });
      await Promise.all([
        repo.upsertByExternalId(authored, authoredData),
        repo.upsertByExternalId(restored, restoredData),
        repo.upsertByExternalId(pending, pendingData),
        repo.upsertByExternalId(aiSourced, aiData),
      ]);

      const result = await repo.findStudentCatalog({});
      const ids = result.data.map((q) => q.id);
      expect(ids).toContain(authored);
      expect(ids).toContain(restored);
      expect(ids).not.toContain(pending);
      expect(ids).not.toContain(aiSourced);
      expect(result.total).toBe(2);
    });

    it('findStudentCatalog strips answer-bearing fields from returned questions', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        subject: 'Cardiology', system: 'Cardiovascular', difficulty: 'Balanced',
        body: {
          stem: 'A patient presents with...',
          topic: 'Heart Failure',
          testedConcept: 'ARNI mechanism',
          options: [{ letter: 'A', text: 'ARNI' }],
          correct: 'A',
          explanation: 'ARNI is correct because...',
          optionExplanations: { A: 'ARNI explanation' },
        },
      });
      await repo.upsertByExternalId(externalId, data);

      const result = await repo.findStudentCatalog({});
      const found = result.data.find((q) => q.id === externalId)!;
      expect(found.subject).toBe('Cardiology');
      expect(found.stem).toBe('A patient presents with...');
      expect(found.options).toEqual([{ letter: 'A', text: 'ARNI' }]);
      expect(found).not.toHaveProperty('correct');
      expect(found).not.toHaveProperty('explanation');
      expect(found).not.toHaveProperty('optionExplanations');
    });

    it('findStudentCatalog filters by subject/system/difficulty', async () => {
      const { externalId: match, data: matchData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        subject: 'Anatomy', system: 'Musculoskeletal', difficulty: 'Hard',
        body: { stem: 'match', options: [] },
      });
      const { externalId: other, data: otherData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        subject: 'Anatomy', system: 'Cardiovascular', difficulty: 'Hard',
        body: { stem: 'other', options: [] },
      });
      await Promise.all([
        repo.upsertByExternalId(match, matchData),
        repo.upsertByExternalId(other, otherData),
      ]);

      const result = await repo.findStudentCatalog({ subject: 'Anatomy', system: 'Musculoskeletal' });
      expect(result.data.map((q) => q.id)).toEqual([match]);
    });

    it('findStudentCatalog paginates results', async () => {
      const entries = await Promise.all(
        Array.from({ length: 5 }, () => {
          const { externalId, data } = makeQuestionData({
            source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
            body: { stem: 'stem', options: [] },
          });
          return repo.upsertByExternalId(externalId, data);
        }),
      );
      expect(entries).toHaveLength(5);

      const page1 = await repo.findStudentCatalog({ page: 1, limit: 2 });
      expect(page1.data).toHaveLength(2);
      expect(page1.total).toBe(5);
      expect(page1.totalPages).toBe(3);

      const page3 = await repo.findStudentCatalog({ page: 3, limit: 2 });
      expect(page3.data).toHaveLength(1);
    });

    it('findByExternalIds returns full bodies only for safe authored questions', async () => {
      const { externalId: authored, data: authoredData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: { stem: 'Authored stem', correct: 'A' },
      });
      const { externalId: aiSourced, data: aiData } = makeQuestionData({
        source: 'ai', bankStatus: 'approved',
        body: { stem: 'AI stem', correct: 'A' },
      });
      await Promise.all([
        repo.upsertByExternalId(authored, authoredData),
        repo.upsertByExternalId(aiSourced, aiData),
      ]);

      const found = await repo.findByExternalIds([authored, aiSourced, 'no-such-id']);
      expect(found).toHaveLength(1);
      expect(found[0]!.id).toBe(authored);
      expect(found[0]!.body['correct']).toBe('A');
    });

    it('findByExternalIds returns an empty array for an empty input', async () => {
      expect(await repo.findByExternalIds([])).toEqual([]);
    });

    // ─── Catalog option sanitization ─────────────────────────────────────────

    it('findStudentCatalog strips answer-bearing fields from options, keeping only letter/text', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: {
          stem: 'stem', testedConcept: 'concept',
          options: [
            { letter: 'A', text: 'Right', isCorrect: true, correct: true, explanation: 'secret', metadata: { hidden: true } },
            { letter: 'B', text: 'Wrong', isCorrect: false },
          ],
        },
      });
      await repo.upsertByExternalId(externalId, data);

      const result = await repo.findStudentCatalog({});
      const found = result.data.find((q) => q.id === externalId)!;
      expect(found.options).toEqual([
        { letter: 'A', text: 'Right' },
        { letter: 'B', text: 'Wrong' },
      ]);
      expect(JSON.stringify(found.options)).not.toMatch(/isCorrect|explanation|metadata/);
    });

    it('findStudentCatalog tolerates a malformed (non-array) options value without crashing', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: { stem: 'stem', options: { not: 'an array' } },
      });
      await repo.upsertByExternalId(externalId, data);

      const result = await repo.findStudentCatalog({});
      const found = result.data.find((q) => q.id === externalId)!;
      expect(found.options).toEqual([]);
    });

    // ─── Cross-user quarantine (fingerprint exclusion) ──────────────────────

    it('findStudentCatalog excludes rows matching excludeFingerprints, with accurate totals', async () => {
      const { externalId: clean, data: cleanData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: { stem: 'clean stem', testedConcept: 'clean concept', options: [] },
      });
      const { externalId: dirty, data: dirtyData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: { stem: 'dirty stem', testedConcept: 'dirty concept', options: [] },
      });
      await repo.upsertByExternalId(clean, cleanData);
      await repo.upsertByExternalId(dirty, dirtyData);

      const dirtyFingerprint = 'dirty stem||dirty concept';
      const result = await repo.findStudentCatalog({ excludeFingerprints: [dirtyFingerprint] });
      expect(result.data.map((q) => q.id)).toEqual([clean]);
      expect(result.total).toBe(1);
    });

    it('findStudentCatalog with an empty excludeFingerprints list excludes nothing', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA,
        body: { stem: 'stem', options: [] },
      });
      await repo.upsertByExternalId(externalId, data);
      const result = await repo.findStudentCatalog({ excludeFingerprints: [] });
      expect(result.data.map((q) => q.id)).toContain(externalId);
    });

    it('findByExternalIds excludes rows matching excludeFingerprints', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved',
        body: { stem: 'dirty stem', testedConcept: 'dirty concept', correct: 'A' },
      });
      await repo.upsertByExternalId(externalId, data);

      const found = await repo.findByExternalIds([externalId], ['dirty stem||dirty concept']);
      expect(found).toEqual([]);
    });

    // ─── Restored rows override quarantine (see ai.ts: restore = explicit admin override) ──

    it('findStudentCatalog does not exclude a restored row even when its fingerprint is quarantined', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'restored', reviewMetadata: READY_METADATA,
        body: { stem: 'dirty stem', testedConcept: 'dirty concept', options: [] },
      });
      await repo.upsertByExternalId(externalId, data);

      const result = await repo.findStudentCatalog({ excludeFingerprints: ['dirty stem||dirty concept'] });
      expect(result.data.map((q) => q.id)).toContain(externalId);
    });

    it('findStudentCatalog still excludes an approved row with the same fingerprint', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved',
        body: { stem: 'dirty stem', testedConcept: 'dirty concept', options: [] },
      });
      await repo.upsertByExternalId(externalId, data);

      const result = await repo.findStudentCatalog({ excludeFingerprints: ['dirty stem||dirty concept'] });
      expect(result.data.map((q) => q.id)).not.toContain(externalId);
    });

    it('findByExternalIds does not exclude a restored row even when its fingerprint is quarantined', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'restored', reviewMetadata: READY_METADATA,
        body: { stem: 'dirty stem', testedConcept: 'dirty concept', correct: 'A' },
      });
      await repo.upsertByExternalId(externalId, data);

      const found = await repo.findByExternalIds([externalId], ['dirty stem||dirty concept']);
      expect(found.map((q) => q.id)).toContain(externalId);
    });

    // ─── Server-side search ──────────────────────────────────────────────────

    it('findStudentCatalog search matches stem, testedConcept, topic, subject, and system', async () => {
      const { externalId: byStem, data: byStemData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA, subject: 'Cardiology', system: 'Cardiovascular',
        body: { stem: 'a unique pericarditis vignette', options: [] },
      });
      const { externalId: byConcept, data: byConceptData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA, subject: 'Cardiology', system: 'Cardiovascular',
        body: { stem: 'other stem', testedConcept: 'pericarditis mechanism', options: [] },
      });
      const { externalId: unrelated, data: unrelatedData } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA, subject: 'Cardiology', system: 'Cardiovascular',
        body: { stem: 'completely different topic', options: [] },
      });
      await repo.upsertByExternalId(byStem, byStemData);
      await repo.upsertByExternalId(byConcept, byConceptData);
      await repo.upsertByExternalId(unrelated, unrelatedData);

      const result = await repo.findStudentCatalog({ search: 'pericarditis' });
      expect(new Set(result.data.map((q) => q.id))).toEqual(new Set([byStem, byConcept]));
    });

    it('findStudentCatalog search is case-insensitive and matches subject/system', async () => {
      const { externalId, data } = makeQuestionData({
        source: 'authored', bankStatus: 'approved', reviewMetadata: READY_METADATA, subject: 'Nephrology', system: 'Renal',
        body: { stem: 'irrelevant stem', options: [] },
      });
      await repo.upsertByExternalId(externalId, data);
      const result = await repo.findStudentCatalog({ search: 'NEPHRO' });
      expect(result.data.map((q) => q.id)).toContain(externalId);
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
