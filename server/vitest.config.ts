import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: { NODE_ENV: 'test', DATABASE_URL: '' },
    include: ['src/**/*.test.ts'],
    exclude: ['src/integration/**'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
