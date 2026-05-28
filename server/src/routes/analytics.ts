import { Router } from 'express';
import type { Response } from 'express';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { getRepositories } from '../repositories/index.js';

const router = Router();

function getService(): AnalyticsService {
  const { analytics, examSessions } = getRepositories();
  return new AnalyticsService(analytics, examSessions);
}

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const data = await getService().getAnalytics(req.userId!);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/benchmark', async (req: AuthRequest, res: Response) => {
  try {
    const data = await getService().getBenchmark(req.userId!);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/progress', async (req: AuthRequest, res: Response) => {
  try {
    const gains = await getService().getProgressGains(req.userId!);
    res.json({ gains });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
