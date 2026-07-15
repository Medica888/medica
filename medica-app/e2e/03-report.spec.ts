import { test, expect } from '@playwright/test';
import pg from 'pg';
import { openQuizBuilder } from './helpers/quiz';

const E2E_DB_URL = 'postgresql://postgres:postgres@localhost:5432/medica_e2e';
const BACKEND_URL = 'http://localhost:4001';

// Uses shared storageState (authenticated as SHARED_EMAIL) from global-setup.
test.describe('Question report to governance trigger', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect.poll(async () => page.evaluate(async (backendUrl) => {
      const res = await fetch(`${backendUrl}/api/auth/me`, { credentials: 'include' });
      const body = await res.text();
      return { ok: res.ok, status: res.status, body };
    }, BACKEND_URL), {
      timeout: 15_000,
      message: 'shared E2E user should be authenticated before report tests run',
    }).toMatchObject({ ok: true });
    // Navigate into the quiz so a question + Report button are visible.
    await openQuizBuilder(page);
    await page.getByRole('button', { name: 'Start Session' }).click();
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
    const res = await request.get(`${BACKEND_URL}/api/question-reports/summary`, {
      headers: { Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; ') },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const reports = body.summary?.topFingerprints ?? [];
    expect(Array.isArray(reports)).toBeTruthy();
    expect(reports.length).toBeGreaterThan(0);
  });

  test('a high-severity report triggers governance clinician review', async ({ page }) => {
    // wrong_answer is already the default reason — select it explicitly for clarity.
    const select = page.locator('[aria-label="Report question reason"]');
    await select.selectOption('wrong_answer');
    await page.getByRole('button', { name: 'Report' }).click();
    await expect(page.locator('text=Saved')).toBeVisible({ timeout: 3_000 });

    // The backend route calls ClinicianReviewService.createOrEscalate() fire-and-forget.
    // Give it 2s to complete the async DB insert before we query.
    await page.waitForTimeout(2_000);

    // The clinician-review row is created fire-and-forget after the response is
    // sent, so there's no request to poll for completion — query the E2E database
    // directly rather than racing an admin endpoint against an async insert.
    const pool = new pg.Pool({ connectionString: E2E_DB_URL });
    try {
      const qr = await pool.query(
        `SELECT id, reason, fingerprint FROM question_reports
         WHERE reason = 'wrong_answer' ORDER BY created_at DESC LIMIT 3`,
      );
      const cr = await pool.query(
        `SELECT id, question_id, review_priority, review_status
         FROM clinician_reviews
         WHERE review_status = 'pending'
           AND review_priority = 'critical'
         ORDER BY created_at DESC LIMIT 3`,
      );
      // Diagnostic: log what we find so failures give context.
      console.log(`[governance] question_reports(wrong_answer): ${qr.rows.length}`);
      console.log(`[governance] clinician_reviews(pending/critical): ${cr.rows.length}`);
      if (qr.rows.length === 0) {
        // If no wrong_answer reports reached the backend, the governance row
        // can't exist — surface this clearly.
        console.log('[governance] No wrong_answer reports in DB — check _postReportToBackend fingerprint length');
      }
      expect(cr.rows.length).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });
});

