import { Router } from 'express';

const router = Router();

// Liveness probe: 200 whenever the process is alive and can respond.
// Use /api/ready for readiness (503 when dependencies are unavailable).
router.get('/', (_req, res) => {
  res.json({ ok: true, service: 'medica-api' });
});

export default router;
