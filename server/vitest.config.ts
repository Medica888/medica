import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // SMTP_HOST/SMTP_PORT pin to config.ts's own pre-Mailpit defaults (loopback:587)
    // so tests stay hermetic regardless of local SMTP config (e.g. Mailpit for local
    // dev) — without this, any test file that doesn't call setEmailSender() with an
    // InMemoryEmailSender falls through to the real SmtpEmailSender singleton and
    // reaches it. This combination is what every test already safely relied on before
    // Mailpit existed: nothing listens on 127.0.0.1:587, so sends fail immediately
    // with ECONNREFUSED (caught by AuthService) instead of a slow DNS timeout — an
    // unresolvable hostname like 'smtp.invalid' looked safer but added ~5s per send
    // via getaddrinfo ENOTFOUND, timing out tests that register in a loop.
    env: { NODE_ENV: 'test', DATABASE_URL: '', SMTP_HOST: '127.0.0.1', SMTP_PORT: '587' },
    include: ['src/**/*.test.ts'],
    exclude: ['src/integration/**'],
    pool: 'threads',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
    },
  },
});
