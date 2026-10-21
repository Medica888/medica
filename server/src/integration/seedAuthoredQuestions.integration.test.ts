import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { upsertAuthoredQuestions, type AuthoredQuestion } from '../db/seedAuthoredQuestions.js';
import { PgQuestionsRepository } from '../repositories/pg/QuestionsRepository.js';
import { isCommerciallyContentReady } from '../lib/reviewedContentMetadata.js';
import { createTestPool, truncateAll } from './helpers.js';

function makeQuestion(id: string, overrides: Partial<AuthoredQuestion> = {}): AuthoredQuestion {
  return {
    id,
    subject: 'Cardiology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    stem: `Stem for ${id}`,
    testedConcept: `Concept for ${id}`,
    options: [{ letter: 'A', text: 'x' }],
    correct: 'A',
    ...overrides,
  };
}

async function getRow(pool: Pool, externalId: string) {
  const res = await pool.query(
    `SELECT external_id, subject, system, source, bank_status, fingerprint, body, review_metadata FROM questions WHERE external_id = $1`,
    [externalId],
  );
  return res.rows[0] ?? null;
}

describe('seedAuthoredQuestions — lifecycle protection', () => {
  let pool: Pool;

  beforeAll(() => { pool = createTestPool(); });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { await truncateAll(pool); });

  it('inserts a brand-new authored question as approved', async () => {
    await upsertAuthoredQuestions(pool, [makeQuestion('q1')]);
    const row = await getRow(pool, 'q1');
    expect(row.source).toBe('authored');
    expect(row.bank_status).toBe('approved');
    expect(row.fingerprint).toContain('||');
  });

  it('persists reviewed-content metadata and mirrors it into the stored body', async () => {
    await upsertAuthoredQuestions(pool, [
      makeQuestion('q1', {
        sourceRefs: ['USMLE Content Outline'],
        reviewMetadata: {
          reviewStatus: 'source_checked',
          sourceRefs: ['USMLE Content Outline'],
          medicalAccuracyStatus: 'pass',
          itemWritingStatus: 'pass',
          difficultyCalibrationStatus: 'pass',
        },
      }),
    ]);

    const row = await getRow(pool, 'q1');
    expect(row.review_metadata).toMatchObject({
      reviewStatus: 'source_checked',
      sourceRefs: ['USMLE Content Outline'],
      medicalAccuracyStatus: 'pass',
    });
    expect(row.body.reviewMetadata).toMatchObject({
      reviewStatus: 'source_checked',
      sourceRefs: ['USMLE Content Outline'],
    });
    expect(row.body.sourceRefs).toEqual(['USMLE Content Outline']);
  });

  it('re-seeding an approved authored row updates its content normally', async () => {
    await upsertAuthoredQuestions(pool, [makeQuestion('q1', { subject: 'Pathology' })]);
    await upsertAuthoredQuestions(pool, [makeQuestion('q1', { subject: 'Neurology' })]);
    const row = await getRow(pool, 'q1');
    expect(row.subject).toBe('Neurology');
    expect(row.bank_status).toBe('approved');
  });

  it.each(['quarantined', 'rejected', 'validation_failed', 'restored'] as const)(
    're-seeding cannot reactivate a %s authored question back to approved',
    async (protectedStatus) => {
      await upsertAuthoredQuestions(pool, [makeQuestion('q1')]);
      await pool.query(`UPDATE questions SET bank_status = $1 WHERE external_id = 'q1'`, [protectedStatus]);

      await upsertAuthoredQuestions(pool, [makeQuestion('q1', { subject: 'Should Not Apply' })]);

      const row = await getRow(pool, 'q1');
      expect(row.bank_status).toBe(protectedStatus);
      expect(row.subject).not.toBe('Should Not Apply');
    },
  );

  it('never converts a non-authored (e.g. AI-generated) row into authored on an id collision', async () => {
    await pool.query(
      `INSERT INTO questions (external_id, subject, system, body, source, bank_status)
       VALUES ('shared-id', 'Pharmacology', 'Renal', '{"stem":"ai stem"}'::jsonb, 'ai', 'approved')`,
    );

    await upsertAuthoredQuestions(pool, [makeQuestion('shared-id', { subject: 'Should Not Apply' })]);

    const row = await getRow(pool, 'shared-id');
    expect(row.source).toBe('ai');
    expect(row.subject).toBe('Pharmacology');
    expect(row.body.stem).toBe('ai stem');
  });

  it('is a single batched statement regardless of input size (no per-row round trips)', async () => {
    const questions = Array.from({ length: 25 }, (_, i) => makeQuestion(`batch-${i}`));
    const result = await upsertAuthoredQuestions(pool, questions);
    expect(result).toEqual({ inserted: 25, updated: 0, skipped: 0 });
    const res = await pool.query(`SELECT count(*)::int AS count FROM questions WHERE source = 'authored'`);
    expect(res.rows[0].count).toBe(25);
  });

  // ─── Accurate inserted/updated/skipped counts ───────────────────────────────

  it('reports 0 inserted/updated/skipped for an empty input', async () => {
    const result = await upsertAuthoredQuestions(pool, []);
    expect(result).toEqual({ inserted: 0, updated: 0, skipped: 0 });
  });

  it('reports accurate inserted vs updated counts across two seed runs', async () => {
    const first = await upsertAuthoredQuestions(pool, [makeQuestion('q1'), makeQuestion('q2')]);
    expect(first).toEqual({ inserted: 2, updated: 0, skipped: 0 });

    const second = await upsertAuthoredQuestions(pool, [
      makeQuestion('q1', { subject: 'Neurology' }),  // existing → updated
      makeQuestion('q3'),                            // new → inserted
    ]);
    expect(second).toEqual({ inserted: 1, updated: 1, skipped: 0 });
  });

  it('counts a frozen (quarantined) row as skipped, not updated', async () => {
    await upsertAuthoredQuestions(pool, [makeQuestion('q1')]);
    await pool.query(`UPDATE questions SET bank_status = 'quarantined' WHERE external_id = 'q1'`);

    const result = await upsertAuthoredQuestions(pool, [
      makeQuestion('q1', { subject: 'Should Not Apply' }),
      makeQuestion('q2'),
    ]);
    expect(result).toEqual({ inserted: 1, updated: 0, skipped: 1 });
  });

  // ─── A reseed must not undo admin review decisions ──────────────────────────
  // render.yaml runs db:seed-authored on every deploy. If it overwrote review_metadata,
  // every approved question would revert to the seed file's status and vanish from the
  // student catalog on the next deploy.

  const reviewed = { reviewStatus: 'source_checked', sourceRefs: ['First Aid 2025'], medicalAccuracyStatus: 'pass' };
  const unreviewed = { reviewStatus: 'unreviewed', sourceRefs: [], medicalAccuracyStatus: 'unknown' };

  it('keeps an admin approval (stored review_metadata and its body copy) when the seed file still says unreviewed', async () => {
    await upsertAuthoredQuestions(pool, [makeQuestion('q1', { reviewMetadata: unreviewed })]);
    await pool.query(
      `UPDATE questions SET review_metadata = $2::jsonb WHERE external_id = $1`,
      ['q1', JSON.stringify(reviewed)],
    );

    await upsertAuthoredQuestions(pool, [makeQuestion('q1', { reviewMetadata: unreviewed, subject: 'Neurology' })]);

    const row = await getRow(pool, 'q1');
    expect(row.review_metadata.reviewStatus).toBe('source_checked');
    expect(row.body.reviewMetadata.reviewStatus).toBe('source_checked');
    expect(row.body.reviewStatus).toBe('source_checked');
    expect(row.body.sourceRefs).toEqual(['First Aid 2025']);
    expect(row.subject).toBe('Neurology'); // content still updates

    const repo = new PgQuestionsRepository(pool);
    const catalog = await repo.findStudentCatalog({ limit: 10 });
    expect(catalog.total).toBe(1);
  });

  it('still upgrades an unreviewed row when the seed file now carries review metadata', async () => {
    await upsertAuthoredQuestions(pool, [makeQuestion('q1', { reviewMetadata: unreviewed })]);
    await upsertAuthoredQuestions(pool, [makeQuestion('q1', { reviewMetadata: reviewed })]);

    const row = await getRow(pool, 'q1');
    expect(row.review_metadata.reviewStatus).toBe('source_checked');
    expect(row.body.reviewStatus).toBe('source_checked');
  });

  // ─── Real seed data must be visible to students, not just insertable ────────
  // Regression guard: findStudentCatalog requires commercial-readiness metadata
  // (source_checked/expert_reviewed + sourceRefs + medicalAccuracyStatus: pass).
  // A previous version of authoredQuestions.json carried no reviewMetadata at
  // all, which silently emptied the student catalog despite every seed/insert
  // test above passing (they only assert on the questions table, never on
  // findStudentCatalog). This proves the real file — not a synthetic fixture —
  // actually clears the gate.
  it('the real authoredQuestions.json seed file is visible in the student catalog after seeding', async () => {
    const dataPath = join(__dirname, '..', 'db', 'seed-data', 'authoredQuestions.json');
    const questions: AuthoredQuestion[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
    expect(questions.length).toBeGreaterThan(0);

    const result = await upsertAuthoredQuestions(pool, questions);
    expect(result.inserted).toBe(questions.length);

    // Only reviewed content is student-visible. Unreviewed AI-authored questions are seeded
    // (so the admin review queue can find them) but must stay out of the student catalog.
    const reviewedCount = questions.filter((q) => isCommerciallyContentReady({
      bankStatus: 'approved',
      difficulty: q.difficulty,
      reviewMetadata: q.reviewMetadata,
      source: 'authored',
      body: q,
    })).length;
    expect(reviewedCount).toBeGreaterThan(0);

    const repo = new PgQuestionsRepository(pool);
    const catalog = await repo.findStudentCatalog({ limit: 1 });
    expect(catalog.total).toBe(reviewedCount);
  });
});
