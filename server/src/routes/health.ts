import { Router } from 'express';
import { config } from '../config.js';
import { isDbConnected } from '../config/db.js';

const router = Router();

router.get('/', async (_req, res) => {
  if (!config.databaseUrl) {
    res.json({ ok: true, service: 'medica-api', database: 'not-configured' });
    return;
  }

  const connected = await isDbConnected();
  res.json({
    ok: connected,
    service: 'medica-api',
    database: connected ? 'connected' : 'disconnected',
  });
});

export default router;
