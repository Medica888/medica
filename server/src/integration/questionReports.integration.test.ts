import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgQuestionReportsRepository } from '../repositories/pg/QuestionReportsRepository.js';
import { InMemoryQuestionReportsRepository } from '../repositories/memory/QuestionReportsRepository.js';
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

  it('2 wrong_answer reports from distinct users → quarantined', async () => {
    const firstUser = await usersRepo.create(makeUser({ email: 'r2a@test.com' }));
    const secondUser = await usersRepo.create(makeUser({ email: 'r2b@test.com' }));
    await createReports(firstUser.id, 'fp-2', [{ reason: 'wrong_answer' }]);
    await createReports(secondUser.id, 'fp-2', [{ reason: 'wrong_answer' }]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-2')).toBe(true);
  });

  it('repeated wrong_answer reports from one user do not quarantine', async () => {
    const user = await usersRepo.create(makeUser({ email: 'repeat@test.com' }));
    await createReports(user.id, 'fp-repeat', [
      { reason: 'wrong_answer' },
      { reason: 'wrong_answer' },
      { reason: 'wrong_answer' },
    ]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-repeat')).toBe(false);
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

  it('3 off_topic reports from distinct users → quarantined', async () => {
    const users = await Promise.all([
      usersRepo.create(makeUser({ email: 'r4a@test.com' })),
      usersRepo.create(makeUser({ email: 'r4b@test.com' })),
      usersRepo.create(makeUser({ email: 'r4c@test.com' })),
    ]);
    for (const user of users) {
      await createReports(user.id, 'fp-4', [{ reason: 'off_topic' }]);
    }

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

  it('5 total reports from distinct users (any reason) → quarantined', async () => {
    const reasons = [
      'bad_explanation',
      'bad_explanation',
      'ambiguous_or_insufficient_clues',
      'bad_explanation',
      'ambiguous_or_insufficient_clues',
    ];
    for (const [index, reason] of reasons.entries()) {
      const user = await usersRepo.create(makeUser({ email: `r6-${index}@test.com` }));
      await createReports(user.id, 'fp-6', [{ reason }]);
    }

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-6')).toBe(true);
  });

  it('independent fingerprints track separately', async () => {
    const firstUser = await usersRepo.create(makeUser({ email: 'r7a@test.com' }));
    const secondUser = await usersRepo.create(makeUser({ email: 'r7b@test.com' }));
    // fp-a: 2 wrong_answer → quarantined
    await createReports(firstUser.id, 'fp-a', [{ reason: 'wrong_answer' }]);
    await createReports(secondUser.id, 'fp-a', [{ reason: 'wrong_answer' }]);
    // fp-b: 1 wrong_answer → clear
    await createReports(firstUser.id, 'fp-b', [{ reason: 'wrong_answer' }]);

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-a')).toBe(true);
    expect(quarantined.has('fp-b')).toBe(false);
  });

  it('legacy anonymous reports cannot quarantine a fingerprint', async () => {
    for (let index = 0; index < 5; index += 1) {
      await reportsRepo.create({
        ...makeReport('legacy-placeholder', { fingerprint: 'fp-anonymous' }),
        user_id: null,
      });
    }

    const quarantined = await reportsRepo.getQuarantinedFingerprints();
    expect(quarantined.has('fp-anonymous')).toBe(false);
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
    expect(counts.unique_users).toBe(1);
    expect(counts.unique_wrong_answer_users).toBe(1);
    expect(counts.unique_off_topic_users).toBe(1);
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

      const { report } = await reportsRepo.create(
        makeReport(user.id, { fingerprint: `fp-${reason}`, reason }),
      );

      expect(report.reason).toBe(reason);
    },
  );

  // ─── Issue 5/6: idempotent create() exposes insert-vs-replay, atomically ──────

  it('create() returns inserted:true for a brand-new report', async () => {
    const user = await usersRepo.create(makeUser({ email: 'inserted-true@test.com' }));
    const { inserted } = await reportsRepo.create({
      ...makeReport(user.id, { fingerprint: 'fp-fresh' }),
      client_report_id: randomUUID(),
    });
    expect(inserted).toBe(true);
  });

  it('create() returns inserted:false and the original row for a replayed client_report_id', async () => {
    const user = await usersRepo.create(makeUser({ email: 'inserted-false@test.com' }));
    const clientReportId = randomUUID();
    const { report: firstReport, inserted: firstInserted } = await reportsRepo.create({
      ...makeReport(user.id, { fingerprint: 'fp-replay-pg', reason: 'wrong_answer' }),
      client_report_id: clientReportId,
    });
    const { report: secondReport, inserted: secondInserted } = await reportsRepo.create({
      ...makeReport(user.id, { fingerprint: 'fp-replay-pg', reason: 'wrong_answer' }),
      client_report_id: clientReportId,
    });

    expect(firstInserted).toBe(true);
    expect(secondInserted).toBe(false);
    expect(secondReport.id).toBe(firstReport.id);
  });

  it('concurrent replays of the same client_report_id insert exactly one row', async () => {
    const user = await usersRepo.create(makeUser({ email: 'concurrent-replay@test.com' }));
    const clientReportId = randomUUID();
    const base = {
      ...makeReport(user.id, { fingerprint: 'fp-concurrent-pg', reason: 'wrong_answer' }),
      client_report_id: clientReportId,
    };

    const results = await Promise.all([
      reportsRepo.create(base),
      reportsRepo.create(base),
      reportsRepo.create(base),
    ]);

    const insertedCount = results.filter(r => r.inserted).length;
    expect(insertedCount).toBe(1);
    const ids = new Set(results.map(r => r.report.id));
    expect(ids.size).toBe(1);

    const rowCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM question_reports WHERE client_report_id = $1`,
      [clientReportId],
    );
    expect(rowCount.rows[0]?.count).toBe(1);
  });

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

// ── PG / memory quarantine-decision parity ──────────────────────────────────
// Both repositories now consume the same lib/quarantinePolicy.ts thresholds.
// This proves they produce identical quarantine decisions for identical data,
// so a future threshold change can't silently diverge between them.

describe('QuestionReportsRepository — PG/memory quarantine parity', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let pgRepo: PgQuestionReportsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo = new PgUsersRepository(pool);
    pgRepo = new PgQuestionReportsRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('PG and in-memory repositories quarantine the same fingerprints for identical data', async () => {
    const memRepo = new InMemoryQuestionReportsRepository();

    // A mixed scenario exercising every threshold boundary at once:
    // fp-wa: 2 distinct wrong_answer reporters -> quarantined (wrongAnswerMin)
    // fp-ot: 3 distinct off_topic reporters -> quarantined (offTopicMin)
    // fp-du: 2 distinct duplicate reporters -> quarantined (duplicateMin)
    // fp-total: 5 distinct reporters across mixed reasons, none hitting a
    //           single-reason threshold alone -> quarantined (totalMin)
    // fp-safe: 1 report only -> not quarantined
    const scenarios: Array<{ fingerprint: string; reason: string }[]> = [
      [{ fingerprint: 'fp-wa', reason: 'wrong_answer' }, { fingerprint: 'fp-wa', reason: 'wrong_answer' }],
      [
        { fingerprint: 'fp-ot', reason: 'off_topic' },
        { fingerprint: 'fp-ot', reason: 'off_topic' },
        { fingerprint: 'fp-ot', reason: 'off_topic' },
      ],
      [{ fingerprint: 'fp-du', reason: 'duplicate' }, { fingerprint: 'fp-du', reason: 'duplicate' }],
      [
        { fingerprint: 'fp-total', reason: 'bad_explanation' },
        { fingerprint: 'fp-total', reason: 'bad_explanation' },
        { fingerprint: 'fp-total', reason: 'ambiguous_or_insufficient_clues' },
        { fingerprint: 'fp-total', reason: 'technical_issue' },
        { fingerprint: 'fp-total', reason: 'off_topic' },
      ],
      [{ fingerprint: 'fp-safe', reason: 'wrong_answer' }],
    ];

    for (const reports of scenarios) {
      for (const r of reports) {
        const user = await usersRepo.create(makeUser({ email: `parity-${randomUUID()}@test.com` }));
        const report = makeReport(user.id, { fingerprint: r.fingerprint, reason: r.reason });
        await pgRepo.create(report);
        await memRepo.create(report);
      }
    }

    const pgQuarantined = await pgRepo.getQuarantinedFingerprints();
    const memQuarantined = await memRepo.getQuarantinedFingerprints();

    expect([...pgQuarantined].sort()).toEqual([...memQuarantined].sort());
    expect([...pgQuarantined].sort()).toEqual(['fp-du', 'fp-ot', 'fp-total', 'fp-wa']);
  });
});
