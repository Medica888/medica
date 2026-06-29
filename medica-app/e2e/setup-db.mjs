/**
 * Pre-flight script - runs before `playwright test` via `npm run test:e2e`.
 * Creates the medica_e2e database and applies schema + migrations.
 * Must run as a standalone Node.js script (not inside Playwright) because
 * Playwright starts webServers before globalSetup, and the backend fails to
 * boot if the database does not exist yet.
 */
import { execSync } from 'child_process';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_DB = 'medica_e2e';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';
const E2E_DB_URL = `postgresql://postgres:postgres@localhost:5432/${E2E_DB}`;

// Kill stale processes from prior test runs. Without this, Playwright's
// reuseExistingServer:false errors on occupied ports, and a reused Vite
// server may proxy API calls to the wrong backend.
for (const port of [4001, 5173]) {
  try {
    execSync(
      `for /f "tokens=5" %a in ('netstat -ano ^| findstr ":${port} " ^| findstr "LISTENING"') do taskkill /F /PID %a`,
      { shell: 'cmd.exe', stdio: 'ignore', timeout: 10_000 },
    );
    console.log(`[e2e/setup-db] Cleared port ${port}.`);
  } catch {
    // Port was not in use — this is fine.
  }
}

const admin = new Pool({ connectionString: ADMIN_URL });
try {
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${E2E_DB}`);
  console.log(`[e2e/setup-db] Database ${E2E_DB} created.`);
} finally {
  await admin.end();
}

const serverDir = path.resolve(__dirname, '../../server');
execSync('npm run db:bootstrap', {
  cwd: serverDir,
  env: { ...process.env, DATABASE_URL: E2E_DB_URL },
  stdio: 'inherit',
  timeout: 60_000,
});
console.log('[e2e/setup-db] Schema and migrations applied.');
