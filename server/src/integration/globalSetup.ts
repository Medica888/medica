import { Pool } from 'pg';
import { readFileSync } from 'fs';
import path from 'path';
// @ts-ignore — node-pg-migrate CJS exports runner as a named export
import { runner } from 'node-pg-migrate';

let stopContainer: (() => Promise<void>) | null = null;

export async function setup(): Promise<void> {
  let url = process.env.TEST_PG_URL ?? '';

  if (!url) {
    // Start an isolated PostgreSQL container when Docker is available.
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withStartupTimeout(120_000)
      .start();
    url = container.getConnectionUri();
    stopContainer = async () => { await container.stop({ timeout: 10 }); };
  }

  // Run schema.sql to create the 5 baseline tables.
  const schemaPath = path.resolve(process.cwd(), 'src/db/schema.sql');
  const schemaSql = readFileSync(schemaPath, 'utf-8');
  const schemaPool = new Pool({ connectionString: url });
  try {
    await schemaPool.query(schemaSql);
  } finally {
    await schemaPool.end();
  }

  // Apply all 22 node-pg-migrate migrations on top of the baseline schema.
  await (runner as Function)({
    databaseUrl: url,
    dir: path.resolve(process.cwd(), 'migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  process.env.INTEGRATION_DATABASE_URL = url;
}

export async function teardown(): Promise<void> {
  if (stopContainer) await stopContainer();
}
