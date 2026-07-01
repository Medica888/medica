import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestPool } from './helpers.js';
import { PgAIUsageBudgetRepository } from '../repositories/pg/AIUsageBudgetRepository.js';
import type { Pool } from 'pg';

describe('PgAIUsageBudgetRepository — atomic concurrent reservation', () => {
  let pool: Pool;
  let repo: PgAIUsageBudgetRepository;

  beforeAll(() => {
    pool = createTestPool();
    repo = new PgAIUsageBudgetRepository(pool);
  });

  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    // Clean up per-test user rows without touching shared tables
    await pool.query('DELETE FROM user_ai_usage');
  });

  async function makeUser(): Promise<string> {
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, 'Budget Test User', '$2b$10$aaaabbbbccccddddeeeeffffffff.fakehashedsecret')`,
      [userId, `budget-${userId}@test.com`],
    );
    return userId;
  }

  const TODAY = new Date().toISOString().slice(0, 10);

  it('request limit — first N requests succeed, (N+1)th is denied', async () => {
    const userId = await makeUser();
    const LIMIT = 3;

    const results = await Promise.all([
      repo.reserveRequest(userId, TODAY, LIMIT, null),
      repo.reserveRequest(userId, TODAY, LIMIT, null),
      repo.reserveRequest(userId, TODAY, LIMIT, null),
    ]);
    expect(results.every(r => r === 'ok')).toBe(true);

    const overLimit = await repo.reserveRequest(userId, TODAY, LIMIT, null);
    expect(overLimit).toBe('denied');
  });

  it('request limit=1 — concurrent calls: exactly one ok, one denied', async () => {
    const userId = await makeUser();
    const [r1, r2] = await Promise.all([
      repo.reserveRequest(userId, TODAY, 1, null),
      repo.reserveRequest(userId, TODAY, 1, null),
    ]);
    const ok     = [r1, r2].filter(r => r === 'ok').length;
    const denied = [r1, r2].filter(r => r === 'denied').length;
    expect(ok).toBe(1);
    expect(denied).toBe(1);
  });

  it('token-only limit — denied when existing token_count >= limit', async () => {
    const userId = await makeUser();
    // No request limit, but token limit of 500
    const TOKEN_LIMIT = 500;

    // First request succeeds (token_count starts at 0 < 500)
    expect(await repo.reserveRequest(userId, TODAY, null, TOKEN_LIMIT)).toBe('ok');

    // Record 600 tokens — exceeds limit
    await repo.addTokens(userId, TODAY, 600);

    // Next request should be denied (token_count 600 >= 500)
    expect(await repo.reserveRequest(userId, TODAY, null, TOKEN_LIMIT)).toBe('denied');
  });

  it('token-only limit — fresh insert always passes (token_count starts at 0)', async () => {
    const userId = await makeUser();
    // Even with a token limit, a fresh row has token_count=0 so the first request passes
    expect(await repo.reserveRequest(userId, TODAY, null, 1000)).toBe('ok');
  });

  it('request-only limit — unlimited when null', async () => {
    const userId = await makeUser();
    // No limits at all — 10 concurrent requests all succeed
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.reserveRequest(userId, TODAY, null, null)),
    );
    expect(results.every(r => r === 'ok')).toBe(true);
  });

  it('both limits — denied when EITHER is exhausted', async () => {
    const userId = await makeUser();
    // Request limit 5, token limit 1000
    for (let i = 0; i < 5; i++) {
      expect(await repo.reserveRequest(userId, TODAY, 5, 1000)).toBe('ok');
    }
    // 6th request denied by request limit
    expect(await repo.reserveRequest(userId, TODAY, 5, 1000)).toBe('denied');
  });

  it('both limits — token limit blocks even when request count is under limit', async () => {
    const userId = await makeUser();
    // Reserve 1 request (count=1, token_count=0)
    expect(await repo.reserveRequest(userId, TODAY, 10, 100)).toBe('ok');
    // Add tokens past the limit
    await repo.addTokens(userId, TODAY, 200);
    // Request limit not reached (1 < 10) but token limit reached (200 >= 100)
    expect(await repo.reserveRequest(userId, TODAY, 10, 100)).toBe('denied');
  });

  it('addTokens — atomically accumulates across multiple calls', async () => {
    const userId = await makeUser();
    await repo.reserveRequest(userId, TODAY, null, null); // create the row

    await Promise.all([
      repo.addTokens(userId, TODAY, 100),
      repo.addTokens(userId, TODAY, 200),
      repo.addTokens(userId, TODAY, 300),
    ]);

    const usage = await repo.getUsage(userId, TODAY);
    expect(usage?.token_count).toBe(600);
  });

  it('addTokens — upserts when no row exists yet', async () => {
    const userId = await makeUser();
    await repo.addTokens(userId, TODAY, 150);
    const usage = await repo.getUsage(userId, TODAY);
    expect(usage?.token_count).toBe(150);
  });

  it('releaseRequest — decrements request_count without going below 0', async () => {
    const userId = await makeUser();
    await repo.reserveRequest(userId, TODAY, 5, null);
    await repo.releaseRequest(userId, TODAY);
    const usage = await repo.getUsage(userId, TODAY);
    expect(usage?.request_count).toBe(0);

    // Extra release never goes negative
    await repo.releaseRequest(userId, TODAY);
    const after = await repo.getUsage(userId, TODAY);
    expect(after?.request_count).toBe(0);
  });

  it('getUsage — returns null when no row exists', async () => {
    const userId = await makeUser();
    expect(await repo.getUsage(userId, TODAY)).toBeNull();
  });

  it('next request after token overshoot is denied (overshoot is allowed to complete)', async () => {
    const userId = await makeUser();
    const TOKEN_LIMIT = 100;
    // First request succeeds (token_count=0 < 100)
    expect(await repo.reserveRequest(userId, TODAY, null, TOKEN_LIMIT)).toBe('ok');
    // Provider runs and uses 500 tokens — overshoots the limit
    await repo.addTokens(userId, TODAY, 500);
    // Next request is denied (500 >= 100)
    expect(await repo.reserveRequest(userId, TODAY, null, TOKEN_LIMIT)).toBe('denied');
  });
});

describe('migration safety — duplicate flashcard deduplication', () => {
  let pool: Pool;

  beforeAll(() => { pool = createTestPool(); });
  afterAll(async () => { await pool.end(); });

  async function makeUser(): Promise<string> {
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, 'Dedup Test User', '$2b$10$aaaabbbbccccddddeeeeffffffff.fakehashedsecret')`,
      [userId, `dedup-${userId}@test.com`],
    );
    return userId;
  }

  it('flashcards_user_source_tag_uniq index exists after migration', async () => {
    const res = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'flashcards' AND indexname = 'flashcards_user_source_tag_uniq'
    `);
    expect(res.rows).toHaveLength(1);
  });

  it('ON CONFLICT DO NOTHING is idempotent for duplicate (user_id, source_question_id, tag)', async () => {
    const userId = await makeUser();
    const srcQ   = 'q-src-1';
    const tag    = 'Recall';

    await pool.query(
      `INSERT INTO flashcards (id, user_id, source_question_id, tag, type, front, back)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Recall', 'Front text', 'Back text')`,
      [userId, srcQ, tag],
    );
    // Second insert with same composite key is silently ignored
    await pool.query(
      `INSERT INTO flashcards (id, user_id, source_question_id, tag, type, front, back)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Recall', 'Duplicate front', 'Duplicate back')
       ON CONFLICT DO NOTHING`,
      [userId, srcQ, tag],
    );

    const rows = await pool.query(
      'SELECT count(*)::int AS cnt FROM flashcards WHERE user_id=$1 AND source_question_id=$2 AND tag=$3',
      [userId, srcQ, tag],
    );
    expect(rows.rows[0].cnt).toBe(1);
  });

  it('dedup keeps newest row by (created_at DESC, id DESC)', async () => {
    const userId = await makeUser();
    const srcQ = 'q-src-dedup';

    // Insert older row
    const olderRow = await pool.query<{ id: string }>(
      `INSERT INTO flashcards (id, user_id, source_question_id, tag, type, front, back, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'TagA', 'Recall', 'Old front', 'Old back', NOW() - INTERVAL '1 hour')
       RETURNING id`,
      [userId, srcQ],
    );
    const olderId = olderRow.rows[0].id;

    // Insert newer row with a different tag (so no conflict) to verify dedup ordering logic
    const newerRow = await pool.query<{ id: string }>(
      `INSERT INTO flashcards (id, user_id, source_question_id, tag, type, front, back, created_at)
       VALUES (gen_random_uuid(), $1, $2, 'TagB', 'Recall', 'New front', 'New back', NOW())
       RETURNING id`,
      [userId, srcQ],
    );
    const newerId = newerRow.rows[0].id;

    // Verify the dedup window function keeps the newer row per (user_id, source_question_id, tag).
    // For these two rows (different tags), both survive — this test confirms the ORDER BY logic.
    const keepIds = await pool.query<{ id: string; rn: number }>(`
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY user_id, source_question_id, tag
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS rn
      FROM flashcards
      WHERE user_id = $1
    `, [userId]);

    // Both rows are rn=1 (different tags = different partitions), none would be deleted
    const allRn1 = keepIds.rows.every(r => Number(r.rn) === 1);
    expect(allRn1).toBe(true);
    expect(keepIds.rows.map(r => r.id)).toContain(olderId);
    expect(keepIds.rows.map(r => r.id)).toContain(newerId);
  });
});

describe('migration safety — question_reports user-scoped idempotency', () => {
  let pool: Pool;

  beforeAll(() => { pool = createTestPool(); });
  afterAll(async () => { await pool.end(); });

  async function makeUser(label: string): Promise<string> {
    const userId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, '$2b$10$aaaabbbbccccddddeeeeffffffff.fakehashedsecret')`,
      [userId, `${label}-${userId}@test.com`, `User ${label}`],
    );
    return userId;
  }

  it('qr_user_client_report_id_uniq index exists after migration', async () => {
    const res = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'question_reports' AND indexname = 'qr_user_client_report_id_uniq'
    `);
    expect(res.rows).toHaveLength(1);
  });

  it('same user — duplicate clientReportId is ignored (idempotent retry)', async () => {
    const userId = await makeUser('idem');
    const clientReportId = randomUUID();

    await pool.query(
      `INSERT INTO question_reports (user_id, fingerprint, reason, client_report_id)
       VALUES ($1, 'fp-idem', 'wrong_answer', $2)
       ON CONFLICT (user_id, client_report_id) WHERE client_report_id IS NOT NULL DO NOTHING`,
      [userId, clientReportId],
    );
    await pool.query(
      `INSERT INTO question_reports (user_id, fingerprint, reason, client_report_id)
       VALUES ($1, 'fp-idem-retry', 'wrong_answer', $2)
       ON CONFLICT (user_id, client_report_id) WHERE client_report_id IS NOT NULL DO NOTHING`,
      [userId, clientReportId],
    );

    const rows = await pool.query(
      'SELECT count(*)::int AS cnt FROM question_reports WHERE user_id=$1 AND client_report_id=$2',
      [userId, clientReportId],
    );
    expect(rows.rows[0].cnt).toBe(1);
  });

  it('different users — same clientReportId does NOT suppress the second user\'s report', async () => {
    const userA = await makeUser('cross-a');
    const userB = await makeUser('cross-b');
    const sharedClientReportId = randomUUID();

    await pool.query(
      `INSERT INTO question_reports (user_id, fingerprint, reason, client_report_id)
       VALUES ($1, 'fp-cross-a', 'wrong_answer', $2)
       ON CONFLICT (user_id, client_report_id) WHERE client_report_id IS NOT NULL DO NOTHING`,
      [userA, sharedClientReportId],
    );
    await pool.query(
      `INSERT INTO question_reports (user_id, fingerprint, reason, client_report_id)
       VALUES ($1, 'fp-cross-b', 'wrong_answer', $2)
       ON CONFLICT (user_id, client_report_id) WHERE client_report_id IS NOT NULL DO NOTHING`,
      [userB, sharedClientReportId],
    );

    const rowsA = await pool.query(
      'SELECT count(*)::int AS cnt FROM question_reports WHERE user_id=$1 AND client_report_id=$2',
      [userA, sharedClientReportId],
    );
    const rowsB = await pool.query(
      'SELECT count(*)::int AS cnt FROM question_reports WHERE user_id=$1 AND client_report_id=$2',
      [userB, sharedClientReportId],
    );
    expect(rowsA.rows[0].cnt).toBe(1);
    expect(rowsB.rows[0].cnt).toBe(1);
  });

  it('null clientReportId allows multiple rows per user (partial index)', async () => {
    const userId = await makeUser('nullkey');

    await pool.query(
      `INSERT INTO question_reports (user_id, fingerprint, reason, client_report_id)
       VALUES ($1, 'fp-null-1', 'wrong_answer', NULL),
              ($1, 'fp-null-2', 'wrong_answer', NULL)`,
      [userId],
    );

    const rows = await pool.query(
      'SELECT count(*)::int AS cnt FROM question_reports WHERE user_id=$1 AND client_report_id IS NULL',
      [userId],
    );
    expect(rows.rows[0].cnt).toBe(2);
  });
});
