import type { Response, NextFunction } from 'express';
import type { Request } from 'express';
import { config } from '../config.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Origin-header CSRF protection for cookie-authenticated requests.
 *
 * Applies only when req.cookies.medica_session is present AND the method is
 * unsafe (POST/PUT/PATCH/DELETE). Bearer-only requests are unaffected.
 *
 * In production: rejects missing or disallowed Origin.
 * In development: allows missing Origin (curl/Postman/supertest).
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method) || !req.cookies?.medica_session) {
    next();
    return;
  }

  const origin = req.headers.origin;

  if (!origin) {
    if (config.nodeEnv === 'production') {
      res.status(403).json({ error: 'Missing Origin header' });
      return;
    }
    next();
    return;
  }

  const allowed = config.allowedOrigins.some((o) => o === origin);
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden: origin not allowed' });
    return;
  }

  next();
}
