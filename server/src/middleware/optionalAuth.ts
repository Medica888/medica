import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { AuthRequest } from './auth.js';

/**
 * Sets req.userId when a valid Bearer token is present.
 * Never rejects — invalid or missing tokens are silently ignored.
 * Use on endpoints that have both authenticated and anonymous behaviour.
 */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret) as { sub: string };
      req.userId = payload.sub;
    } catch {
      // Expired or invalid token — proceed as unauthenticated
    }
  }
  next();
}
