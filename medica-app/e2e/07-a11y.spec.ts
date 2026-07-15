import { test, expect } from '@playwright/test';
import { openQuizBuilder } from './helpers/quiz';

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
    await expect(page.getByRole('button', { name: 'QBank' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Analytics' })).toBeVisible();
  });
});

// ─── Quiz builder a11y (authenticated via shared storageState) ────────────────
test.describe('Quiz builder accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await openQuizBuilder(page);
    await page.waitForSelector('text=Build Your Step');
  });

  test('clinical focus textarea has an accessible label', async ({ page }) => {
    // <label htmlFor="qb-clinical-focus"> in ClinicalFocusInput.jsx
    await expect(page.getByLabel('Clinical Themes / Custom Focus')).toBeVisible();
  });

  test('Start Session button is keyboard-focusable', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Start Session' });
    await btn.focus();
    await expect(btn).toBeFocused();
  });

  test('Start Session button is exposed with an accessible name and is enabled', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Start Session' });
    await expect(btn).toBeVisible();
    await expect(btn).not.toBeDisabled();
  });
});

