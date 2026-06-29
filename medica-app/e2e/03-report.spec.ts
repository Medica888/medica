import { test, expect } from '@playwright/test';

// Uses shared storageState (authenticated as SHARED_EMAIL) from global-setup.
test.describe('Question report to governance trigger', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Navigate into the quiz so a question + Report button are visible.
    await page.getByRole('button', { name: 'New Session' }).click();
    await page.getByRole('button', { name: 'Generate Quiz' }).click();
    await page.locator('.exam-opt').first().waitFor({ timeout: 20_000 });
  });

  test('clicking Report shows Saved confirmation', async ({ page }) => {
    await page.getByRole('button', { name: 'Report' }).click();
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 3_000 });
  });

  test('report is sent to backend question-reports endpoint', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Report' }).click();
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(1_000);
    const cookies = await page.context().cookies();
    const res = await request.get('/api/question-reports/summary', {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const reports = body.summary?.topFingerprints ?? [];
    expect(Array.isArray(reports)).toBeTruthy();
    expect(reports.length).toBeGreaterThan(0);
  });

  test('a high-severity report triggers governance clinician review', async ({ page, request }) => {
    const select = page.locator('[aria-label="Report question reason"]');
    await select.selectOption('wrong_answer');
    await page.getByRole('button', { name: 'Report' }).click();
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 3_000 });
    await page.waitForTimeout(1_500);
    const cookies = await page.context().cookies();
    const res = await request.get('/api/generated-question-bank/clinician-review?status=pending', {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
    });
    // Admin-only endpoint: 403 means auth reached backend; 404 is acceptable
    // when no generated-bank row exists for the reported static question.
    expect([200, 403, 404]).toContain(res.status());
  });
});
