import dotenv from 'dotenv';

dotenv.config();

const DEV_JWT_SECRET = 'dev-secret-change-in-production';

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  databaseUrl: process.env.DATABASE_URL,
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim()),
  authDevTokensEnabled: process.env.AUTH_DEV_TOKENS_ENABLED === 'true',
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  emailFrom: process.env.EMAIL_FROM ?? 'noreply@medica.app',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:5173',
  cookieSecure: process.env.NODE_ENV === 'production',
} as const;

if (config.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_SECRET) {
    throw new Error(
      '[config] JWT_SECRET must be set to a secure random value in production. ' +
        'The default dev secret was detected — refusing to start.',
    );
  }

  const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];
  if (config.allowedOrigins.every((o) => DEV_ORIGINS.includes(o))) {
    throw new Error(
      '[config] ALLOWED_ORIGINS must be set to production domains. ' +
        'Only localhost origins detected — refusing to start.',
    );
  }

  if (process.env.AUTH_DEV_TOKENS_ENABLED === 'true') {
    throw new Error('[config] AUTH_DEV_TOKENS_ENABLED must be false in production');
  }

  if (!process.env.SMTP_HOST) {
    throw new Error(
      '[config] SMTP_HOST must be set in production for email delivery — refusing to start.',
    );
  }

  if (!process.env.EMAIL_FROM) {
    throw new Error('[config] EMAIL_FROM must be set in production — refusing to start.');
  }

  if (!process.env.APP_BASE_URL || process.env.APP_BASE_URL.includes('localhost')) {
    throw new Error(
      '[config] APP_BASE_URL must be set to a non-localhost production URL — refusing to start.',
    );
  }
}
