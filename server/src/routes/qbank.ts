import { Router } from 'express';
import type { Response } from 'express';
import { QuestionCatalogService } from '../services/QuestionCatalogService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createQBankSessionSchema } from '../schemas/qbank.js';
import { getRepositories } from '../repositories/index.js';

const router = Router();

function getService(): QuestionCatalogService {
  const { questions, questionReports } = getRepositories();
  return new QuestionCatalogService(questions, questionReports);
}

router.use(requireAuth);

router.get('/catalog', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Math.floor(parseInt(String(req.query['page'] ?? '1'), 10)) || 1);
    const limit = Math.min(100, Math.max(1, Math.floor(parseInt(String(req.query['limit'] ?? '20'), 10)) || 20));
    const result = await getService().getCatalog({
      page,
      limit,
      subject: typeof req.query['subject'] === 'string' ? req.query['subject'] : undefined,
      system: typeof req.query['system'] === 'string' ? req.query['system'] : undefined,
      difficulty: typeof req.query['difficulty'] === 'string' ? req.query['difficulty'] : undefined,
      search: typeof req.query['search'] === 'string' ? req.query['search'] : undefined,
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/sessions', validate(createQBankSessionSchema), async (req: AuthRequest, res: Response) => {
  try {
    const questions = await getService().createSession(req.body.ids);
    res.status(201).json({ questions });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'EMPTY_SELECTION') res.status(400).json({ error: 'Select at least one question to start.' });
    else if (msg === 'SELECTION_LIMIT') res.status(400).json({ error: 'QBank sessions are limited to 40 questions.' });
    else if (msg === 'DUPLICATE_SELECTION') res.status(400).json({ error: 'Duplicate question ids are not allowed.' });
    else if (msg === 'SELECTION_STALE') res.status(409).json({ error: 'One or more selected questions are no longer available.' });
    else res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
