import { Router } from 'express';
import type { Response } from 'express';
import { createExamService } from '../services/ExamService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { ProgressTrackingService } from '../services/ProgressTrackingService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createSessionSchema, reserveSessionSchema } from '../schemas/exam.js';
import { getRepositories } from '../repositories/index.js';
import { logger } from '../lib/logger.js';
import { getSessionTrustCapabilities } from '../services/sessionIntegrity.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

router.use(requireAuth);

router.post('/reservations', validate(reserveSessionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const result = await createExamService().reserveSession(req.userId!, req.body);
    res.status(201).json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', validate(createSessionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const session = await createExamService().createSession(req.userId!, req.body);
    // Fire-and-forget: update analytics snapshot after every new exam
    const { analytics, examSessions, userConceptMastery, masterySnapshots } = getRepositories();
    new AnalyticsService(analytics, examSessions)
      .saveSnapshot(req.userId!)
      .catch((err) => logger.error('[analytics] snapshot update failed', { error: (err as Error).message }));
    // Fire-and-forget: capture mastery progress snapshot (independent — one cannot swallow the other).
    // Gated by the same trust policy as the synchronous mastery update in ExamService — an
    // untrusted session's snapshot must not be captured either. insertBatch is additionally
    // idempotent (UNIQUE user_id/concept_id/session_id) so a retried call here is a safe no-op.
    if (getSessionTrustCapabilities(session.integrity_status).includedInMasteryProcessing) {
      new ProgressTrackingService(userConceptMastery, masterySnapshots)
        .takeSnapshot(req.userId!, session.id)
        .catch((err) => logger.error('[progress] snapshot failed', { error: (err as Error).message }));
    }
    res.status(201).json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'SNAPSHOT_MISMATCH') {
      res.status(409).json({ error: 'Submitted questions do not match the reserved session', code: 'SNAPSHOT_MISMATCH' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Math.floor(parseInt(String(req.query['page'] ?? '1'), 10)) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(parseInt(String(req.query['limit'] ?? '20'), 10)) || 20));
    const result = await createExamService().getSessions(req.userId!, { page, limit });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Session not found' });
  try {
    const session = await createExamService().getSession(id, req.userId!);
    res.json({ session });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NOT_FOUND') res.status(404).json({ error: 'Session not found' });
    else if (msg === 'FORBIDDEN') res.status(403).json({ error: 'Access denied' });
    else res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Session not found' });
  try {
    await createExamService().deleteSession(id, req.userId!);
    res.status(204).end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NOT_FOUND') res.status(404).json({ error: 'Session not found' });
    else if (msg === 'FORBIDDEN') res.status(403).json({ error: 'Access denied' });
    else res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
