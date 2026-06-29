import { config } from '../config.js';

type Level = 'info' | 'warn' | 'error';
type Meta = Record<string, unknown>;

export type Logger = {
  info(msg: string, meta?: Meta): void;
  warn(msg: string, meta?: Meta): void;
  error(msg: string, meta?: Meta): void;
};

function log(level: Level, requestId: string | undefined, msg: string, meta?: Meta): void {
  const isProd = config.nodeEnv === 'production';
  if (isProd) {
    const entry = { level, ts: new Date().toISOString(), ...(requestId && { requestId }), msg, ...meta };
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(
      JSON.stringify(entry),
    );
  } else {
    const prefix = requestId ? ` [${requestId.slice(0, 8)}]` : '';
    const extras = meta && Object.keys(meta).length ? [meta] : [];
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(
      `[${level}]${prefix} ${msg}`,
      ...extras,
    );
  }
}

export function createLogger(requestId?: string): Logger {
  return {
    info:  (msg, meta) => log('info',  requestId, msg, meta),
    warn:  (msg, meta) => log('warn',  requestId, msg, meta),
    error: (msg, meta) => log('error', requestId, msg, meta),
  };
}

// Module-level logger for startup/shutdown code (no requestId).
export const logger = createLogger();
