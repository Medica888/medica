import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.js';

function getAdminUserIds(): Set<string> {
  const raw = (process.env.ADMIN_USER_IDS || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map(id => id.trim()).filter(Boolean));
}

/**
 * Fail-closed admin guard.
 *
 * Reads ADMIN_USER_IDS env var (comma-separated user UUIDs).
 * - If the var is unset or empty → 403 for everyone.
 * - If set, only listed user IDs pass; all others → 403.
 *
 * Must be applied AFTER requireAuth so req.userId is populated.
 */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const userId = req.userId;
  if (!userId) {
    res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    return;
  }

  const adminIds = getAdminUserIds();
  if (adminIds.size === 0) {
    res.status(403).json({ error: 'Admin access not configured', code: 'FORBIDDEN' });
    return;
  }

  if (!adminIds.has(userId)) {
    res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' });
    return;
  }

  next();
}
