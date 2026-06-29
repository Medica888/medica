import { Pool } from 'pg';
// pg is a CommonJS module; the default import works in both ESM and CJS contexts.

const E2E_DB = 'medica_e2e';
const ADMIN_URL = 'postgresql://postgres:postgres@localhost:5432/postgres';

export default async function globalTeardown() {
  const admin = new Pool({ connectionString: ADMIN_URL });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
  } catch {
    // Non-fatal - database may already be gone or unreachable.
  } finally {
    await admin.end();
  }
}
