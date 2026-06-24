import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthRequest } from './auth.js';

/**
 * Sets req.userId when a valid cookie or Bearer token is present.
 * Never rejects — invalid or missing tokens are silently ignored.
 * Use on endpoints that have both authenticated and anonymous behaviour.
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const cookie = req.cookies?.medica_session;
  const header = req.headers.authorization;
  const token = cookie ?? (header?.startsWith('Bearer ') ? header.slice(7) : undefined);

  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
      req.userId = payload.sub;
    } catch {
      // Expired or invalid token — proceed as unauthenticated
    }
  }
  next();
}
