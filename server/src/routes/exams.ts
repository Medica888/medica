import { Router } from 'express';
import type { Response } from 'express';
import { ExamService } from '../services/ExamService.js';
import { AnalyticsService } from '../services/AnalyticsService.js';
import { ConceptMappingService } from '../services/ConceptMappingService.js';
import { ConceptMasteryService } from '../services/ConceptMasteryService.js';
import { ProgressTrackingService } from '../services/ProgressTrackingService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createSessionSchema } from '../schemas/exam.js';
import { getRepositories } from '../repositories/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

function getService(): ExamService {
  const { examSessions, questionAttempts, questions, concepts, questionConcepts, userConceptMastery } = getRepositories();
  const conceptMapping = new ConceptMappingService(concepts, questionConcepts);
  const conceptMastery = new ConceptMasteryService(userConceptMastery, questionConcepts, concepts);
  return new ExamService(examSessions, questionAttempts, questions, conceptMapping, conceptMastery);
}

router.use(requireAuth);

router.post('/', validate(createSessionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const session = await getService().createSession(req.userId!, req.body);
    // Fire-and-forget: update analytics snapshot after every new exam
    const { analytics, examSessions, userConceptMastery, masterySnapshots } = getRepositories();
    new AnalyticsService(analytics, examSessions)
      .saveSnapshot(req.userId!)
      .catch((err) => console.error('[analytics] snapshot update failed:', err));
    // Fire-and-forget: capture mastery progress snapshot (independent — one cannot swallow the other)
    new ProgressTrackingService(userConceptMastery, masterySnapshots)
      .takeSnapshot(req.userId!, session.id)
      .catch((err) => console.error('[progress] snapshot failed:', err));
    res.status(201).json({ session });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Math.floor(parseInt(String(req.query['page'] ?? '1'), 10)) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(parseInt(String(req.query['limit'] ?? '20'), 10)) || 20));
    const result = await getService().getSessions(req.userId!, { page, limit });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Session not found' });
  try {
    const session = await getService().getSession(id, req.userId!);
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
    await getService().deleteSession(id, req.userId!);
    res.status(204).end();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NOT_FOUND') res.status(404).json({ error: 'Session not found' });
    else if (msg === 'FORBIDDEN') res.status(403).json({ error: 'Access denied' });
    else res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
