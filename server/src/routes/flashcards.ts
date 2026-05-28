import { Router } from 'express';
import type { Response } from 'express';
import { FlashcardService } from '../services/FlashcardService.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createFlashcardsSchema, updateStatusSchema } from '../schemas/flashcard.js';
import { getRepositories } from '../repositories/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

function getService(): FlashcardService {
  return new FlashcardService(getRepositories().flashcards);
}

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const cards = await getService().getFlashcards(req.userId!);
    res.json({ flashcards: cards });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', validate(createFlashcardsSchema), async (req: AuthRequest, res: Response) => {
  try {
    const { flashcards } = req.body as { flashcards: Parameters<FlashcardService['createMany']>[1] };
    const created = await getService().createMany(req.userId!, flashcards);
    res.status(201).json({ flashcards: created });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/status', validate(updateStatusSchema), async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Flashcard not found' });
  try {
    const { status } = req.body as { status: Parameters<FlashcardService['updateStatus']>[2] };
    const card = await getService().updateStatus(id, req.userId!, status);
    res.json({ flashcard: card });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NOT_FOUND') res.status(404).json({ error: 'Flashcard not found' });
    else res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/review', async (req: AuthRequest, res: Response) => {
  const id = String(req.params['id']);
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Flashcard not found' });
  try {
    const card = await getService().markReviewed(id, req.userId!);
    res.json({ flashcard: card });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NOT_FOUND') res.status(404).json({ error: 'Flashcard not found' });
    else res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/', async (req: AuthRequest, res: Response) => {
  try {
    const count = await getService().clearAll(req.userId!);
    res.json({ deleted: count });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
