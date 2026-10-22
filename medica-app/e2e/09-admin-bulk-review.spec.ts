import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const E2E_DB_URL = 'postgresql://postgres:postgres@localhost:5432/medica_e2e';
const BACKEND_URL = 'http://localhost:4001';

interface QueueQuestion {
  externalId: string;
  difficulty: string;
  commercialReady: boolean;
}

/**
 * Seeds the authored QBank so the review queue holds unreviewed (not student-visible)
 * questions. The seed is idempotent and never overwrites admin review decisions.
 * Runs as the shared E2E user, who is an admin via ADMIN_USER_IDS in playwright.config.ts.
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

test.describe('Admin bulk review makes questions student-visible', () => {
  test('marking unreviewed questions reviewed in the queue unlocks them for QBank sessions', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Review Queue' }).click();

    const isQueueGet = (res: { url(): string; request(): { method(): string } }) =>
      res.url().includes('/generated-question-bank/review') && res.request().method() === 'GET';
    // Hard-mode difficulties need Expert reviewed, so batch plain Balanced items for Source checked.
    await page.getByLabel('Difficulty', { exact: true }).selectOption('Balanced');
    const filteredResponsePromise = page.waitForResponse(
      (res) => isQueueGet(res) && res.url().includes('reviewStatus=unreviewed') && res.url().includes('difficulty=Balanced'),
      { timeout: 20_000 },
    );
    await page.getByLabel('Review', { exact: true }).selectOption('unreviewed');
    const queueBody = (await (await filteredResponsePromise).json()) as { questions: QueueQuestion[] };

    // The server applied the difficulty filter: every row is Balanced.
    expect(queueBody.questions.length).toBeGreaterThan(0);
    expect(queueBody.questions.every((q) => q.difficulty === 'Balanced')).toBe(true);
    const candidates = queueBody.questions.filter((q) => !q.commercialReady);
    expect(candidates.length).toBeGreaterThanOrEqual(3);
    const [first, second, untouched] = candidates.map((q) => q.externalId);

    const startSession = (ids: string[]) =>
      page.request.post(`${BACKEND_URL}/api/qbank/sessions`, { data: { ids } });

    // Before: none of the three is student-visible.
    for (const id of [first, second, untouched]) {
      expect((await startSession([id])).status()).toBe(409);
    }

    await page.getByRole('checkbox', { name: `Select question ${first}` }).check();
    await page.getByRole('checkbox', { name: `Select question ${second}` }).check();
    await page.getByRole('button', { name: 'Mark reviewed...' }).click();

    const panel = page.getByRole('form', { name: 'Mark selected questions reviewed' });
    const submit = panel.getByRole('button', { name: 'Mark 2 reviewed' });
    await expect(submit).toBeDisabled();

    await panel.getByLabel('Source references (one per line)').fill('First Aid 2025\nPathoma');
    await expect(submit).toBeDisabled();
    await panel.getByLabel(/I checked the medical content/).check();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole('status')).toHaveText('2 marked reviewed.');

    // After: exactly the two reviewed questions are student-visible; the third is still gated.
    const unlocked = await startSession([first, second]);
    expect(unlocked.status()).toBe(201);
    const unlockedBody = (await unlocked.json()) as { questions: Array<{ id: string }> };
    expect(unlockedBody.questions.map((q) => q.id).sort()).toEqual([first, second].sort());
    expect((await startSession([untouched])).status()).toBe(409);
  });
});
