import { test, expect } from '@playwright/test';
import { makeTestEmail, TEST_NAME, TEST_PASSWORD, register, login, logout, navigateToSettingsAnon } from './helpers/auth';
import { SHARED_EMAIL, SHARED_PASSWORD } from './helpers/shared-user';

test.describe('Auth lifecycle', () => {
  let email: string;

  test.beforeEach(async ({ page }) => {
    email = makeTestEmail();
    await page.goto('/');
  });

  test('register creates account and shows connected state', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await register(page, email, TEST_NAME, TEST_PASSWORD);
    // After registration, the Connected card shows with a Disconnect button.
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });

  test('session persists after page reload (HttpOnly cookie)', async ({ page }) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    // Navigate to settings to check auth state.
    await page.getByRole('button', { name: 'Settings' }).click();
    // After reload, auth.me() restores session from cookie - Disconnect button reappears.
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible({ timeout: 10_000 });
  });

  test('logout clears session - auth form reappears', async ({ page }) => {
    await logout(page);
    await expect(page.locator('#stg-email')).toBeVisible();
    // Reload confirms the session is truly gone (no cookie -> anon state).
    await page.reload();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#stg-email')).toBeVisible({ timeout: 8_000 });
  });

  test('login with correct credentials reconnects the session', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await login(page, SHARED_EMAIL, SHARED_PASSWORD);
    await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
  });

  test('GET /api/auth/me returns user data for authenticated session', async ({ page, request }) => {
    await page.goto('/');
    // Use the same cookie context as the page for the API call.
    const cookies = await page.context().cookies();
    const meRes = await request.get('/api/auth/me', {
      headers: {
        Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
      },
    });
    expect(meRes.ok()).toBeTruthy();
    const body = await meRes.json();
    expect(body.user.email).toBe(SHARED_EMAIL);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await navigateToSettingsAnon(page);
    // Ensure the login tab is active before submitting the wrong password.
    await page.getByRole('tab', { name: 'Log In' }).click();
    await page.fill('#stg-email', SHARED_EMAIL);
    await page.fill('#stg-password', 'WrongPassword1!');
    // Use the CSS class to target the submit button, not the tab button.
    await page.locator('.stg-submit-btn').click();
    await expect(page.locator('.stg-error')).toBeVisible({ timeout: 5_000 });
  });
});
