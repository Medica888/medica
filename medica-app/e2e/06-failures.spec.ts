import { test, expect } from '@playwright/test';
import { SHARED_EMAIL } from './helpers/shared-user';
import { runQuizToCompletion } from './helpers/quiz';

// Uses shared storageState (authenticated as SHARED_EMAIL) from global-setup.
test.describe('Failure paths', () => {
  test('backend auth/me returns 401 without a session cookie', async ({ request }) => {
    // Authenticated request — `request` fixture inherits cookies from storageState.
    const meRes = await request.get('/api/auth/me');
    expect(meRes.ok()).toBeTruthy();

    // Unauthenticated request — explicitly send no Cookie header.
    const unauthRes = await request.get('/api/auth/me', {
      headers: { Cookie: '' },
    });
    expect(unauthRes.status()).toBe(401);
  });

  test('expired session (cookie cleared) shows anonymous state', async ({ page }) => {
    await page.goto('/');
    // Verify the user is logged in - Connected card has Log Out button.
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Log Out' })).toBeVisible({ timeout: 5_000 });

    // Simulate session expiry.
    await page.context().clearCookies();
    await page.reload();

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#stg-email')).toBeVisible({ timeout: 8_000 });
  });

  test('backend unavailable shows connection error to user on login', async ({ page }) => {
    // Start from unauthenticated state.
    await page.context().clearCookies();
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('#stg-email', { timeout: 8_000 });
    // Block the login endpoint.
    await page.route('**/api/auth/login', route => route.abort('connectionrefused'));
    await page.getByRole('tab', { name: 'Log In' }).click();
    await page.fill('#stg-email', SHARED_EMAIL);
    await page.fill('#stg-password', 'Passw0rd-e2e!');
    await page.locator('.stg-submit-btn').click();
    await expect(page.locator('.stg-error')).toBeVisible({ timeout: 5_000 });
    const errText = await page.locator('.stg-error').textContent();
    expect(errText).toMatch(/connection|server|reach|network/i);
  });

  // NOTE — UI-level AI generation errors are intentionally out of E2E scope.
  // App.jsx sets MOCK_FALLBACK_ALLOWED = import.meta.env.DEV, which is true in any
  // Vite dev server run (including --mode e2e). When MOCK_FALLBACK_ALLOWED is true,
  // App.jsx never surfaces a generation error to the user — it silently falls back to
  // the local bank instead. Unit tests in generateAIQuestions.test.js cover the
  // formatGenerationErrorMessage logic and error propagation. The API-level contract
  // is exercised below.

  test('generate-questions endpoint returns structured error for invalid payload', async ({ page, request }) => {
    // Validates that the Zod validation middleware runs (rate limiter must not throw first).
    // Before the makeLimiter fix, ERR_ERL_CREATED_IN_REQUEST_HANDLER caused 500 here.
    // A 400 confirms the request reached the validation layer successfully.
    const cookies = await page.context().cookies();
    const res = await request.post('/api/generate-questions', {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
      data: { config: { questionCount: -1 } }, // missing mode + count below min(1)
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  test('GET /api/health returns ok from the E2E backend', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test('wrong password shows error on login attempt', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('#stg-email', { timeout: 8_000 });
    await page.getByRole('tab', { name: 'Log In' }).click();
    await page.fill('#stg-email', SHARED_EMAIL);
    await page.fill('#stg-password', 'WrongPassword1!');
    await page.locator('.stg-submit-btn').click();
    await expect(page.locator('.stg-error')).toBeVisible({ timeout: 5_000 });
  });

  test('failed session write survives reload and synchronizes after reconnect', async ({ page }) => {
    await page.route('**/api/exams', route => {
      if (route.request().method() === 'POST') route.abort('connectionrefused');
      else route.continue();
    });

    await page.goto('/');
    await runQuizToCompletion(page);
    await expect(page.locator('.sync-toast')).toContainText('pending synchronization', { timeout: 8_000 });

    await page.unroute('**/api/exams');
    await page.reload();
    await expect(page.locator('.sync-toast')).toContainText('Session synced', { timeout: 10_000 });
  });
});
