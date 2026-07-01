/**
 * Integration test for the analytics snapshot upsert.
 * Verifies that the analytics_snapshots_user_date_uniq index is a plain
 * unique index on (user_id, snapshot_date) — where snapshot_date is a DATE
 * column (not TIMESTAMPTZ). A plain DATE column index satisfies the
 * ON CONFLICT (user_id, snapshot_date) clause without needing a functional
 * expression or IMMUTABLE cast.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestPool, truncateAll } from './helpers.js';
import type { Pool } from 'pg';
import { PgAnalyticsRepository } from '../repositories/pg/AnalyticsRepository.js';
import type { AnalyticsSnapshot } from '../types/index.js';

function snapshot(userId: string, date: string, totalSessions: number): Omit<AnalyticsSnapshot, 'id'> {
  return {
    user_id: userId,
    snapshot_date: new Date(`${date}T12:00:00.000Z`),
    total_sessions: totalSessions,
    average_score: 75,
    subject_mastery: { Pathology: 0.75 },
    system_mastery: { Cardiovascular: 0.8 },
    weak_areas: [],
    study_priorities: [],
    mistake_diagnoses: [],
  };
}

describe('analytics snapshot — PostgreSQL contract', () => {
  let pool: Pool;
  let userId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await truncateAll(pool);

    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [randomUUID(), `analytics-${randomUUID()}@test.com`, 'Analytics User', 'hashed'],
    );
    userId = res.rows[0].id;
  });

  afterAll(async () => {
    await truncateAll(pool);
    await pool.end();
  });

  it('snapshot_date column type is DATE (not TIMESTAMPTZ)', async () => {
    const res = await pool.query<{ data_type: string }>(`
      SELECT data_type FROM information_schema.columns
      WHERE table_name = 'analytics_snapshots' AND column_name = 'snapshot_date'
    `);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].data_type).toBe('date');
  });

  it('analytics_snapshots_user_date_uniq is a unique index on (user_id, snapshot_date)', async () => {
    const res = await pool.query<{ indexdef: string }>(`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'analytics_snapshots'
        AND indexname = 'analytics_snapshots_user_date_uniq'
    `);
    expect(res.rows).toHaveLength(1);
    const def = res.rows[0].indexdef.toLowerCase();
    expect(def).toContain('unique');
    expect(def).toContain('snapshot_date');
  });

  it('PgAnalyticsRepository updates the same user and day without changing row identity', async () => {
    const repo = new PgAnalyticsRepository(pool);
    const first = await repo.upsert(snapshot(userId, '2026-06-29', 1));
    const second = await repo.upsert(snapshot(userId, '2026-06-29', 5));

    expect(second.id).toBe(first.id);
    expect(second.total_sessions).toBe(5);
    expect(second.snapshot_date).toBeInstanceOf(Date);
    expect(second.snapshot_date.toISOString()).toBe('2026-06-29T00:00:00.000Z');
  });

  it('PgAnalyticsRepository isolates users and creates separate rows for separate dates', async () => {
    const repo = new PgAnalyticsRepository(pool);
    const otherUserId = randomUUID();
    await pool.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)`,
      [otherUserId, `analytics-${otherUserId}@test.com`, 'Other Analytics User', 'hashed'],
    );

    await repo.upsert(snapshot(userId, '2026-06-30', 2));
    await repo.upsert(snapshot(userId, '2026-07-01', 3));
    await repo.upsert(snapshot(otherUserId, '2026-06-30', 4));

    const primaryRows = await repo.findByUserId(userId);
    const otherRows = await repo.findByUserId(otherUserId);
    expect(primaryRows.map(row => row.total_sessions)).toEqual(expect.arrayContaining([2, 3]));
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].total_sessions).toBe(4);
  });
});
