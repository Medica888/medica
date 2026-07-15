import { test, expect } from '@playwright/test';
import { runQuizToCompletion, getQuestionCount, openQuizBuilder } from './helpers/quiz';

// Uses shared storageState (authenticated as SHARED_EMAIL) from global-setup.
test.describe('Quiz generation and completion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('quiz builder is visible after starting a new block', async ({ page }) => {
    await openQuizBuilder(page);
    await expect(page.locator('text=Build Your Step')).toBeVisible();
  });

  test('questions load and are answerable after generation', async ({ page }) => {
    await openQuizBuilder(page);
    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.locator('.exam-opt').first().waitFor({ timeout: 20_000 });
    await expect(page.locator('.exam-opt')).toHaveCount(4);
    await page.locator('.exam-opt').first().click();
    // Option A becomes selected (CSS class "selected" added).
    await expect(page.locator('.exam-opt.selected')).toHaveCount(1);
  });

  test('quiz completes and shows exam results page', async ({ page }) => {
    await runQuizToCompletion(page);
    // After submit, App renders ExamResults (.cr-page) not the QuizSession view.
    await expect(page.locator('.cr-page')).toBeVisible();
    // The accuracy KPI should show a percentage.
    await expect(page.locator('.cr-kpi--accuracy .cr-kpi-num')).toBeVisible();
  });

  test('completed session is saved to backend', async ({ page, request }) => {
    await runQuizToCompletion(page);
    await page.waitForTimeout(800);
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

  test('question count is shown in the exam header', async ({ page }) => {
    await openQuizBuilder(page);
    await page.getByRole('button', { name: 'Start Session' }).click();
    await page.locator('.exam-opt').first().waitFor({ timeout: 20_000 });
    const total = await getQuestionCount(page);
    const headerText = await page.locator('.exam-hdr-qcount').textContent();
    expect(headerText).toContain(`/ ${total}`);
  });
});

