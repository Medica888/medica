import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-ignore — node-pg-migrate CJS exports runner as a named export
import { runner } from 'node-pg-migrate';
import { logger } from '../lib/logger.js';

// Idempotent: schema.sql uses IF NOT EXISTS; node-pg-migrate skips already-applied migrations.
export async function bootstrapDatabase(url: string): Promise<void> {
  const schemaPath = join(__dirname, 'schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf-8');

  const schemaPool = new Pool({ connectionString: url });
  try {
    await schemaPool.query(schemaSql);
  } finally {
    await schemaPool.end();
  }

  await (runner as Function)({
    databaseUrl: url,
    dir: join(__dirname, '..', '..', 'migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
}

// CLI entry point — only executes when this file is run directly via tsx.
if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv').config();

  const url = process.env.DATABASE_URL;
  if (!url) {
    logger.error('DATABASE_URL is not set. Add it to server/.env and retry.');
    process.exit(1);
  }

  bootstrapDatabase(url)
    .then(() => {
      logger.info('Database bootstrap complete.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      logger.error('Bootstrap failed', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    });
}
