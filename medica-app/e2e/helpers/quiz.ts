import type { Page } from '@playwright/test';

/**
 * Open the quiz builder from the Dashboard hero CTA. The button reads
 * "Build First Block" for a user with no session history, or
 * "Build Custom Block" once they have one (Dashboard.jsx) - both wire to
 * the same startCustomQuiz handler, so match either label rather than
 * assuming a fixed history state (the shared E2E user accumulates
 * sessions as the suite runs).
 */
export async function openQuizBuilder(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Build (First Block|Custom Block)$/ }).click();
}

/**
 * Navigate to the quiz builder, generate a session using the local bank
 * (no API mock needed - the app serves questions from its built-in bank),
 * answer every question, submit, and wait for the score badge.
 */
export async function runQuizToCompletion(page: Page): Promise<void> {
  await openQuizBuilder(page);
  await page.waitForSelector('text=Generate Your Personalized');

  // Trigger generation (uses local bank - no API call needed).
  await page.getByRole('button', { name: 'Generate Quiz' }).click();

  // Wait for the first question option to appear.
  await page.locator('.exam-opt').first().waitFor({ timeout: 20_000 });

  // Determine total question count from the navigator buttons.
  const navButtons = page.locator('[aria-label="Question navigator"] button');
  const total = await navButtons.count();

  // Answer every question: click option A, navigate to next.
  for (let i = 0; i < total; i++) {
    await page.locator('.exam-opt').first().waitFor({ state: 'visible' });
    await page.locator('.exam-opt').first().click();
    if (i < total - 1) {
      // aria-label is "Next question" - NOT "Next".
      await page.getByRole('button', { name: 'Next question' }).click();
    }
  }

  // Submit via the header button.
  await page.getByRole('button', { name: 'Submit Exam' }).click();

  // Confirm in the modal — the confirm button has aria-label "Confirm and submit exam".
  await page.waitForSelector('[role="dialog"][aria-label="Submit exam confirmation"]', { timeout: 5_000 });
  await page.getByRole('button', { name: 'Confirm and submit exam' }).click();

  // After confirming, App.jsx transitions to quizPhase='exam-results' and renders
  // ExamResults (.cr-page) instead of QuizSession. Wait for that results page.
  await page.waitForSelector('.cr-page', { timeout: 10_000 });
}

/**
 * Returns the number of questions shown in the current exam session.
 * Call after the quiz has loaded (after Generate Quiz click).
 */
export async function getQuestionCount(page: Page): Promise<number> {
  const navButtons = page.locator('[aria-label="Question navigator"] button');
  return navButtons.count();
}
