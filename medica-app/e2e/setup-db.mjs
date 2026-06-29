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

// Kill any existing process on port 4001 (stale backend from a prior test run).
// Without this, Playwright's reuseExistingServer:false errors on the occupied port.
try {
  // Try netstat + taskkill (works in both cmd and PowerShell on Windows).
  execSync(
    'for /f "tokens=5" %a in (\'netstat -ano ^| findstr ":4001 " ^| findstr "LISTENING"\') do taskkill /F /PID %a',
    { shell: 'cmd.exe', stdio: 'ignore', timeout: 10_000 },
  );
  console.log('[e2e/setup-db] Cleared port 4001.');
} catch {
  // Port was not in use — this is fine.
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
