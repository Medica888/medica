import { Router } from 'express';
import type { Response } from 'express';
import { AuthService } from '../services/AuthService.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  deleteAccountSchema,
} from '../schemas/auth.js';
import { getRepositories } from '../repositories/index.js';
import { getEmailSender } from '../lib/email.js';
import { loginLimiter, registerLimiter, passwordResetLimiter } from '../middleware/rateLimiter.js';
import { getAdminUserIds } from '../middleware/requireAdmin.js';

const router = Router();

function getService(): AuthService {
  const repos = getRepositories();
  return new AuthService(repos.users, repos.authTokens, getEmailSender());
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

router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), async (req, res: Response) => {
  try {
    const { email } = req.body as { email: string };
    const result = await getService().requestPasswordReset(email);
    res.json({ message: 'If that email is registered, you will receive a reset link', ...result });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', validate(resetPasswordSchema), async (req, res: Response) => {
  try {
    const { token, password } = req.body as { token: string; password: string };
    await getService().resetPassword(token, password);
    res.json({ message: 'Password updated successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'INVALID_OR_EXPIRED_TOKEN') {
      res.status(400).json({ error: 'Invalid or expired reset token' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/verify-email', validate(verifyEmailSchema), async (req, res: Response) => {
  try {
    const { token } = req.body as { token: string };
    await getService().verifyEmail(token);
    res.json({ message: 'Email verified successfully' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'INVALID_OR_EXPIRED_TOKEN') {
      res.status(400).json({ error: 'Invalid or expired verification token' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.post('/resend-verification', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await getService().requestEmailVerification(req.userId!);
    res.json({ message: 'Verification email sent', ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.delete('/account', requireAuth, validate(deleteAccountSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body as { password: string };
    await getService().deleteAccount(req.userId!, password);
    res.status(204).end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'UNKNOWN';
    if (msg === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Invalid password' });
    } else if (msg === 'NOT_FOUND') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
