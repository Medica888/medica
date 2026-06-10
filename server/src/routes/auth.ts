import { Router } from 'express';
import type { Response } from 'express';
import { AuthService } from '../services/AuthService.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { registerSchema, loginSchema } from '../schemas/auth.js';
import { getRepositories } from '../repositories/index.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiter.js';
import { getAdminUserIds } from '../middleware/requireAdmin.js';

const router = Router();

function getService(): AuthService {
  return new AuthService(getRepositories().users);
}

router.post('/register', registerLimiter, validate(registerSchema), async (req, res: Response) => {
  try {
    const { email, name, password } = req.body as { email: string; name: string; password: string };
    const result = await getService().register(email, name, password);
    res.status(201).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'EMAIL_TAKEN') {
      res.status(409).json({ error: 'Email already registered' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/login', loginLimiter, validate(loginSchema), async (req, res: Response) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const result = await getService().login(email, password);
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Invalid email or password' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getService().getProfile(req.userId!);
    const isAdmin = getAdminUserIds().has(req.userId!);
    res.json({ user, isAdmin });
  } catch {
    res.status(404).json({ error: 'User not found' });
  }
});

export default router;
