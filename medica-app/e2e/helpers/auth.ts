import type { Page } from '@playwright/test';
import { randomBytes } from 'crypto';

export function makeTestEmail(): string {
  return `e2e-${randomBytes(4).toString('hex')}@test.medica`;
}

export const TEST_PASSWORD = 'Passw0rd-e2e!';
export const TEST_NAME = 'E2E Test User';

export async function navigateToSettingsAnon(page: Page): Promise<void> {
  // Navigate to Settings and wait for the login form (unauthenticated state).
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForSelector('#stg-email', { timeout: 8_000 });
}

export async function navigateToSettings(page: Page): Promise<void> {
  // Navigate to Settings; waits for the page to stabilise (connected or not).
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
}

/** After login/register, the app shows the Connected card with a Log Out button. */
export async function waitForConnected(page: Page): Promise<void> {
  await page.waitForSelector('button[class*="stg-logout-btn"], .stg-logout-btn', { timeout: 10_000 });
}

export async function register(
  page: Page,
  email: string,
  name = TEST_NAME,
  password = TEST_PASSWORD,
): Promise<void> {
  await navigateToSettingsAnon(page);
  await page.getByRole('tab', { name: 'Register' }).click();
  await page.fill('#stg-name', name);
  await page.fill('#stg-email', email);
  await page.fill('#stg-password', password);
  await page.locator('.stg-submit-btn').click();
  await waitForConnected(page);
}

export async function login(
  page: Page,
  email: string,
  password = TEST_PASSWORD,
): Promise<void> {
  await navigateToSettingsAnon(page);
  // Login tab is the default; ensure we're on it.
  await page.getByRole('tab', { name: 'Log In' }).click();
  await page.fill('#stg-email', email);
  await page.fill('#stg-password', password);
  await page.locator('.stg-submit-btn').click();
  await waitForConnected(page);
}

export async function logout(page: Page): Promise<void> {
  await navigateToSettings(page);
  await page.getByRole('button', { name: 'Log Out' }).click();
  // Wait for the auth form to reappear.
  await page.waitForSelector('#stg-email', { timeout: 5_000 });
}
