import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getRepositories } from '../repositories/index.js';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  const token = header.slice(7);

  let userId: string;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
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
  next();
}
