import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgQuestionReportsRepository } from '../repositories/pg/QuestionReportsRepository.js';
import { createTestPool, truncateAll, makeUser, makeReport } from './helpers.js';

describe('PgQuestionReportsRepository — quarantine thresholds — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let reportsRepo: PgQuestionReportsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo   = new PgUsersRepository(pool);
    reportsRepo = new PgQuestionReportsRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  async function createReports(
    userId: string,
    fingerprint: string,
    entries: { reason: string }[],
  ) {
    for (const e of entries) {
      await reportsRepo.create(makeReport(userId, { fingerprint, reason: e.reason }));
    }
  }

  it('no reports → fingerprint is not quarantined', async () => {
    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.size).toBe(0);
  });

  it('1 wrong_answer report → not quarantined (threshold is 2)', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r1@test.com' }));
    await createReports(user.id, 'fp-1', [{ reason: 'wrong_answer' }]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-1')).toBe(false);
  });

  it('2 wrong_answer reports → quarantined', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r2@test.com' }));
    await createReports(user.id, 'fp-2', [
      { reason: 'wrong_answer' },
      { reason: 'wrong_answer' },
    ]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-2')).toBe(true);
  });

  it('2 off_topic reports → not quarantined (threshold is 3)', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r3@test.com' }));
    await createReports(user.id, 'fp-3', [
      { reason: 'off_topic' },
      { reason: 'off_topic' },
    ]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-3')).toBe(false);
  });

  it('3 off_topic reports → quarantined', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r4@test.com' }));
    await createReports(user.id, 'fp-4', [
      { reason: 'off_topic' },
      { reason: 'off_topic' },
      { reason: 'off_topic' },
    ]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-4')).toBe(true);
  });

  it('4 mixed reports (no single threshold hit) → not quarantined', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r5@test.com' }));
    await createReports(user.id, 'fp-5', [
      { reason: 'wrong_answer' },
      { reason: 'off_topic' },
      { reason: 'bad_explanation' },
      { reason: 'ambiguous_or_insufficient_clues' },
    ]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-5')).toBe(false);
  });

  it('5 total reports (any reason) → quarantined', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r6@test.com' }));
    await createReports(user.id, 'fp-6', [
      { reason: 'bad_explanation' },
      { reason: 'bad_explanation' },
      { reason: 'ambiguous_or_insufficient_clues' },
      { reason: 'bad_explanation' },
      { reason: 'ambiguous_or_insufficient_clues' },
    ]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-6')).toBe(true);
  });

  it('independent fingerprints track separately', async () => {
    const user = await usersRepo.create(makeUser({ email: 'r7@test.com' }));
    // fp-a: 2 wrong_answer → quarantined
    await createReports(user.id, 'fp-a', [
      { reason: 'wrong_answer' },
      { reason: 'wrong_answer' },
    ]);
    // fp-b: 1 wrong_answer → clear
    await createReports(user.id, 'fp-b', [{ reason: 'wrong_answer' }]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-a')).toBe(true);
    expect(quarantined.has('fp-b')).toBe(false);
  });

  it('getCountsForFingerprint returns accurate counts', async () => {
    const user = await usersRepo.create(makeUser({ email: 'counts@test.com' }));
    await createReports(user.id, 'fp-counts', [
      { reason: 'wrong_answer' },
      { reason: 'wrong_answer' },
      { reason: 'off_topic' },
    ]);

    const counts = await reportsRepo.getCountsForFingerprint('fp-counts');
    expect(counts.fingerprint).toBe('fp-counts');
    expect(counts.total).toBe(3);
    expect(counts.wrong_answer).toBe(2);
    expect(counts.off_topic).toBe(1);
  });

  it('getCountsByFingerprint includes global totals', async () => {
    const user = await usersRepo.create(makeUser({ email: 'global@test.com' }));
    await createReports(user.id, 'fp-g1', [
      { reason: 'wrong_answer' },
      { reason: 'off_topic' },
    ]);
    await createReports(user.id, 'fp-g2', [{ reason: 'bad_explanation' }]);

    const result = await reportsRepo.getCountsByFingerprint(10);
    expect(result.globalTotal).toBe(3);
    expect(result.globalWrongAnswer).toBe(1);
    expect(result.globalOffTopic).toBe(1);
    expect(result.globalBadExpl).toBe(1);
    expect(result.fingerprints.length).toBe(2);
  });

  it('invalid reason rejected by check constraint', async () => {
    const user = await usersRepo.create(makeUser({ email: 'badrsn@test.com' }));
    await expect(
      reportsRepo.create(makeReport(user.id, { fingerprint: 'fp-bad', reason: 'invalid_reason' })),
    ).rejects.toThrow();
  });

  it.each(['duplicate', 'technical_issue'] as const)(
    'accepts the %s report reason in PostgreSQL',
    async (reason) => {
      const user = await usersRepo.create(makeUser({ email: `${reason}@test.com` }));

      const report = await reportsRepo.create(
        makeReport(user.id, { fingerprint: `fp-${reason}`, reason }),
      );

      expect(report.reason).toBe(reason);
    },
  );

  it('has exactly one canonical report-reason check constraint', async () => {
    const result = await pool.query<{ name: string; definition: string }>(`
      SELECT conname AS name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'question_reports'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%reason%'
    `);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.name).toBe('question_reports_reason_check');
    expect(result.rows[0]?.definition).toContain('duplicate');
    expect(result.rows[0]?.definition).toContain('technical_issue');
  });
});
