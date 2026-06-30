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

  it('INSERT ... ON CONFLICT (user_id, snapshot_date) upserts correctly', async () => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const id1 = randomUUID();

    await pool.query(
      `INSERT INTO analytics_snapshots
         (id, user_id, snapshot_date, total_sessions, average_score,
          subject_mastery, system_mastery, weak_areas, study_priorities, mistake_diagnoses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, snapshot_date)
       DO UPDATE SET total_sessions = EXCLUDED.total_sessions`,
      [id1, userId, today, 1, 70, '{}', '{}', '[]', '[]', '[]'],
    );

    const after1 = await pool.query<{ total_sessions: number; id: string }>(
      'SELECT id, total_sessions FROM analytics_snapshots WHERE user_id = $1',
      [userId],
    );
    expect(after1.rows).toHaveLength(1);
    expect(after1.rows[0].total_sessions).toBe(1);

    // Second upsert on the same calendar day must UPDATE, not insert a second row.
    await pool.query(
      `INSERT INTO analytics_snapshots
         (id, user_id, snapshot_date, total_sessions, average_score,
          subject_mastery, system_mastery, weak_areas, study_priorities, mistake_diagnoses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, snapshot_date)
       DO UPDATE SET total_sessions = EXCLUDED.total_sessions`,
      [randomUUID(), userId, today, 5, 85, '{}', '{}', '[]', '[]', '[]'],
    );

    const after2 = await pool.query<{ total_sessions: number; id: string }>(
      'SELECT id, total_sessions FROM analytics_snapshots WHERE user_id = $1',
      [userId],
    );
    expect(after2.rows).toHaveLength(1);
    expect(after2.rows[0].total_sessions).toBe(5);
    // Same row id confirms UPDATE path, not a new INSERT.
    expect(after2.rows[0].id).toBe(id1);
  });
});
