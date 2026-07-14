import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';
import { makeTestEmail, TEST_NAME, TEST_PASSWORD, register } from './helpers/auth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_DB_URL = 'postgresql://postgres:postgres@localhost:5432/medica_e2e';

// Fields that must never appear in a pre-submit Exam student-view response —
// verbatim list from the server-owned answer-key hardening task.
const REVEAL_FIELDS = [
  'correct', 'correctAnswer', 'correct_answer', 'explanation',
  'optionExplanations', 'highYieldPearl', 'memoryAnchor', 'commonTrap',
];

/**
 * Seeds the reviewed authored QBank corpus into the E2E database so an
 * authenticated Exam request can be satisfied by the server-owned reviewed
 * pool without a live ANTHROPIC_API_KEY. Unlike every other quiz-touching E2E
 * spec, this file does NOT call helpers/quiz.ts's blockLiveAIGeneration — the
 * whole point is to exercise the real /api/generate-questions response, not
 * the mocked 503 that forces local-bank fallback. Runs last alphabetically
 * (08-), after every other spec's assertions have already completed, so
 * seeding this content has no effect on them.
 */
test.beforeAll(() => {
  const serverDir = path.resolve(__dirname, '../../server');
  execSync('npm run db:seed-authored', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: E2E_DB_URL },
    stdio: 'inherit',
    timeout: 60_000,
  });
});

test.describe('Authenticated Exam mode is server-owned end to end', () => {
  test.beforeEach(async ({ page }) => {
    // A dedicated, freshly-registered user rather than the shared E2E user —
    // by this point in the suite the shared user has completed several exam/
    // practice sessions (specs 01-07), which is enough concept-mastery history
    // to enable the adaptive blueprint (AdaptiveExamService.MIN_FOR_ADAPTIVE).
    // Adaptive mode forces bankPool=[] and requires live AI to fill the whole
    // block, which this environment has no ANTHROPIC_API_KEY for. A brand new
    // user has zero mastery rows, so adaptive stays disabled and this test's
    // routing through the reviewed-bank path is deterministic regardless of
    // what other specs did to the shared user or what order they ran in.
    await page.context().clearCookies();
    await page.goto('/');
    await register(page, makeTestEmail(), TEST_NAME, TEST_PASSWORD);
    // register() leaves the app on the Settings panel; reload back to the
    // Dashboard route where the quiz-builder CTA lives.
    await page.goto('/');
  });

  test('generation calls the real backend, strips answer-key fields, and stays answerable and reviewable after submit', async ({ page }) => {
    const hero = page.locator('.db-hero-actions');
    await hero.waitFor({ state: 'visible' });

    const [generateResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/generate-questions'), { timeout: 30_000 }),
      (async () => {
        await hero.getByRole('button', { name: /^Build (First Block|Custom Block)$/ }).click();
        await page.waitForSelector('text=Generate Your Personalized');
        await page.getByRole('button', { name: 'Generate Quiz' }).click();
      })(),
    ]);

    // 1. The real endpoint was called (not the mocked local-fallback path).
    expect(generateResponse.ok()).toBeTruthy();
    const body = await generateResponse.json();
    expect(Array.isArray(body.questions)).toBe(true);
    expect(body.questions.length).toBeGreaterThan(0);
    // Confirms this is the server-owned student-view path, not a local-bank response.
    expect(body.telemetry?.studentView).toBe(true);

    // 2. No reveal field is present on any question in the response.
    for (const question of body.questions) {
      for (const field of REVEAL_FIELDS) {
        expect(question).not.toHaveProperty(field);
      }
    }

    // 3. The session is still answerable and submittable.
    await page.locator('.exam-opt').first().waitFor({ timeout: 20_000 });
    const navButtons = page.locator('[aria-label="Question navigator"] button');
    const total = await navButtons.count();
    expect(total).toBe(body.questions.length);

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

    // 4. Review page shows explanations only after submit — the pre-submit
    // response asserted above had none; the post-submit review is built from
    // the backend's scored session, which carries the full authoritative body.
    await page.getByRole('button', { name: 'Review All Answers' }).click();
    await page.waitForSelector('.erv-card, [class*="erv-card"]', { timeout: 10_000 });

    const detailsToggle = page.getByRole('button', { name: /Show teaching details/ }).first();
    await detailsToggle.waitFor({ state: 'visible' });
    await detailsToggle.click();
    await expect(page.locator('.erv-explanation').first()).toBeVisible();
    const explanationText = await page.locator('.erv-explanation').first().textContent();
    expect(explanationText?.trim().length).toBeGreaterThan(0);
  });
});
