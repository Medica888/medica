import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { bootstrapDatabase } from '../db/bootstrap.js';

const BOOTSTRAP_DB = 'medica_bootstrap_test';

describe('db:bootstrap — integration', () => {
  let adminPool: Pool | undefined;
  let bootstrapUrl = '';

  beforeAll(async () => {
    const baseUrl = process.env.INTEGRATION_DATABASE_URL;
    if (!baseUrl) throw new Error('INTEGRATION_DATABASE_URL not set — run npm run test:integration with Docker');

    // Derive an admin URL pointing at the system postgres DB (same host/creds)
    const adminParsed = new URL(baseUrl);
    adminParsed.pathname = '/postgres';
    adminPool = new Pool({ connectionString: adminParsed.toString() });

    // Guarantee a truly empty database for test (a)
    await adminPool.query(`DROP DATABASE IF EXISTS ${BOOTSTRAP_DB} WITH (FORCE)`);
    await adminPool.query(`CREATE DATABASE ${BOOTSTRAP_DB}`);

    const testParsed = new URL(baseUrl);
    testParsed.pathname = `/${BOOTSTRAP_DB}`;
    bootstrapUrl = testParsed.toString();
  });

  afterAll(async () => {
    if (!adminPool) return;
    await adminPool.query(`DROP DATABASE IF EXISTS ${BOOTSTRAP_DB} WITH (FORCE)`);
    await adminPool.end();
  });

  it('(a) bootstraps an empty database — 5 baseline tables + all migrations applied', async () => {
    await bootstrapDatabase(bootstrapUrl);

    const pool = new Pool({ connectionString: bootstrapUrl });
    try {
      // All 5 baseline tables from schema.sql must exist
      const tablesResult = await pool.query<{ table_name: string }>(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (
            'users', 'exam_sessions', 'question_attempts',
            'flashcards', 'analytics_snapshots'
          )
        ORDER BY table_name
      `);
      expect(tablesResult.rows.map(r => r.table_name)).toEqual([
        'analytics_snapshots', 'exam_sessions', 'flashcards', 'question_attempts', 'users',
      ]);

      // All migrations must be recorded
      const migResult = await pool.query<{ count: string }>('SELECT COUNT(*) FROM pgmigrations');
      expect(Number(migResult.rows[0].count)).toBe(31);

      // A migration-added table (not in schema.sql) proves migrations ran, not just schema.sql
      const questionsResult = await pool.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'questions'
      `);
      expect(questionsResult.rowCount).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('(b) repeated bootstrap is idempotent — no error, migration count unchanged', async () => {
    // The DB was fully bootstrapped in test (a); re-running must not throw or duplicate migrations
    await expect(bootstrapDatabase(bootstrapUrl)).resolves.toBeUndefined();

    const pool = new Pool({ connectionString: bootstrapUrl });
    try {
      const result = await pool.query<{ count: string }>('SELECT COUNT(*) FROM pgmigrations');
      expect(Number(result.rows[0].count)).toBe(31);
    } finally {
      await pool.end();
    }
  });
});
