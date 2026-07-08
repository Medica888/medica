import { defineConfig, devices } from '@playwright/test';
import { SHARED_USER_ID } from './e2e/helpers/shared-user';

const E2E_DB_URL = 'postgresql://postgres:postgres@localhost:5432/medica_e2e';
const BACKEND_PORT = 4001;
const FRONTEND_PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    // Specs 02-06 inherit this cookie so they start pre-authenticated.
    // Spec 01 overrides with an empty state to test the auth flow from scratch.
    storageState: './e2e/.auth/user.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix ../server run start:test',
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      timeout: process.env.CI ? 120_000 : 30_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: E2E_DB_URL,
        PORT: String(BACKEND_PORT),
        NODE_ENV: 'test',
        JWT_SECRET: 'e2e-test-secret-not-for-production',
        ADMIN_USER_IDS: SHARED_USER_ID,
        ALLOWED_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
      },
    },
    {
      // --mode e2e loads .env.e2e which points VITE_BACKEND_URL at port 4001.
      command: 'npm run dev -- --mode e2e',
      url: `http://localhost:${FRONTEND_PORT}`,
      timeout: process.env.CI ? 120_000 : 30_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_BACKEND_URL: `http://localhost:${BACKEND_PORT}`,
        VITE_USE_BACKEND: 'true',
        VITE_USE_BACKEND_API: 'true',
        VITE_ALLOW_MOCK_FALLBACK: 'false',
      },
    },
  ],
});
