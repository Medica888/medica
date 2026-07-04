import dotenv from 'dotenv';

dotenv.config();

const DEV_JWT_SECRET = 'dev-secret-change-in-production';

// Parse TRUST_PROXY env var for Express's "trust proxy" setting.
// Accepts a hop count ("1"), a boolean string ("true"/"false"), or a subnet string ("loopback").
// Default false (no proxy trust) is safe for direct deployments.
function parseTrustProxy(v?: string): number | boolean | string {
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? v : n;
}

// Parse a duration string like '7d', '24h', '3600s' into seconds.
// Only d/h/m/s units are supported. Throws on unrecognised format.
function parseDuration(expr: string): number {
  const match = /^(\d+)([smhd])$/.exec(expr);
  if (!match) {
    throw new Error(
      `[config] Invalid JWT_EXPIRES_IN format: "${expr}". Use a number followed by s/m/h/d (e.g. 7d).`,
    );
  }
  const n = parseInt(match[1], 10);
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * multipliers[match[2]];
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

// Parse a per-day budget integer. Returns null (unlimited) when unset.
// Requires a complete base-10 integer string — rejects decimals, suffixes, whitespace-only.
function parseDailyBudget(name: string, raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`[config] ${name} must be a non-negative integer (no decimals, no suffixes), got: "${raw}"`);
  }
  return parseInt(trimmed, 10);
}

export interface GeneratedBankReusePolicy {
  approvedOnly: boolean;
  validatedFallbackAllowed: boolean;
}

export function getGeneratedBankReusePolicy(
  env: NodeJS.ProcessEnv = process.env,
): GeneratedBankReusePolicy {
  const production = env.NODE_ENV === 'production';
  const explicitlyRequiresApproval = env.REQUIRE_APPROVAL_FOR_PRODUCTION === 'true';
  const explicitlyDisablesValidatedReuse = env.ALLOW_VALIDATED_REUSE === 'false';
  const approvedOnly = production || explicitlyRequiresApproval || explicitlyDisablesValidatedReuse;
  return {
    approvedOnly,
    validatedFallbackAllowed: !approvedOnly,
  };
}

export const config = {
  port: parseInt(process.env.PORT ?? '4000', 10),
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? DEV_JWT_SECRET,
  jwtExpiresIn: JWT_EXPIRES_IN,
  // Single source of truth: both cookie maxAge and JWT expiresIn derive from this.
  sessionMaxAgeSeconds: parseDuration(JWT_EXPIRES_IN),
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
  generatedBankReuse: getGeneratedBankReusePolicy(),
  /** null = unlimited. Env var: AI_REQUEST_BUDGET_PER_DAY */
  aiRequestBudgetPerDay: parseDailyBudget('AI_REQUEST_BUDGET_PER_DAY', process.env.AI_REQUEST_BUDGET_PER_DAY),
  /** null = unlimited. Env var: AI_TOKEN_BUDGET_PER_DAY */
  aiTokenBudgetPerDay: parseDailyBudget('AI_TOKEN_BUDGET_PER_DAY', process.env.AI_TOKEN_BUDGET_PER_DAY),
} as const;

if (config.nodeEnv === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_SECRET) {
    throw new Error(
      '[config] JWT_SECRET must be set to a secure random value in production. ' +
        'The default dev secret was detected — refusing to start.',
    );
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      '[config] DATABASE_URL must be set in production. ' +
        'Running without it enables in-memory mode — all data is lost on restart.',
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

  if (process.env.ALLOW_VALIDATED_REUSE === 'true') {
    throw new Error(
      '[config] ALLOW_VALIDATED_REUSE cannot be true in production; only approved or restored questions may be reused across users.',
    );
  }

  if (process.env.REQUIRE_APPROVAL_FOR_PRODUCTION === 'false') {
    throw new Error(
      '[config] REQUIRE_APPROVAL_FOR_PRODUCTION cannot be false in production.',
    );
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

  // SameSite=Lax cookies require frontend and backend to share the same eTLD+1 domain.
  // Guard: all ALLOWED_ORIGINS must share the same base domain as APP_BASE_URL.
  function getBaseDomain(hostname: string): string {
    const parts = hostname.split('.');
    return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
  }
  try {
    const appBaseDomain = getBaseDomain(new URL(config.appBaseUrl).hostname);
    const allSameSite = config.allowedOrigins.every((origin) => {
      try {
        return getBaseDomain(new URL(origin).hostname) === appBaseDomain;
      } catch {
        return false;
      }
    });
    if (!allSameSite) {
      throw new Error(
        '[config] All ALLOWED_ORIGINS must share the same eTLD+1 domain as APP_BASE_URL for ' +
          'SameSite=Lax cookies to work. Ensure frontend and API are deployed on the same base domain ' +
          '(e.g. app.medica.com and api.medica.com both under medica.com).',
      );
    }
  } catch (err) {
    if ((err as Error).message.startsWith('[config]')) throw err;
    // URL parse failure — APP_BASE_URL already failed the localhost guard above; ignore here.
  }
}
