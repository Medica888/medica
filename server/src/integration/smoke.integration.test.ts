import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestPool } from './helpers.js';
import type { Pool } from 'pg';

describe('integration spine smoke test', () => {
  let pool: Pool;

  beforeAll(() => { pool = createTestPool(); });
  afterAll(async () => { await pool.end(); });

  it('INTEGRATION_DATABASE_URL is set (env propagated from globalSetup)', () => {
    expect(process.env.INTEGRATION_DATABASE_URL).toBeTruthy();
  });

  it('can reach the database with SELECT 1', async () => {
    const res = await pool.query('SELECT 1 AS ok');
    expect(res.rows[0].ok).toBe(1);
  });

  it('schema baseline tables exist (users, exam_sessions, question_attempts)', async () => {
    const res = await pool.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('users','exam_sessions','question_attempts','flashcards','analytics_snapshots')
      ORDER BY tablename
    `);
    const names = res.rows.map(r => r.tablename);
    expect(names).toContain('users');
    expect(names).toContain('exam_sessions');
    expect(names).toContain('question_attempts');
  });

  it('migrations were applied: users.email_verified column exists', async () => {
    const res = await pool.query<{ column_name: string }>(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'email_verified'
    `);
    expect(res.rows).toHaveLength(1);
  });

  it('migrations were applied: auth_tokens table exists', async () => {
    const res = await pool.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'auth_tokens'
    `);
    expect(res.rows).toHaveLength(1);
  });

  it('migrations were applied: question_reports table exists', async () => {
    const res = await pool.query<{ tablename: string }>(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'question_reports'
    `);
    expect(res.rows).toHaveLength(1);
  });

  it('migrations were applied: LOWER(email) unique index exists', async () => {
    const res = await pool.query<{ indexname: string }>(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'users' AND indexname = 'users_email_lower_unique'
    `);
    expect(res.rows).toHaveLength(1);
  });

  it('all 22 migration rows recorded in pgmigrations', async () => {
    const res = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM pgmigrations');
    expect(parseInt(res.rows[0].count, 10)).toBe(22);
  });
});
