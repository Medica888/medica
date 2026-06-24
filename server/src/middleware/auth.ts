import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getRepositories } from '../repositories/index.js';

export interface AuthRequest extends Request {
  userId?: string;
  authSource?: 'cookie' | 'bearer';
}

// Try cookie first (preferred); if the cookie is invalid/expired, fall through to Bearer.
// This prevents a stale HttpOnly cookie from blocking a valid Bearer token.
function extractVerifiedToken(req: AuthRequest): { token: string; source: 'cookie' | 'bearer' } | null {
  const candidates: Array<{ token: string; source: 'cookie' | 'bearer' }> = [];
  const cookie = req.cookies?.medica_session;
  if (cookie) candidates.push({ token: cookie, source: 'cookie' });
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) candidates.push({ token: header.slice(7), source: 'bearer' });

  for (const candidate of candidates) {
    try {
      jwt.verify(candidate.token, config.jwtSecret);
      return candidate;
    } catch {
      // Token invalid/expired — try next candidate
    }
  }
  return null;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const extracted = extractVerifiedToken(req);
  if (!extracted) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(extracted.token, config.jwtSecret) as { sub: string };
    userId = payload.sub;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // DB errors propagate as 500, not 401 — this is outside the JWT try/catch intentionally
  const raw = await getRepositories().users.findByIdWithHash(userId);
  if (!raw || raw.deleted_at) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.userId = userId;
  req.authSource = extracted.source;
  next();
}
