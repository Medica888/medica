import { test, expect } from '@playwright/test';

const SEED_FLASHCARD = {
  source_question_id: 'e2e-q1',
  type: 'Recall' as const,
  front: 'E2E Test: What causes the cough in ACE inhibitor therapy?',
  back: 'Bradykinin accumulation - ACE normally degrades bradykinin.',
  tag: 'Recall',
  review_status: 'new' as const,
  subject: 'Pharmacology',
  system: 'Cardiovascular',
};

// Uses shared storageState (authenticated as SHARED_EMAIL) from global-setup.
test.describe('Flashcard SRS', () => {
  let cardId: string;

  test.beforeEach(async ({ page, request }) => {
    await page.goto('/');

    // Reset and seed one flashcard directly via the API.
    const cookies = await page.context().cookies();
    await request.delete('/api/flashcards', {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
    });
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.toLowerCase().includes('flashcard')) localStorage.removeItem(key);
      }
    });
    const res = await request.post('/api/flashcards', {
      data: { flashcards: [SEED_FLASHCARD] },
      headers: {
        Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
        'Content-Type': 'application/json',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    cardId = body.flashcards[0].id;
  });

  test('flashcard page shows seeded card', async ({ page }) => {
    await page.getByRole('button', { name: 'Flashcards' }).click();
    await page.waitForTimeout(1_000);
    await expect(page.locator('text=E2E Test')).toBeVisible({ timeout: 8_000 });
  });

  test('review session advances through cards and records ease rating', async ({ page, request }) => {
    await page.getByRole('button', { name: 'Flashcards' }).click();
    await expect(page.locator('text=E2E Test')).toBeVisible({ timeout: 8_000 });
    const reviewBtn = page.getByRole('button', { name: /Start reinforcement/i });
    await reviewBtn.waitFor({ timeout: 8_000 });
    await reviewBtn.click();

    await page.getByRole('button', { name: 'Reveal Mechanism' }).click();
    await page.getByRole('button', { name: /Reinforced/i }).click();

    await page.waitForTimeout(500);

    const cookies = await page.context().cookies();
    const res = await request.get('/api/flashcards', {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const updated = body.flashcards.find((c: { id: string }) => c.id === cardId);
    expect(updated).toBeDefined();
    expect(updated.review_count).toBeGreaterThanOrEqual(1);
  });
});
