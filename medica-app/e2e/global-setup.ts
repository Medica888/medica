import { request } from '@playwright/test';
import pg from 'pg';
import path from 'path';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { SHARED_EMAIL, SHARED_NAME, SHARED_PASSWORD, SHARED_USER_ID } from './helpers/shared-user';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

const BACKEND_URL = 'http://localhost:4001';
const E2E_DB_URL = 'postgresql://postgres:postgres@localhost:5432/medica_e2e';

/**
 * Runs AFTER webServers are ready. Creates ONE shared authenticated user and
 * saves the cookie state so specs 02-06 can start pre-authenticated without
 * registering a fresh user per test (which would hit the rate limiter).
 */
export default async function globalSetup() {
  const api = await request.newContext({ baseURL: BACKEND_URL });
  const pool = new pg.Pool({ connectionString: E2E_DB_URL });
  try {
    await api.post('/api/auth/register', {
      data: {
        email: SHARED_EMAIL,
        name: SHARED_NAME,
        password: SHARED_PASSWORD,
      },
    }).catch(() => null);

    await pool.query(
      `UPDATE users
       SET id = $1,
           email_verified = true,
           email_verified_at = now(),
           created_at = now() - interval '48 hours'
       WHERE email = $2`,
      [SHARED_USER_ID, SHARED_EMAIL],
    );

    const login = await api.post('/api/auth/login', {
      data: {
        email: SHARED_EMAIL,
        password: SHARED_PASSWORD,
      },
    });
    if (!login.ok()) {
      throw new Error(`[globalSetup] Shared user login failed: ${login.status()} ${await login.text()}`);
    }

    // Persist authenticated cookies for all specs that use storageState.
    await mkdir(path.dirname(AUTH_FILE), { recursive: true });
    await api.storageState({ path: AUTH_FILE });
    console.log(`[globalSetup] Shared user ready -> ${AUTH_FILE}`);
  } finally {
    await pool.end();
    await api.dispose();
  }
}
