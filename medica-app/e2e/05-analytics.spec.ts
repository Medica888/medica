import { test, expect } from '@playwright/test';
import { runQuizToCompletion } from './helpers/quiz';

// Uses shared storageState (authenticated as SHARED_EMAIL) from global-setup.
test.describe('Analytics / session source of truth', () => {
  test('analytics shows No Session Data Yet for an empty anonymous browser', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await expect(page.locator('text=No Session Data Yet')).toBeVisible({ timeout: 5_000 });
  });

  test('analytics reflects completed session without page reload', async ({ page }) => {
    await page.goto('/');
    await runQuizToCompletion(page);
    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await page.waitForTimeout(1_500);
    await expect(page.locator('text=No Session Data Yet')).not.toBeVisible({ timeout: 8_000 });
  });

  test('backend exams/sessions endpoint returns the completed session', async ({ page, request }) => {
    await page.goto('/');
    await runQuizToCompletion(page);
    await page.waitForTimeout(500);
    const cookies = await page.context().cookies();
    const res = await request.get('/api/exams', {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const sessions = body.sessions ?? body.items ?? body.data ?? body;
    expect(Array.isArray(sessions)).toBeTruthy();
    expect(sessions.length).toBeGreaterThan(0);
  });

  test('analytics page is accessible after page reload (session persisted)', async ({ page }) => {
    await page.goto('/');
    await runQuizToCompletion(page);
    await page.reload();
    await page.getByRole('button', { name: 'Analytics', exact: true }).click();
    await page.waitForTimeout(1_500);
    await expect(page.locator('text=No Session Data Yet')).not.toBeVisible({ timeout: 8_000 });
  });
});
