import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { questionReportLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { createQuestionReportSchema, type CreateQuestionReportInput } from '../schemas/questionReport.js';
import { getRepositories } from '../repositories/index.js';
import { QuestionReportService } from '../services/QuestionReportService.js';
import { ClinicianReviewService } from '../services/ClinicianReviewService.js';
import { normalizeDifficulty, normalizeSubject, normalizeSystem } from '../lib/medicaTaxonomy.js';
import { logger } from '../lib/logger.js';
import { config } from '../config.js';

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

export type ReporterEligibilityReason = 'email_unverified' | 'account_too_new' | 'eligible';

export interface ReporterEligibility {
  eligible: boolean;
  reason: ReporterEligibilityReason;
  /** ISO timestamp when the account-age gate unlocks, or null if created_at is missing/invalid. */
  eligibleAt: string | null;
}

// Single source of truth for reporter eligibility — isEligibleQuestionReporter (the
// security gate on POST /) and GET /eligibility (the client-facing explanation) must
// never diverge, so the boolean-only check is a thin wrapper around this.
export function getReporterEligibility(
  user: AuthRequest['authenticatedUser'],
  nowMs = Date.now(),
  minAccountAgeHours = config.questionReportMinAccountAgeHours,
): ReporterEligibility {
  const createdAtMs = user?.created_at ? new Date(user.created_at).getTime() : NaN;
  const hasValidCreatedAt = Number.isFinite(createdAtMs) && createdAtMs <= nowMs;
  const eligibleAt = hasValidCreatedAt
    ? new Date(createdAtMs + minAccountAgeHours * 60 * 60 * 1000).toISOString()
    : null;

  if (!user?.email_verified || !user.email_verified_at) {
    return { eligible: false, reason: 'email_unverified', eligibleAt };
  }
  if (!hasValidCreatedAt || nowMs - createdAtMs < minAccountAgeHours * 60 * 60 * 1000) {
    return { eligible: false, reason: 'account_too_new', eligibleAt };
  }
  return { eligible: true, reason: 'eligible', eligibleAt };
}

export function isEligibleQuestionReporter(
  user: AuthRequest['authenticatedUser'],
  nowMs = Date.now(),
  minAccountAgeHours = config.questionReportMinAccountAgeHours,
): boolean {
  return getReporterEligibility(user, nowMs, minAccountAgeHours).eligible;
}

function requireEligibleQuestionReporter(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isEligibleQuestionReporter(req.authenticatedUser)) {
    res.status(403).json({
      error: 'Your account is not yet eligible to influence shared question review.',
      code: 'REPORTER_NOT_ELIGIBLE',
    });
    return;
  }
  next();
}

// ─── POST /api/question-reports ───────────────────────────────────────────────
// Stores an authenticated user report in shared governance.
// Anonymous reports remain local and cannot affect global quarantine.
// Response shape { id } is unchanged.

router.post('/', requireAuth, questionReportLimiter, requireEligibleQuestionReporter, validate(createQuestionReportSchema), async (req: AuthRequest, res: Response) => {
  try {
    const body = req.body as CreateQuestionReportInput;

    const { report, inserted } = await getRepositories().questionReports.create({
      user_id:            req.userId!,
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
      client_report_id:   body.clientReportId ?? null,
    });

    // Same idempotency key (user_id + clientReportId) resolved to an existing
    // report. If its core content matches this request, it's a legitimate retry —
    // return the original record untouched. If it doesn't match, the client is
    // reusing a key for different content; that's a permanent conflict, not
    // something a retry can resolve, so no report is created/mutated and no
    // clinician review is (re)triggered.
    if (!inserted && (report.fingerprint !== body.fingerprint || report.reason !== body.reason)) {
      res.status(409).json({
        error: 'A report with this idempotency key already exists with different content',
        code:  'IDEMPOTENCY_CONFLICT',
      });
      return;
    }

    res.status(201).json({ id: report.id });

    // Clinician review trigger for high-severity report reasons — fire-and-forget.
    // Gated on `inserted` so idempotent replays (identical retries, or the
    // network-retry case where the first response was lost) never re-trigger or
    // re-escalate a review the original request already created.
    if (inserted && (body.reason === 'wrong_answer' || body.reason === 'duplicate')) {
      const priority = body.reason === 'wrong_answer' ? 'critical' : 'high';
      const reason   = body.reason === 'wrong_answer'
        ? 'wrong_answer report — medical accuracy signal (critical review required)'
        : 'duplicate report — content adjudication required';
      new ClinicianReviewService(getRepositories().clinicianReviews)
        .createOrEscalate({ questionId: body.questionId ?? null, fingerprint: body.fingerprint }, priority, reason)
        .catch(err => logger.warn('[clinician-review] report trigger failed', { error: (err as Error).message }));
    }
  } catch {
    res.status(500).json({ error: 'Failed to save report' });
  }
});

// ─── GET /api/question-reports/eligibility ────────────────────────────────────
// Lets the client show exact copy (verify email vs. wait for account age vs.
// eligible) instead of guessing from email_verified alone. Read-only, no
// business-rule change — backed by the same check POST / enforces.

router.get('/eligibility', requireAuth, (req: AuthRequest, res: Response) => {
  res.json(getReporterEligibility(req.authenticatedUser));
});

// ─── GET /api/question-reports/summary?limit=20 ───────────────────────────────
// Returns aggregate analytics across all reports. Admin only — fingerprints expose
// normalized stem/concept text and global moderation status to whoever can read this.

router.get('/summary', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
// Returns per-fingerprint quarantine analytics. Admin only (see /summary above).

router.get('/fingerprints/:fingerprint', requireAuth, requireAdmin, async (req: Request, res: Response) => {
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
