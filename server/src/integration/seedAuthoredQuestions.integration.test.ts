import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { upsertAuthoredQuestions, type AuthoredQuestion } from '../db/seedAuthoredQuestions.js';
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
    `SELECT external_id, subject, system, source, bank_status, fingerprint, body FROM questions WHERE external_id = $1`,
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
});
