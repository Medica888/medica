import { chromium, request } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { SHARED_EMAIL, SHARED_NAME, SHARED_PASSWORD } from './helpers/shared-user';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

const BACKEND_URL = 'http://localhost:4001';
const FRONTEND_URL = 'http://localhost:5173';

/**
 * Runs AFTER webServers are ready. Creates ONE shared authenticated user and
 * saves the cookie state so specs 02-06 can start pre-authenticated without
 * registering a fresh user per test (which would hit the rate limiter).
 */
export default async function globalSetup() {
  const api = await request.newContext({ baseURL: BACKEND_URL });
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await api.post('/api/auth/register', {
      data: {
        email: SHARED_EMAIL,
        name: SHARED_NAME,
        password: SHARED_PASSWORD,
      },
    }).catch(() => null);

    await page.goto(FRONTEND_URL);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('#stg-email', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Log In' }).click();
    await page.fill('#stg-email', SHARED_EMAIL);
    await page.fill('#stg-password', SHARED_PASSWORD);
    await page.locator('.stg-submit-btn').click();
    await page.waitForSelector('button[class*="stg-logout-btn"], .stg-logout-btn', { timeout: 15_000 });

    // Persist authenticated cookies for all specs that use storageState.
    await context.storageState({ path: AUTH_FILE });
    console.log(`[globalSetup] Shared user ready -> ${AUTH_FILE}`);
  } finally {
    await browser.close();
    await api.dispose();
  }
}
