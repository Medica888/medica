import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

import { getPool } from '../config/db.js';
import { logger } from '../lib/logger.js';

async function init(): Promise<void> {
  const pool = getPool();
  if (!pool) {
    logger.error('DATABASE_URL is not set. Set it in server/.env and retry.');
    process.exit(1);
  }

  const schemaPath = join(__dirname, 'schema.sql');
  const sql = readFileSync(schemaPath, 'utf-8');

  const client = await pool.connect();
  try {
    logger.info('Running schema initialization...');
    await client.query(sql);
    logger.info('Schema initialized successfully');
  } catch (err) {
    logger.error('Schema initialization failed', { error: String(err) });
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

init();
