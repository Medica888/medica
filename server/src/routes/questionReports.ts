import { Router } from 'express';
import type { Request, Response } from 'express';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createQuestionReportSchema, type CreateQuestionReportInput } from '../schemas/questionReport.js';
import { getRepositories } from '../repositories/index.js';
import { QuestionReportService } from '../services/QuestionReportService.js';
import { normalizeDifficulty, normalizeSubject, normalizeSystem } from '../lib/medicaTaxonomy.js';

const router = Router();

function getService(): QuestionReportService {
  return new QuestionReportService(getRepositories().questionReports);
}

function normalizeNullableSubject(value: string | null): string | null {
  if (!value) return null;
  return normalizeSubject(value);
}

function normalizeNullableSystem(value: string | null): string | null {
  if (!value) return null;
  return normalizeSystem(value);
}

function normalizeNullableDifficulty(value: string | null): string | null {
  if (!value) return null;
  return normalizeDifficulty(value);
}

// ─── POST /api/question-reports ───────────────────────────────────────────────
// Stores a user-flagged question report. Works for both authenticated and anonymous users.
// Response shape { id } is unchanged.

router.post('/', optionalAuth, validate(createQuestionReportSchema), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as CreateQuestionReportInput;

    const report = await getRepositories().questionReports.create({
      user_id:            req.userId ?? null,
      question_id:        body.questionId ?? null,
      fingerprint:        body.fingerprint,
      reason:             body.reason,
      source:             body.source ?? null,
      mode:               body.mode ?? null,
      difficulty:         normalizeNullableDifficulty(body.difficulty),
      requested_subject:  normalizeNullableSubject(body.requestedSubject),
      requested_system:   normalizeNullableSystem(body.requestedSystem),
      requested_topic:    body.requestedTopic ?? null,
      actual_subject:     normalizeNullableSubject(body.actualSubject),
      actual_system:      normalizeNullableSystem(body.actualSystem),
      actual_topic:       body.actualTopic ?? null,
      tested_concept:     body.testedConcept ?? null,
      usmle_content_area: body.usmleContentArea ?? null,
      physician_task:     body.physicianTask ?? null,
      stem_preview:       body.stemPreview ?? null,
    });

    res.status(201).json({ id: report.id });
  } catch {
    res.status(500).json({ error: 'Failed to save report' });
  }
});

// ─── GET /api/question-reports/summary?limit=20 ───────────────────────────────
// Returns aggregate analytics across all reports. Requires authentication.

router.get('/summary', requireAuth, async (req: Request, res: Response) => {
  const queryLimit = req.query['limit'];
  const raw   = Array.isArray(queryLimit) ? String(queryLimit[0] ?? '20') : String(queryLimit ?? '20');
  const limit = Math.min(Math.max(parseInt(raw, 10) || 20, 1), 100);

  try {
    const summary = await getService().getSummary(limit);
    res.json({ summary });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve report summary' });
  }
});

// ─── GET /api/question-reports/fingerprints/:fingerprint ─────────────────────
// Returns per-fingerprint quarantine analytics. Requires authentication.

router.get('/fingerprints/:fingerprint', requireAuth, async (req: Request, res: Response) => {
  const fingerprint = String(req.params['fingerprint'] ?? '');
  if (!fingerprint || fingerprint.length > 500) {
    res.status(400).json({ error: 'Invalid fingerprint' });
    return;
  }

  try {
    const report = await getService().getFingerprintReport(fingerprint);
    res.json({ report });
  } catch {
    res.status(500).json({ error: 'Failed to retrieve fingerprint report' });
  }
});

export default router;
