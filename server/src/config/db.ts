import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { config } from '../config.js';

let _pool: Pool | null = null;

export function getPool(): Pool | null {
  if (!_pool && config.databaseUrl) {
    _pool = new Pool({ connectionString: config.databaseUrl });
    _pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }
  return _pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  const pool = getPool();
  if (!pool) throw new Error('[db] No pool available — DATABASE_URL not configured');
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (tx: PoolClient | null) => Promise<T>): Promise<T> {
  const pool = getPool();
  if (!pool) return fn(null);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function testDbConnection(): Promise<void> {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL not configured');
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('  DB ✓ PostgreSQL connected');
  } finally {
    client.release();
  }
}

export async function isDbConnected(): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch {
    return false;
  }
}
