import type { Page } from '@playwright/test';

const aiBlockedPages = new WeakSet<Page>();

/**
 * Make quiz generation deterministic in E2E by forcing the app down its
 * existing validated local-bank fallback path instead of depending on a live
 * AI provider key.
 */
export async function blockLiveAIGeneration(page: Page): Promise<void> {
  if (aiBlockedPages.has(page)) return;
  aiBlockedPages.add(page);

  await page.route('**/api/generate-questions', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'AI generation unavailable - API key not configured',
        code: 'NO_API_KEY',
      }),
    }),
  );
}

/**
 * Open the quiz builder from the Dashboard hero CTA. The button reads
 * "Start First Session" for a user with no session history, or
 * "Build Custom Set" once they have one (Dashboard.jsx). Both wire to
 * the same startCustomQuiz handler, so match either label rather than
 * assuming a fixed history state.
 */
export async function openQuizBuilder(page: Page): Promise<void> {
  await blockLiveAIGeneration(page);
  const hero = page.locator('.db-hero-actions');
  await hero.waitFor({ state: 'visible' });
  await hero.getByRole('button', { name: /^(Start First Session|Build Custom Set)$/ }).click();
}

/**
 * Navigate to the quiz builder, generate a session using the local bank,
 * answer every question, submit, and wait for the score badge.
 */
export async function runQuizToCompletion(page: Page): Promise<void> {
  await openQuizBuilder(page);
  await page.waitForSelector('text=Build Your Step');

  await page.getByRole('button', { name: 'Start Session' }).click();
  await page.locator('.exam-opt').first().waitFor({ timeout: 20_000 });

  const navButtons = page.locator('[aria-label="Question navigator"] button');
  const total = await navButtons.count();

  for (let i = 0; i < total; i++) {
    await page.locator('.exam-opt').first().waitFor({ state: 'visible' });
    await page.locator('.exam-opt').first().click();
    if (i < total - 1) {
      await page.getByRole('button', { name: 'Next question' }).click();
    }
  }

  await page.getByRole('button', { name: 'Submit Exam' }).click();
  await page.waitForSelector('[role="dialog"][aria-label="Submit exam confirmation"]', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Confirm and submit exam' }).click();
  await page.waitForSelector('.cr-page', { timeout: 10_000 });
}

/**
 * Returns the number of questions shown in the current exam session.
 * Call after the quiz has loaded (after Start Session click).
 */
export async function getQuestionCount(page: Page): Promise<number> {
  const navButtons = page.locator('[aria-label="Question navigator"] button');
  return navButtons.count();
}

