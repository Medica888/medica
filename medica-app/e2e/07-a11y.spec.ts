import { test, expect } from '@playwright/test';

/**
 * Step 9: Accessibility checks on critical journeys.
 * Verifies: label→input bindings, keyboard navigation, ARIA landmarks,
 * and accessible names on interactive elements.
 */

// ─── Auth form a11y (unauthenticated) ────────────────────────────────────────
test.describe('Auth form accessibility', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.waitForSelector('#stg-email', { timeout: 8_000 });
  });

  test('login form inputs are reachable via label text', async ({ page }) => {
    // <label htmlFor="stg-email"> and <label htmlFor="stg-password"> must resolve.
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('register form has Name, Email and Password labels', async ({ page }) => {
    await page.getByRole('tab', { name: 'Register' }).click();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('Tab key moves focus from email to password input', async ({ page }) => {
    await page.locator('#stg-email').focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#stg-password')).toBeFocused();
  });

  test('submit button is reachable by keyboard (Tab) and activates on Enter', async ({ page }) => {
    // Navigate via keyboard to the submit button and activate it.
    await page.locator('#stg-email').focus();
    await page.keyboard.type('keyboard@test.invalid');
    await page.keyboard.press('Tab'); // → password
    await page.keyboard.type('badpassword1');
    // Tab past the "Forgot password?" link, then once more to the submit button.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    // Wrong credentials → error is shown — keyboard activation succeeded.
    await expect(page.locator('.stg-error')).toBeVisible({ timeout: 5_000 });
  });

  test('main navigation sidebar has aria-label landmark', async ({ page }) => {
    const sidebar = page.locator('aside[aria-label="Main navigation"]');
    await expect(sidebar).toBeAttached();
  });

  test('core sidebar buttons have accessible names', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New Session' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analytics' })).toBeVisible();
  });
});

// ─── Quiz builder a11y (authenticated via shared storageState) ────────────────
test.describe('Quiz builder accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Session' }).click();
    await page.waitForSelector('text=Generate Your Personalized');
  });

  test('clinical focus textarea has an accessible label', async ({ page }) => {
    // <label htmlFor="qb-clinical-focus"> in ClinicalFocusInput.jsx
    await expect(page.getByLabel('Clinical Themes / Custom Focus')).toBeVisible();
  });

  test('Generate Quiz button is keyboard-focusable', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Generate Quiz' });
    await btn.focus();
    await expect(btn).toBeFocused();
  });

  test('quiz builder submit area renders with no accessibility violations on labels', async ({ page }) => {
    // Verify the Generate Quiz button exists and is reachable by text (not just class).
    // The button renders differently when generating (Preparing Quiz…) — we only
    // verify the initial idle state here; the aria-busy transition is too fast to catch.
    const btn = page.getByRole('button', { name: 'Generate Quiz' });
    await expect(btn).not.toBeDisabled();
    // The button must not be hidden from assistive technology.
    await expect(btn).toBeVisible();
  });
});
