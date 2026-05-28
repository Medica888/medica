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
}
