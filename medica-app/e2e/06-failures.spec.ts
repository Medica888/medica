import { test, expect } from '@playwright/test';
import { SHARED_EMAIL } from './helpers/shared-user';

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
    // Verify the user is logged in - Connected card has Disconnect button.
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible({ timeout: 5_000 });

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
});
