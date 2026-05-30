import { Router } from 'express';
import type { Response } from 'express';
import { MasteryQueryService } from '../services/MasteryQueryService.js';
import { ConceptHierarchyService } from '../services/ConceptHierarchyService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { getRepositories } from '../repositories/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

function getService(): MasteryQueryService {
  const { userConceptMastery, concepts } = getRepositories();
  return new MasteryQueryService(userConceptMastery, concepts, new ConceptHierarchyService(concepts));
}

router.use(requireAuth);

router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    res.json(await getService().getOverview(req.userId!));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/weakest', async (req: AuthRequest, res: Response) => {
  try {
    const limit       = Math.min(50, Math.max(1, parseInt(String(req.query['limit']        ?? '10'), 10) || 10));
    const minAttempts = Math.max(1,              parseInt(String(req.query['min_attempts'] ?? '2'),  10) || 2);
    const data = await getService().getWeakest(req.userId!, limit, minAttempts);
    res.json({ concepts: data, count: data.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/strongest', async (req: AuthRequest, res: Response) => {
  try {
    const limit       = Math.min(50, Math.max(1, parseInt(String(req.query['limit']        ?? '10'), 10) || 10));
    const minAttempts = Math.max(1,              parseInt(String(req.query['min_attempts'] ?? '2'),  10) || 2);
    const data = await getService().getStrongest(req.userId!, limit, minAttempts);
    res.json({ concepts: data, count: data.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/concept/:id', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Concept not found' });
  try {
    const data = await getService().getConceptDetail(req.userId!, id);
    if (!data) return res.status(404).json({ error: 'Concept not found' });
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
