import { Router } from 'express';
import { config } from '../config.js';
import { isDbConnected } from '../config/db.js';

const router = Router();

// Readiness probe: 503 when required dependencies are unavailable.
// Liveness is at /api/health (always 200 when process responds).
router.get('/', async (_req, res) => {
  if (!config.databaseUrl) {
    res.json({ ready: true, database: 'not-configured' });
    return;
  }
  const connected = await isDbConnected();
  if (connected) {
    res.json({ ready: true, database: 'connected' });
  } else {
    res.status(503).json({ ready: false, database: 'disconnected' });
  }
});

export default router;
