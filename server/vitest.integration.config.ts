import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/integration/**/*.test.ts'],
    globalSetup: ['src/integration/globalSetup.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
    fileParallelism: false,
  },
});
