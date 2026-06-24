import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { AdaptiveExamService } from '../services/AdaptiveExamService.js';
import { AdaptiveFlashcardService } from '../services/AdaptiveFlashcardService.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { getRepositories } from '../repositories/index.js';
import type { AdaptiveBlueprint, AdaptiveFlashcardPlan } from '../types/index.js';
import {
  generateQuestionsSchema,
  generateFlashcardsSchema,
  explainSchema,
  skillsGenerateSchema,
  generatedQuestionBankReviewQuerySchema,
  generatedQuestionBankStatusUpdateSchema,
  taxonomyCandidateReviewQuerySchema,
  taxonomyCandidateStatusUpdateSchema,
} from '../schemas/ai.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  buildRepairPrompt, isSuspectStem,
  requiresMedicalReview, buildMedicalReviewPrompt, parseMedicalReviewResponse,
  type QuestionQuality, type ReviewableQuestion, type MedicalReviewResult,
} from '../lib/questionValidator.js';
import {
  allowedDifficulties,
  allowedSubjects,
  allowedSystems,
  isBroadTaxonomyValue,
  normalizeDifficulty,
  normalizeSubject,
  normalizeSystem,
} from '../lib/medicaTaxonomy.js';
import { lookupTopic, normalizeTopic } from '../lib/medicaTopicTaxonomy.js';
import { normalizeConcept, lookupConcept } from '../lib/medicaConceptTaxonomy.js';
import { taxonomyResolutionService } from '../services/TaxonomyResolutionService.js';
import { validateQuestion } from '../lib/validation/validationEngine.js';
import type { MedicalReviewAdapter, ValidationEngineResult } from '../lib/validation/validationTypes.js';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function hasAnthropicApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function qbankPersistenceMode(): 'postgres' | 'memory' {
  return process.env.DATABASE_URL?.trim() ? 'postgres' : 'memory';
}

function qbankDeveloperWarnings(): string[] {
  return qbankPersistenceMode() === 'postgres'
    ? []
    : ['DATABASE_URL is not configured; generated question bank writes use transient in-memory storage and will not persist after server restart.'];
}

function missingAnthropicResponse() {
  return {
    error: 'AI generation unavailable — server is missing required AI provider configuration',
    code: 'NO_API_KEY',
    developerMessage: 'Set ANTHROPIC_API_KEY in the server environment to enable live AI generation. Do not expose this value to the frontend.',
  };
}

// Skills files live at the repo root: <project>/skills/
const SKILLS_DIR = path.join(__dirname, '../../../skills');

// ─── Skill loader ─────────────────────────────────────────────────────────────

function parseSkillFile(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf8');
  const fmEnd = content.indexOf('\n---\n', 4);
  if (!content.startsWith('---\n') || fmEnd === -1) return null;

  const meta: Record<string, string> = {};
  content.slice(4, fmEnd).split('\n').forEach(line => {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  });

  const body = '\n' + content.slice(fmEnd + 5);
  const extractSection = (name: string) => {
    const marker = `\n# ${name}\n`;
    const start = body.indexOf(marker);
    if (start === -1) return '';
    const from = start + marker.length;
    const next = body.indexOf('\n# ', from);
    return (next === -1 ? body.slice(from) : body.slice(from, next)).trim();
  };

  return {
    id: meta['id'],
    name: meta['name'],
    category: meta['category'],
    emoji: meta['emoji'],
    mode: meta['mode'] || null,
    description: meta['description'],
    template: extractSection('Template'),
    systemPrompt: extractSection('System Prompt'),
  };
}

const SKILLS = fs.existsSync(SKILLS_DIR)
  ? fs.readdirSync(SKILLS_DIR)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => parseSkillFile(path.join(SKILLS_DIR, f)))
      .filter((s): s is NonNullable<ReturnType<typeof parseSkillFile>> => s !== null)
  : [];

// ─── GET /api/skills ──────────────────────────────────────────────────────────

router.get('/skills', (_req: Request, res: Response) => {
  const publicSkills = SKILLS.map(({ systemPrompt: _sp, ...skill }) => skill);
  res.json(publicSkills);
});

// ─── POST /api/generate (skills streaming) ───────────────────────────────────

router.get('/taxonomy-candidates', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = taxonomyCandidateReviewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid taxonomy candidate query', code: 'INVALID_QUERY' });
    return;
  }

  const { status, limit: rawLimit, page, offset: rawOffset } = parsed.data;
  const limit = rawLimit ?? 100;
  const offset = rawOffset ?? ((page ?? 1) - 1) * limit;

  try {
    const candidates = await getRepositories().taxonomyCandidates.findUnknownTopicCandidates({
      status,
      limit,
      offset,
    });
    res.json({ candidates, count: candidates.length, limit, offset });
  } catch (err) {
    console.error('[taxonomy-candidates]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Taxonomy candidate review failed', code: 'TAXONOMY_CANDIDATE_REVIEW_FAILED' });
  }
});

router.patch(
  '/taxonomy-candidates/:id/status',
  requireAuth,
  requireAdmin,
  validate(taxonomyCandidateStatusUpdateSchema),
  async (req: AuthRequest, res: Response) => {
    const id = String(req.params.id || '').trim();
    if (!id || id.length > 100) {
      res.status(400).json({ error: 'Invalid taxonomy candidate id', code: 'INVALID_TAXONOMY_CANDIDATE_ID' });
      return;
    }

    try {
      const metadata: Record<string, unknown> = {
        reviewedBy: req.userId,
        reviewedAt: new Date().toISOString(),
      };
      if (req.body.mappedTo) metadata.mappedTo = req.body.mappedTo;
      if (req.body.note) metadata.note = req.body.note;

      const candidate = await getRepositories().taxonomyCandidates.updateUnknownTopicCandidateStatus(id, {
        status: req.body.status,
        metadata,
      });
      if (!candidate) {
        res.status(404).json({ error: 'Taxonomy candidate not found', code: 'TAXONOMY_CANDIDATE_NOT_FOUND' });
        return;
      }

      // Refresh alias cache so approved mappings take effect immediately
      taxonomyResolutionService.refreshCache(getRepositories().taxonomyCandidates).catch(err => {
        console.warn('[taxonomy-candidates/status] cache refresh failed:', (err as Error).message);
      });

      res.json({ candidate });
    } catch (err) {
      console.error('[taxonomy-candidates/status]', err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: 'Taxonomy candidate status update failed', code: 'TAXONOMY_CANDIDATE_STATUS_FAILED' });
    }
  },
);

router.get('/generated-question-bank/review', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const parsed = generatedQuestionBankReviewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid generated bank review query', code: 'INVALID_QUERY' });
    return;
  }

  const { status, limit: rawLimit, page, offset: rawOffset, sort } = parsed.data;
  const limit = rawLimit ?? 50;
  const effectiveOffset = page != null ? (page - 1) * limit : (rawOffset ?? 0);

  try {
    const repos = getRepositories();
    const [questions, total] = await Promise.all([
      repos.questions.findGeneratedBankReview({ status, limit, offset: effectiveOffset, sort }),
      repos.questions.countGeneratedBankReview({ status }),
    ]);
    res.json({
      questions,
      count: questions.length,
      total,
      limit,
      offset: effectiveOffset,
      page: page ?? (Math.floor(effectiveOffset / limit) + 1),
      hasMore: effectiveOffset + questions.length < total,
    });
  } catch (err) {
    console.error('[generated-question-bank/review]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Generated question bank review failed', code: 'GENERATED_BANK_REVIEW_FAILED' });
  }
});

router.get('/generated-question-bank/review/:id/history', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const externalId = String(req.params.id || '').trim();
  if (!externalId || externalId.length > 300) {
    res.status(400).json({ error: 'Invalid generated question id', code: 'INVALID_GENERATED_QUESTION_ID' });
    return;
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  try {
    const history = await getRepositories().auditLog.getByQuestionId(externalId, limit, offset);
    res.json({ history, count: history.length });
  } catch (err) {
    console.error('[generated-question-bank/review/history]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Audit history retrieval failed', code: 'AUDIT_HISTORY_FAILED' });
  }
});

router.get('/generated-question-bank/review/:id', requireAuth, requireAdmin, async (req: AuthRequest, res: Response) => {
  const externalId = String(req.params.id || '').trim();
  if (!externalId || externalId.length > 300) {
    res.status(400).json({ error: 'Invalid generated question id', code: 'INVALID_GENERATED_QUESTION_ID' });
    return;
  }
  try {
    const rows = await getRepositories().questions.findGeneratedBankReview({ externalId, limit: 1 });
    if (!rows[0]) {
      res.status(404).json({ error: 'Generated question not found', code: 'GENERATED_QUESTION_NOT_FOUND' });
      return;
    }
    res.json({ question: rows[0] });
  } catch (err) {
    console.error('[generated-question-bank/review/:id]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Generated question detail retrieval failed', code: 'GENERATED_BANK_DETAIL_FAILED' });
  }
});

router.get('/generated-question-bank/metrics', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const repos = getRepositories();
    const [metrics, recentApprovals, recentQuarantines, throughput7d] = await Promise.all([
      repos.questions.getGeneratedBankMetrics(),
      repos.auditLog.getRecentActions(['approved'], 10),
      repos.auditLog.getRecentActions(['quarantined'], 10),
      repos.auditLog.getThroughput(24 * 7),
    ]);
    res.json({
      metrics: {
        ...metrics,
        pendingReviewCount: metrics.validatedGenerated,
        averagePendingAge: metrics.averagePendingAgeDays,
        approvedLast7d: throughput7d.approved,
        quarantinedLast7d: throughput7d.quarantined,
        validationFailedCount: metrics.validationFailed,
        rejectedCount: metrics.rejected,
        approvedPerDay: throughput7d.approved / 7,
        quarantinedPerDay: throughput7d.quarantined / 7,
        generatedPerDay: metrics.generatedLast7d / 7,
      },
      recentApprovals,
      recentQuarantines,
    });
  } catch (err) {
    console.error('[generated-question-bank/metrics]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Generated question bank metrics failed', code: 'GENERATED_BANK_METRICS_FAILED' });
  }
});

router.get('/generated-question-bank/concept-summary', requireAuth, requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const coverage = await getRepositories().questions.getConceptCoverage();
    const known: Array<{ concept: string; count: number }> = [];
    const unknown: string[] = [];
    for (const entry of coverage) {
      if (lookupConcept(entry.concept)) {
        known.push(entry);
      } else {
        unknown.push(entry.concept);
      }
    }
    // totalConceptTaggings = sum of per-concept question counts (concept-question pairs,
    // NOT distinct questions — a question with N concepts contributes N to this total).
    const totalConceptTaggings = coverage.reduce((s, e) => s + e.count, 0);
    res.json({
      totalConceptTaggings,
      uniqueConceptCount: coverage.length,
      knownConceptCount: known.length,
      unknownConceptCount: unknown.length,
      topConcepts: known.slice(0, 20),
      unknownConcepts: unknown.slice(0, 50),
      note: 'warnings/failures are per-generation only; no historical aggregation stored',
    });
  } catch (err) {
    console.error('[generated-question-bank/concept-summary]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Concept summary failed', code: 'CONCEPT_SUMMARY_FAILED' });
  }
});

router.patch(
  '/generated-question-bank/:externalId/status',
  requireAuth,
  requireAdmin,
  validate(generatedQuestionBankStatusUpdateSchema),
  async (req: AuthRequest, res: Response) => {
    const externalId = String(req.params.externalId || '').trim();
    if (!externalId || externalId.length > 300) {
      res.status(400).json({ error: 'Invalid generated question id', code: 'INVALID_GENERATED_QUESTION_ID' });
      return;
    }

    try {
      const repos = getRepositories();

      // Fetch the current row to get previousStatus for the audit log and to
      // validate the question body on approval.
      const reviewRows = await repos.questions.findGeneratedBankReview({ externalId, limit: 1 });
      const reviewRow = reviewRows[0];
      if (!reviewRow) {
        res.status(404).json({ error: 'Generated question not found', code: 'GENERATED_QUESTION_NOT_FOUND' });
        return;
      }

      const previousStatus = String((reviewRow as Record<string, any>).bankStatus ?? '');

      if (req.body.status === 'approved') {
        const body = (reviewRow as Record<string, any>).body as Record<string, any>;

        // P5: quarantine fingerprint check — block approval if content matches a quarantined fingerprint
        const contentFingerprint = computeQuestionFingerprint(String(body.stem || ''), String(body.testedConcept || ''));
        const quarantinedFps = await repos.questionReports.getQuarantinedFingerprints();
        if (quarantinedFps.has(contentFingerprint)) {
          res.status(422).json({
            error: 'Question content fingerprint is quarantined',
            code: 'QUARANTINED_FINGERPRINT',
            rejectionReasons: ['Content fingerprint matches a quarantined question'],
          });
          return;
        }

        const validationConfig = {
          mode: (reviewRow as Record<string, any>).mode || body.mode || 'practice',
          difficulty: (reviewRow as Record<string, any>).difficulty || body.difficulty || 'Balanced',
          subject: (reviewRow as Record<string, any>).subject || body.subject || '',
          system: (reviewRow as Record<string, any>).system || body.system || '',
          topic: body.topic || body.canonicalTopic || '',
        };
        const validation = await _validatePromotableQuestion(body, validationConfig);
        if (!validation.valid) {
          res.status(422).json({
            error: 'Generated question validation failed',
            code: 'GENERATED_QUESTION_VALIDATION_FAILED',
            rejectionReasons: validation.validation.rejectionReasons,
          });
          return;
        }
      }

      const question = await repos.questions.updateGeneratedBankStatus(externalId, req.body.status);
      if (!question) {
        res.status(404).json({ error: 'Generated question not found', code: 'GENERATED_QUESTION_NOT_FOUND' });
        return;
      }

      await repos.auditLog.log({
        userId: req.userId ?? null,
        action: req.body.status,
        questionId: externalId,
        previousStatus: previousStatus || null,
        newStatus: req.body.status,
      });

      res.json({ question });
    } catch (err) {
      console.error('[generated-question-bank/status]', err instanceof Error ? err.message : String(err));
      res.status(500).json({ error: 'Generated question status update failed', code: 'GENERATED_BANK_STATUS_FAILED' });
    }
  },
);

router.post('/generate', requireAuth, aiLimiter, validate(skillsGenerateSchema), async (req: Request, res: Response) => {
  const { skillId, guide, customSkill } = req.body ?? {};

  if (!guide?.trim()) {
    res.status(400).json({ error: 'Guide content is required' });
    return;
  }

  const skill = SKILLS.find(s => s?.id === skillId);
  if (!skill && !customSkill) {
    res.status(400).json({ error: 'Skill not found' });
    return;
  }

  const systemPrompt: string = customSkill?.systemPrompt ?? skill!.systemPrompt;
  const skillName: string = customSkill?.name ?? skill!.name;
  const isMCQ = skill?.mode === 'mcq' || skill?.mode === 'adaptive';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Here is my guide for the "${skillName}" content:\n\n${guide}\n\nGenerate the content as specified in your instructions. Be specific, premium, and aligned with the Medica brand.`,
    },
  ];

  try {
    while (true) {
      let roundText = '';
      let stopReason: string | null = null;

      const stream = client.messages.stream({
        model: isMCQ ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: isMCQ ? 4096 : 8192,
        system: systemPrompt,
        messages,
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('text', (text: string) => {
          roundText += text;
          res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
        });
        stream.on('finalMessage', (msg: Anthropic.Message) => {
          stopReason = msg.stop_reason;
          resolve();
        });
        stream.on('error', reject);
      });

      if (stopReason !== 'max_tokens') break;
      messages.push({ role: 'assistant', content: roundText });
      messages.push({ role: 'user', content: 'Continue from exactly where you left off. Do not repeat any content.' });
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[generate]', err instanceof Error ? err.message : String(err));
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Content generation failed' })}\n\n`);
    res.end();
  }
});

// ─── POST /api/explain (on-demand question explanation) ───────────────────────

const EXPLAIN_SYSTEM = `You are a USMLE anatomy explanation writer for MEDICA Medical Education Centre.

Given a question stem, answer options, and the correct answer index, write concise UWorld-style explanations.

Output ONLY a valid JSON object. Raw JSON only — no markdown fences, no commentary, nothing else.

CRITICAL JSON SAFETY RULES:
- Never use double quotes inside any string value. Use single quotes or rephrase.
- Never include raw newlines inside string values. Keep every string on one line.
- No trailing commas after the last item in any array or object.

Schema:
{
  "explanations": [
    "A — Correct: one to two sentences — core anatomical reasoning why this is correct",
    "B — Wrong: one sentence — why this distractor fails",
    "C — Wrong: one sentence — why this distractor fails",
    "D — Wrong: one sentence — why this distractor fails",
    "E — Wrong: one sentence — why this distractor fails"
  ],
  "integration": "One sentence linking to real clinical practice, surgery, or imaging"
}`;

router.post('/explain', requireAuth, aiLimiter, validate(explainSchema), async (req: Request, res: Response) => {
  const { stem, options, correct, field, pearl } = req.body ?? {};

  if (!stem || !Array.isArray(options) || typeof correct !== 'number') {
    res.status(400).json({ error: 'Missing question data' });
    return;
  }

  const userContent = `Field: ${field || 'Anatomy'}
Stem: ${stem}
Options: ${options.map((o: string, i: number) => `${String.fromCharCode(65 + i)}. ${o.replace(/^[A-E]\.\s*/, '')}`).join(' | ')}
Correct answer index: ${correct} (${String.fromCharCode(65 + correct)})
${pearl ? `Pearl: ${pearl}` : ''}

Write concise UWorld-style explanations for each option and a one-sentence clinical integration.`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: EXPLAIN_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('text', (text: string) => {
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
      });
      stream.on('finalMessage', () => resolve());
      stream.on('error', reject);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[explain]', err instanceof Error ? err.message : String(err));
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Explanation generation failed' })}\n\n`);
    res.end();
  }
});

// ─── POST /api/generate-questions ────────────────────────────────────────────

const GENERATE_BATCH_SIZE = 8;
const TOKENS_PER_Q: Record<string, number> = { exam: 380, practice: 750, coach: 1200 };

function getMaxTokens(mode: string, count: number) {
  const perQ = TOKENS_PER_Q[mode] ?? TOKENS_PER_Q['practice'];
  return Math.min(Math.ceil(count * perQ * 1.25), 8192);
}

// Retry on: 429 (rate limit, up to 3 attempts with 8s wait) and connection-level errors
// (no HTTP status — ECONNRESET, DNS failure, SSL failure) with exponential backoff.
// Auth, model-not-found, and other HTTP errors are thrown immediately (no retry).
async function callWithRetry(params: Anthropic.MessageCreateParamsNonStreaming) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err: any) {
      const isLast = attempt === 3;
      if (err?.status === 429) {
        if (isLast) throw err;
        await new Promise(r => setTimeout(r, 8000));
      } else if (err?.status == null) {
        // Connection-level error: no HTTP response received (ECONNRESET, AbortError, etc.)
        if (isLast) {
          console.warn('[anthropic] connection error persisted after retries:', String(err?.message ?? err).slice(0, 80));
          throw err;
        }
        const delay = 1500 * attempt; // 1.5s, then 3s
        console.warn(`[anthropic] connection error attempt ${attempt}/3, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        // HTTP error with status (401 auth, 404 model, 400 bad request, etc.) — never retry
        throw err;
      }
    }
  }
  throw new Error('[anthropic] unreachable');
}

// ── Fingerprint (mirrors frontend medica-app/src/lib/questionDedup.js) ───────

function computeQuestionFingerprint(stem: string, testedConcept: string): string {
  const normStem    = String(stem    || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const normConcept = String(testedConcept || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${normStem}||${normConcept}`;
}

// ── Scope helpers ────────────────────────────────────────────────────────────

function norm(s: string) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

const EMPTY = new Set([
  '', 'all', 'all subjects', 'all systems', 'all topics',
  'any', 'any subject', 'any system', 'any topic',
  'general', 'mixed', 'select subject', 'select system', 'select topic',
]);

function isEmpty(v: unknown) {
  if (v === null || v === undefined) return true;
  return EMPTY.has(String(v).toLowerCase().trim()) || isBroadTaxonomyValue(v);
}

class TaxonomyConfigError extends Error {
  constructor(public field: 'subject' | 'system' | 'difficulty', value: string) {
    super(`Unknown ${field}: ${value}`);
  }
}

function normalizeConfigTaxonomy(config: Record<string, any>): Record<string, any> {
  const next = { ...config };
  const rawSubject = String(config.subject || '').trim();
  const rawSystem = String(config.system || '').trim();
  const rawDifficulty = String(config.difficulty || '').trim();

  if (!isEmpty(rawSubject)) {
    const subject = normalizeSubject(rawSubject);
    const subjectAsSystem = normalizeSystem(rawSubject);
    if (subject) {
      next.subject = subject;
    } else if (subjectAsSystem) {
      next.subject = '';
      if (isEmpty(rawSystem)) next.system = subjectAsSystem;
    } else {
      throw new TaxonomyConfigError('subject', rawSubject);
    }
  } else {
    next.subject = '';
  }

  if (!isEmpty(rawSystem)) {
    const system = normalizeSystem(rawSystem);
    if (!system) throw new TaxonomyConfigError('system', rawSystem);
    next.system = system;
  } else if (isEmpty(next.system)) {
    next.system = '';
  }

  if (!isEmpty(rawDifficulty)) {
    const difficulty = normalizeDifficulty(rawDifficulty);
    if (!difficulty) throw new TaxonomyConfigError('difficulty', rawDifficulty);
    next.difficulty = difficulty;
  } else {
    next.difficulty = 'Balanced';
  }

  return next;
}

// Strip control characters and cap topic length to prevent prompt injection.
function sanitizeTopic(raw: string): string {
  return raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+|previous\s+|above\s+)?instructions?/i,
  /you\s+are\s+now\b/i,
  /new\s+role\b/i,
  /forget\s+(your\s+|the\s+|all\s+)?instructions?/i,
  /\bdisregard\b/i,
  /system\s+prompt/i,
];

function isTopicSuspect(topic: string): boolean {
  return INJECTION_PATTERNS.some(p => p.test(topic));
}

const NON_MEDICAL_TOPIC_TERMS = [
  'banana', 'magic', 'wizard', 'dragon', 'pizza', 'recipe', 'football', 'soccer',
  'crypto', 'bitcoin', 'stock', 'weather', 'lottery', 'casino', 'celebrity',
  'movie', 'song', 'lyrics', 'dating', 'homework answer',
];

const MEDICAL_TOPIC_TERMS = [
  'abdomen', 'acid', 'adrenal', 'airway', 'allergy', 'anemia', 'aneurysm',
  'antibiotic', 'antibody', 'arrhythmia', 'artery', 'arthritis', 'asthma',
  'autoimmune', 'bacter', 'benign', 'biopsy', 'blocker', 'blood', 'bone',
  'brain', 'breast', 'bronch', 'cancer', 'carcinoma', 'cardiac', 'cardio',
  'cell', 'cerebral', 'chest', 'colon', 'congenital', 'cortisol', 'deficiency',
  'diabetes', 'diagnosis', 'diuretic', 'dislocation', 'disease', 'disorder',
  'duct', 'edema', 'embol', 'endocrine', 'enzyme', 'fracture', 'gene',
  'glomer', 'heart', 'hepatic', 'hormone', 'hypertension', 'immune',
  'infection', 'inflammation', 'inhibitor', 'injury', 'insulin', 'intestinal',
  'ischemia', 'kidney', 'lesion', 'leukemia', 'ligament', 'liver', 'lung',
  'lymphoma', 'malign', 'mechanism', 'metabolism', 'metast', 'muscle',
  'mutation', 'myocard', 'nerve', 'neoplasm', 'neph', 'neuro', 'obstruction',
  'oncology', 'organ', 'patellar', 'pathology', 'pharma', 'physiology',
  'platelet', 'pneum', 'pulmonary', 'receptor', 'renal', 'seizure', 'shock',
  'skin', 'stroke', 'syndrome', 'tendon', 'thyroid', 'toxin', 'transport',
  'trauma', 'tumor', 'tumour', 'urinary', 'vascular', 'vein', 'virus',
];

function hasTermMatch(value: string, terms: string[]): boolean {
  const normalized = norm(value);
  return terms.some(term => normalized.includes(norm(term)));
}

function normalizeUserTopicLabel(value: string): string {
  return sanitizeTopic(value)
    .split(' ')
    .filter(Boolean)
    .map(part => part.length <= 3 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function classifyRequestedTopic(scope: ReturnType<typeof resolveScope>, config: Record<string, any>) {
  if (!isSpecific(scope) || !scope.scopeText) {
    return { ok: true, status: 'none' as const, config };
  }

  const rawTopic = sanitizeTopic(scope.scopeText);
  const knownTopic = lookupTopic(rawTopic);
  if (knownTopic) {
    return {
      ok: true,
      status: knownTopic.wasAlias ? 'known_alias' as const : 'known' as const,
      canonicalTopic: knownTopic.canonical,
      config: {
        ...config,
        topic: knownTopic.canonical,
        rawTopic: scope.scopeType === 'manualTopic' ? rawTopic : config.rawTopic,
        canonicalTopic: knownTopic.canonical,
        subject: config.subject || knownTopic.subject,
        system: config.system || knownTopic.system,
      },
    };
  }

  if (hasTermMatch(rawTopic, NON_MEDICAL_TOPIC_TERMS)) {
    return {
      ok: false,
      status: 'rejected' as const,
      reason: 'Topic contains non-medical or unsafe terms.',
      config,
    };
  }

  if (!hasTermMatch(rawTopic, MEDICAL_TOPIC_TERMS)) {
    return {
      ok: false,
      status: 'rejected' as const,
      reason: 'Topic is not recognized as a medical education topic.',
      config,
    };
  }

  return {
    ok: true,
    status: 'medical_unknown' as const,
    canonicalTopic: normalizeUserTopicLabel(rawTopic),
    config: {
      ...config,
      topic: normalizeUserTopicLabel(rawTopic),
      rawTopic,
      canonicalTopic: normalizeUserTopicLabel(rawTopic),
      topicSource: config.topicSource || 'manual_medical_unknown',
    },
  };
}

type TopicIntakeResult = ReturnType<typeof classifyRequestedTopic>;

function firstQuestionFingerprint(questions: Record<string, any>[], topic?: string): string | null {
  const needle = norm(topic || '');
  const question = questions.find(q => {
    if (!needle) return true;
    return [q.topic, q.canonicalTopic, q.rawTopic, q.testedConcept]
      .map(value => norm(value || ''))
      .some(value => value && (value.includes(needle) || needle.includes(value)));
  }) ?? questions[0];
  if (!question) return null;
  const fingerprint = computeQuestionFingerprint(question.stem || '', question.testedConcept || '');
  return fingerprint && fingerprint !== '||' ? fingerprint : null;
}

async function captureUnknownTopicCandidates(params: {
  topicIntake: TopicIntakeResult;
  unknownTopics: Array<{ topic: string; subject: string; system: string }>;
  questions: Record<string, any>[];
  config: Record<string, any>;
}): Promise<number> {
  const repo = getRepositories().taxonomyCandidates;
  const seen = new Set<string>();
  let captured = 0;
  const enqueue = async (candidate: {
    rawLabel: string;
    normalizedGuess?: string;
    subject?: string;
    system?: string;
    source: string;
    metadata?: Record<string, unknown>;
  }) => {
    const rawLabel = sanitizeTopic(candidate.rawLabel);
    if (!rawLabel) return;
    const key = norm(rawLabel);
    if (seen.has(key)) return;
    seen.add(key);
    await repo.upsertUnknownTopicCandidate({
      rawLabel,
      normalizedGuess: candidate.normalizedGuess || normalizeUserTopicLabel(rawLabel),
      subject: candidate.subject || String(params.config.subject || ''),
      system: candidate.system || String(params.config.system || ''),
      exampleQuestionFingerprint: firstQuestionFingerprint(params.questions, rawLabel),
      source: candidate.source,
      metadata: candidate.metadata,
    });
    captured++;
  };

  if (params.topicIntake.ok && params.topicIntake.status === 'medical_unknown') {
    const intakeConfig = params.topicIntake.config as Record<string, any>;
    const rawLabel = String(intakeConfig.rawTopic || intakeConfig.topic || '');
    const matchingUnknown = params.unknownTopics.find(unknown => norm(unknown.topic) === norm(params.topicIntake.canonicalTopic || rawLabel));
    await enqueue({
      rawLabel,
      normalizedGuess: params.topicIntake.canonicalTopic,
      subject: matchingUnknown?.subject || String(intakeConfig.subject || params.config.subject || ''),
      system: matchingUnknown?.system || String(intakeConfig.system || params.config.system || ''),
      source: 'manual_topic',
      metadata: { intakeStatus: params.topicIntake.status },
    });
  }

  for (const unknown of params.unknownTopics) {
    await enqueue({
      rawLabel: unknown.topic,
      subject: unknown.subject,
      system: unknown.system,
      source: 'validation_topic',
      metadata: { validatorReason: 'topic_unknown' },
    });
  }

  return captured;
}

async function captureUnknownConceptCandidates(params: {
  unknownConcepts: Array<{ concept: string; topic: string; subject: string; system: string }>;
  questions: Record<string, any>[];
  config: Record<string, any>;
}): Promise<number> {
  const repo = getRepositories().taxonomyCandidates;
  const seen = new Set<string>();
  let captured = 0;
  for (const unknown of params.unknownConcepts) {
    const rawLabel = sanitizeTopic(unknown.concept);
    if (!rawLabel) continue;
    const k = norm(rawLabel);
    if (seen.has(k)) continue;
    seen.add(k);
    await repo.upsertUnknownTopicCandidate({
      rawLabel,
      normalizedGuess: rawLabel,
      subject: unknown.subject || String(params.config.subject || ''),
      system: unknown.system || String(params.config.system || ''),
      exampleQuestionFingerprint: firstQuestionFingerprint(params.questions, unknown.concept),
      source: 'validation_concept',
      type: 'concept',
      metadata: { validatorReason: 'concept_unknown', relatedTopic: unknown.topic },
    });
    captured++;
  }
  return captured;
}

function resolveScope(config: Record<string, any>) {
  const cf  = String(config.clinicalFocus || '').trim();
  // Backward compat: coachSpecificTopic folds into topic so old payloads continue to work.
  // New frontend always sends topic directly.
  const t   = sanitizeTopic(String(config.topic || config.coachSpecificTopic || ''));
  const rt  = String(config.rawTopic  || '').trim();
  const sys = String(config.system    || '').trim();
  const sub = String(config.subject   || '').trim();

  const base = {
    subject: isEmpty(sub) ? '' : sub,
    system:  isEmpty(sys) ? '' : sys,
    rawTopic: rt || t,
    canonicalTopic: String(config.canonicalTopic || '').trim() || t,
    topicSlug:   String(config.topicSlug   || '').trim(),
    topicSource: String(config.topicSource || '').trim(),
  };

  if (cf) return { ...base, scopeType: 'clinicalFocus', scopeText: cf, topic: cf };
  if (rt) return { ...base, scopeType: 'manualTopic',   scopeText: rt, topic: rt };
  if (t)  return { ...base, scopeType: 'selectedTopic', scopeText: t,  topic: t  };
  if (sys && !isEmpty(sys)) return { ...base, scopeType: 'system',  scopeText: sys, topic: '' };
  if (sub && !isEmpty(sub)) return { ...base, scopeType: 'subject', scopeText: sub, topic: '' };
  return { ...base, scopeType: 'global', scopeText: 'Mixed USMLE Step 1', topic: '' };
}

const SPECIFIC_SCOPES = new Set(['clinicalFocus', 'manualTopic', 'selectedTopic']);

function isSpecific(scope: ReturnType<typeof resolveScope>) {
  return SPECIFIC_SCOPES.has(scope.scopeType);
}

function inScope(q: Record<string, any>, scope: ReturnType<typeof resolveScope>) {
  if (!isSpecific(scope)) return true;
  const needle = norm(scope.scopeText);
  const primary = [q.topic, q.testedConcept, q.canonicalTopic, q.rawTopic, q.weakSpotCategory]
    .map(f => norm(f || '')).filter(Boolean);
  const secondary = [q.system, q.subject].map(f => norm(f || '')).filter(Boolean);
  return (
    primary.some(f => f.includes(needle) || (f.length >= 5 && needle.includes(f))) ||
    secondary.some(f => f === needle || f.includes(needle))
  );
}

function dedup(questions: Record<string, any>[]): Record<string, any>[] {
  const seenConcepts = new Set<string>();
  const seenStems    = new Set<string>();
  const seenPearls   = new Set<string>();
  const seenAngles   = new Set<string>();
  const result: Record<string, any>[] = [];

  for (const q of questions) {
    const concept  = norm(q.testedConcept || '');
    const stem     = norm((q.stem || '').slice(0, 80));
    const pearl    = norm(q.pearl || q.highYieldPearl || '');
    const hasAngle = !!String(q.questionAngle || '').trim();
    const angleKey = hasAngle ? norm((q.topic || '') + '|' + q.questionAngle) : '';

    if (concept  && seenConcepts.has(concept))  continue;
    if (stem     && seenStems.has(stem))         continue;
    if (pearl && pearl.length > 15 && seenPearls.has(pearl)) continue;
    if (hasAngle && seenAngles.has(angleKey))    continue;

    if (concept)  seenConcepts.add(concept);
    if (stem)     seenStems.add(stem);
    if (pearl && pearl.length > 15) seenPearls.add(pearl);
    if (hasAngle) seenAngles.add(angleKey);
    result.push(q);
  }
  return result;
}

// ── Medical review failure-category telemetry ────────────────────────────────

export const MEDICAL_REVIEW_CATEGORIES = [
  'medicalAccuracy',
  'singleBestAnswer',
  'distractorPlausibility',
  'difficultyAlignment',
  'explanationQuality',
] as const;

export type MedicalReviewCategory = typeof MEDICAL_REVIEW_CATEGORIES[number];

export type MedicalReviewFailureCategories = Record<MedicalReviewCategory, number>;

export function emptyMedicalReviewFailureCategories(): MedicalReviewFailureCategories {
  return {
    medicalAccuracy:        0,
    singleBestAnswer:       0,
    distractorPlausibility: 0,
    difficultyAlignment:    0,
    explanationQuality:     0,
  };
}

export function collectFailedMedicalReviewCategories(result: MedicalReviewResult | null): MedicalReviewCategory[] {
  if (!result) return [];
  return MEDICAL_REVIEW_CATEGORIES.filter(cat => result[cat] === 'fail');
}

function accumulateMedicalReviewFailureCategories(
  acc: MedicalReviewFailureCategories,
  src: MedicalReviewFailureCategories,
): void {
  for (const cat of MEDICAL_REVIEW_CATEGORIES) {
    acc[cat] += src[cat];
  }
}

// ── Question generation ──────────────────────────────────────────────────────

const QUIZ_GEN_SYSTEM = `You are an elite USMLE Step 1 question writer and tutor for MEDICA Medical Education Centre.

Output ONLY a valid JSON object — no markdown fences, no commentary, no text before or after. Raw JSON only.

CRITICAL JSON SAFETY RULES:
- Never use double quotes ( " ) inside any string value. Use single quotes or rephrase instead.
- Never include raw newlines inside string values. Keep every string on one line.
- No trailing commas after the last item in any array or object.

EXAM MODE: output subject, system, testedConcept, weakSpotCategory, usmleContentArea, usmleSubdomain, physicianTask, stem, options (A-D), correct. No explanations. No id field.
PRACTICE MODE: all Exam fields + explanation, highYieldPearl, memoryAnchor, commonTrap.
COACH MODE: all Practice fields + optionExplanations for every option A-D.

JSON SCHEMA:
{
  "questions": [
    {
      "subject": "Pharmacology",
      "system": "Cardiovascular",
      "testedConcept": "Short concept name",
      "weakSpotCategory": "Analytics label",
      "usmleContentArea": "Cardiovascular System",
      "usmleSubdomain": "Heart Failure Pharmacology",
      "physicianTask": "Patient Care: Pharmacotherapy",
      "stem": "Clinical vignette.",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": "B",
      "optionExplanations": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "explanation": "Full teaching paragraph.",
      "highYieldPearl": "One-line pearl",
      "memoryAnchor": "Memory trick",
      "commonTrap": "Reasoning error students make",
      "questionAngle": "mechanism|diagnosis|treatment|complication|pharmacology|pathophysiology|adverse-effect|lab-interpretation"
    }
  ]
}

OPTIONS: exactly 4 per question (A-D only). correct is one letter "A","B","C","D".
optionExplanations: Coach Mode ONLY. explanation/pearl/anchor/trap: Practice + Coach only.
Generate exactly the number of questions requested. Each must have a unique testedConcept.
subject must be exactly one of: ${allowedSubjects.join(' | ')}
system must be exactly one of: ${allowedSystems.join(' | ')}
difficulty, when provided, must be exactly one of: ${allowedDifficulties.join(' | ')}
usmleContentArea must be exactly one of: Human Development | Immune System | Blood & Lymphoreticular System | Behavioral Health | Nervous System & Special Senses | Skin & Subcutaneous Tissue | Musculoskeletal System | Cardiovascular System | Respiratory System | Gastrointestinal System | Renal & Urinary System | Pregnancy, Childbirth, & the Puerperium | Female and Transgender Reproductive System & Breast | Male and Transgender Reproductive System | Endocrine System | Multisystem Processes & Disorders | Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature | Social Sciences
physicianTask must be exactly one of: Medical Knowledge: Applying Foundational Science Concepts | Patient Care: History and Physical Examination | Patient Care: Laboratory and Diagnostic Studies | Patient Care: Diagnosis | Patient Care: Prognosis and Outcome | Patient Care: Health Maintenance and Disease Prevention | Patient Care: Pharmacotherapy | Patient Care: Clinical Interventions | Patient Care: Mixed Management | Communication | Professionalism, Legal, and Ethical Principles | Systems-Based Practice and Patient Safety | Practice-Based Learning and Improvement`;

function buildPrompt(config: Record<string, any>, count: number, offset: number, scope: ReturnType<typeof resolveScope>) {
  const modeLabel = String(config.mode).charAt(0).toUpperCase() + String(config.mode).slice(1);
  const specific = isSpecific(scope);
  const lines = [`Mode: ${modeLabel}`];

  if (specific) {
    lines.push(`TOPIC (REQUIRED — every question must directly test this): ${scope.scopeText}`);
    lines.push(`Subject: ${(scope.subject && !isEmpty(scope.subject)) ? scope.subject : 'Mixed'}`);
    lines.push(`Organ System: ${(scope.system  && !isEmpty(scope.system))  ? scope.system  : 'Mixed'}`);
  } else {
    lines.push(`Subject: ${(!isEmpty(config.subject)) ? config.subject : 'Mixed'}`);
    lines.push(`Organ System: ${(!isEmpty(config.system)) ? config.system : 'Mixed'}`);
    if (config.topic) lines.push(`Topic: ${config.topic}`);
    if (config.clinicalFocus) lines.push(`Clinical Themes: ${config.clinicalFocus}`);
  }

  lines.push(`Number of questions: ${count}`);
  lines.push(`Difficulty: ${config.difficulty || 'Mixed'}`);

  if (specific) {
    lines.push('', 'SCOPE REQUIREMENTS:');
    lines.push(`- Every question must directly test "${scope.scopeText}"`);
    lines.push('- Each question must cover a different testedConcept and a different questionAngle');
    lines.push('- questionAngle: mechanism, diagnosis, treatment, complication, pharmacology, pathophysiology, adverse-effect, lab-interpretation');
  }

  // Adaptive focus — injected only when scope is global/mixed and user has weak concepts
  if (config.adaptiveFocusText) {
    lines.push('', String(config.adaptiveFocusText));
  }

  lines.push('', 'DIVERSITY REQUIREMENTS — enforce strictly across every question in this batch:');
  lines.push('- Every question must test a DIFFERENT testedConcept — no repeated concepts whatsoever');
  lines.push('- Every question must feature a DIFFERENT primary diagnosis, drug class, or pathology');
  lines.push('- Every question must involve a DIFFERENT clinical mechanism or physiological pathway');
  lines.push('- Vary patient demographics: mix pediatric, young adult, adult, and elderly patients');
  lines.push('- Vary clinical settings: emergency, outpatient, inpatient, ICU, primary care');
  lines.push('- Vary questionAngle per question: mechanism, diagnosis, treatment, complication, pharmacology, pathophysiology, adverse-effect, lab-interpretation');
  lines.push('- Do NOT include an id field in any question object. IDs are assigned by the server.');

  lines.push('', `Generate exactly ${count} USMLE Step 1-style questions. Output valid JSON only.`);
  return lines.join('\n');
}

const VALID_LETTERS = ['A', 'B', 'C', 'D'];

function normalizeQuestionTaxonomy(q: Record<string, any>, scope: ReturnType<typeof resolveScope>) {
  const rawSubject = String(q.subject || '').trim();
  const rawSystem = String(q.system || '').trim();
  const rawDifficulty = String(q.difficulty || '').trim();

  const subject = normalizeSubject(rawSubject) ?? (
    rawSubject && normalizeSystem(rawSubject) ? '' : normalizeSubject(scope.subject)
  ) ?? '';

  const rawSubjectAsSystem = normalizeSystem(rawSubject);
  const system = normalizeSystem(rawSystem) ?? rawSubjectAsSystem ?? normalizeSystem(scope.system) ?? '';
  const difficulty = normalizeDifficulty(rawDifficulty) ?? '';

  return { subject, system, difficulty };
}

function normalizeQuestion(q: Record<string, any>, index: number, scope: ReturnType<typeof resolveScope>) {
  const rawOpts = Array.isArray(q.options) ? q.options : [];
  const opts = rawOpts.slice(0, 4).map((o: any, i: number) => {
    let text = '';
    if (typeof o === 'string') text = o.replace(/^[A-D]\.\s*/, '').trim();
    else if (o && typeof o === 'object') text = (o.text || o.content || '').trim();
    return { letter: VALID_LETTERS[i], text };
  });
  while (opts.length < 4) opts.push({ letter: VALID_LETTERS[opts.length], text: '' });

  // Preserve invalid values rather than silently defaulting to 'A' so that
  // scoreQuestion can detect invalid_correct_letter and reject/repair the question.
  const rawCorrect = q.correct ?? q.correctAnswer;
  let correct: string;
  if (typeof rawCorrect === 'number') {
    correct = VALID_LETTERS[rawCorrect] ?? '';
  } else {
    correct = String(rawCorrect ?? '').trim().toUpperCase().charAt(0);
  }

  const scopeRaw = scope.rawTopic || scope.canonicalTopic || scope.scopeText || '';
  const taxonomy = normalizeQuestionTaxonomy(q, scope);

  return {
    id: `q${index + 1}`,
    subject: taxonomy.subject,
    system: taxonomy.system,
    topic: q.topic || scope.topic || '',
    rawTopic: q.rawTopic || scopeRaw,
    canonicalTopic: q.canonicalTopic || scope.canonicalTopic || scopeRaw,
    topicSlug:   q.topicSlug   || scope.topicSlug   || '',
    topicSource: q.topicSource || scope.topicSource || '',
    questionAngle:    String(q.questionAngle    || '').trim(),
    usmleContentArea: String(q.usmleContentArea || '').trim(),
    usmleSubdomain:   String(q.usmleSubdomain   || '').trim(),
    physicianTask:    String(q.physicianTask     || '').trim(),
    difficulty: taxonomy.difficulty,
    testedConcept:    q.testedConcept    || q.tested_concept    || '',
    weakSpotCategory: q.weakSpotCategory || q.weak_spot_category || '',
    stem: (q.stem || '').trim(),
    options: opts,
    correct,
    explanation:      (q.explanation  || '').trim(),
    pearl:            q.pearl         || q.highYieldPearl  || q.high_yield_pearl || '',
    memoryAnchor:     q.memoryAnchor  || q.memory_anchor   || '',
    commonTrap:       q.commonTrap    || q.common_trap      || '',
    optionExplanations: q.optionExplanations || {},
  };
}

async function attemptRepair(
  q: ReturnType<typeof normalizeQuestion>,
  quality: QuestionQuality,
): Promise<Record<string, any> | null> {
  const prompt = buildRepairPrompt(q as Record<string, unknown>, quality);
  if (!prompt) return null;
  try {
    const response = await callWithRetry({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: QUIZ_GEN_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');
    let s = text.trim().replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '').trim();
    const start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ── AI medical review gate ───────────────────────────────────────────────────

async function callMedicalReview(
  q: ReviewableQuestion,
  difficulty: string,
): Promise<{ pass: boolean; result: MedicalReviewResult | null; failedCategories: MedicalReviewCategory[] }> {
  try {
    const prompt = buildMedicalReviewPrompt(q, difficulty);
    const model  = process.env.AI_MEDICAL_REVIEW_MODEL || process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
    const response = await callWithRetry({
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);
    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');
    const { pass, result } = parseMedicalReviewResponse(text);
    const failedCategories = collectFailedMedicalReviewCategories(result);
    return { pass, result, failedCategories };
  } catch {
    return { pass: false, result: null, failedCategories: [] };
  }
}

const validationMedicalReview: MedicalReviewAdapter = async (question, difficulty) =>
  callMedicalReview(question as ReviewableQuestion, difficulty);

function requestedScopeForValidation(scope: ReturnType<typeof resolveScope>) {
  return scope.subject || scope.system || scope.topic
    ? { subject: scope.subject, system: scope.system, topic: scope.topic }
    : undefined;
}

async function runQuestionValidation(
  question: Record<string, any>,
  config: Record<string, any>,
  scope: ReturnType<typeof resolveScope>,
  options: { medicalReview?: boolean } = {},
): Promise<ValidationEngineResult> {
  const skipMedical = options.medicalReview === false;
  return validateQuestion({
    question,
    mode: config.mode || 'practice',
    difficulty: config.difficulty || 'Balanced',
    requestedScope: requestedScopeForValidation(scope),
    medicalReview: skipMedical ? undefined : validationMedicalReview,
    // When skipping MR, override the policy gate so NBME/UWorld questions
    // are not blocked by medicalReviewSkippedResult(true) in the engine.
    // Phase 2 runs the actual reviews in parallel for rule-based passers only.
    policy: skipMedical ? { requiresMedicalReview: false } : undefined,
  });
}

export interface BatchTelemetry {
  medicalReviewRequested: number;
  medicalReviewPassed:    number;
  medicalReviewRejected:  number;
  medicalReviewSkipped:   number;
  ruleRejected:           number;
  scopeRejected:          number;  // hard-rejected for NBME/UWorld scope mismatch before medical review
  matrixPasses:           number;  // subject_system validator returned pass
  matrixWarnings:         number;  // subject_system validator returned warn
  matrixFailures:         number;  // subject_system validator returned fail (invalid pair)
  topicPasses:            number;  // topic validator returned pass
  topicWarnings:          number;  // topic validator returned warn (unknown or cross-cutting)
  topicFailures:          number;  // topic validator returned fail (both dims mismatch)
  unknownTopics:          Array<{ topic: string; subject: string; system: string }>;
  conceptPasses:          number;  // concept validator returned pass
  conceptWarnings:        number;  // concept validator returned warn (unknown, alias, or cross-cutting)
  conceptFailures:        number;  // concept validator returned fail (both dims mismatch)
  unknownConcepts:        Array<{ concept: string; topic: string; subject: string; system: string }>;
  medicalReviewFailureCategories: MedicalReviewFailureCategories;
}

export interface BatchResult {
  questions: Record<string, any>[];
  telemetry: BatchTelemetry;
}

async function generateBatch(config: Record<string, any>, count: number, offset: number, scope: ReturnType<typeof resolveScope>): Promise<BatchResult> {
  const prompt = buildPrompt(config, count, offset, scope);
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }];
  let fullText = '';

  while (true) {
    const response = await callWithRetry({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: getMaxTokens(config.mode, count),
      system: QUIZ_GEN_SYSTEM,
      messages,
    } as Anthropic.MessageCreateParamsNonStreaming);

    const chunk = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('');
    fullText += chunk;

    if (response.stop_reason !== 'max_tokens') break;
    messages.push({ role: 'assistant', content: chunk });
    messages.push({ role: 'user', content: 'Continue from exactly where you left off. Do not repeat any content.' });
  }

  let s = fullText.trim().replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '').trim();
  const start = s.indexOf('{'), end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);

  // Guard: JSON.parse can throw on control characters in long responses (real-world occurrence).
  // Return an empty batch rather than propagating to a 500 — the route's retry path picks it up.
  let parsed: { questions?: unknown[] };
  try {
    parsed = JSON.parse(s) as { questions?: unknown[] };
  } catch (parseErr) {
    console.warn('[generateBatch] JSON parse failed:', (parseErr as Error).message?.slice(0, 120));
    return { questions: [], telemetry: { medicalReviewRequested: 0, medicalReviewPassed: 0, medicalReviewRejected: 0, medicalReviewSkipped: 0, ruleRejected: 0, scopeRejected: 0, matrixPasses: 0, matrixWarnings: 0, matrixFailures: 0, topicPasses: 0, topicWarnings: 0, topicFailures: 0, unknownTopics: [], conceptPasses: 0, conceptWarnings: 0, conceptFailures: 0, unknownConcepts: [], medicalReviewFailureCategories: emptyMedicalReviewFailureCategories() } };
  }
  if (!Array.isArray(parsed.questions)) {
    console.warn('[generateBatch] AI response missing questions array');
    return { questions: [], telemetry: { medicalReviewRequested: 0, medicalReviewPassed: 0, medicalReviewRejected: 0, medicalReviewSkipped: 0, ruleRejected: 0, scopeRejected: 0, matrixPasses: 0, matrixWarnings: 0, matrixFailures: 0, topicPasses: 0, topicWarnings: 0, topicFailures: 0, unknownTopics: [], conceptPasses: 0, conceptWarnings: 0, conceptFailures: 0, unknownConcepts: [], medicalReviewFailureCategories: emptyMedicalReviewFailureCategories() } };
  }

  const rawQuestions: Record<string, any>[] = parsed.questions as Record<string, any>[];
  const normalized = rawQuestions.map((q, i) => normalizeQuestion(q, offset + i, scope));

  const results: Array<Record<string, any>> = [];
  let passCount = 0, repairCount = 0, rejectCount = 0;

  const difficulty  = config.difficulty || 'Balanced';
  const needsReview = requiresMedicalReview(difficulty);
  let mrRequested = 0, mrPassed = 0, mrRejected = 0, mrSkipped = 0;
  let scopeRejected = 0;
  let matrixPasses = 0, matrixWarnings = 0, matrixFailures = 0;
  let topicPasses = 0, topicWarnings = 0, topicFailures = 0;
  const unknownTopics: Array<{ topic: string; subject: string; system: string }> = [];
  let conceptPasses = 0, conceptWarnings = 0, conceptFailures = 0;
  const unknownConcepts: Array<{ concept: string; topic: string; subject: string; system: string }> = [];
  const mrFailureCategories = emptyMedicalReviewFailureCategories();

  // ── Phase 1: rule-based validation only (MR deferred to Phase 2) ─────────────
  // Medical review is skipped here via the policy override — NBME/UWorld questions
  // are not penalised for the missing MR adapter; they are collected as rulePassers
  // and reviewed in parallel in Phase 2.  This avoids burning an Anthropic API call
  // on questions that are already going to be rejected by rule validators.
  type FailedItem = {
    q: ReturnType<typeof normalizeQuestion>;
    rawQ: Record<string, any>;
    validation: ValidationEngineResult;
    idx: number;
  };
  type RulePasserItem = {
    q: ReturnType<typeof normalizeQuestion>;
    rawQ: Record<string, any>;
    validation: ValidationEngineResult;
    idx: number;
  };
  const failers: FailedItem[] = [];
  const rulePassers: RulePasserItem[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const validation = await runQuestionValidation(normalized[i], config, scope, { medicalReview: false });

    const ssV = validation.validators.find(v => v.name === 'subject_system');
    if (ssV) {
      if (ssV.status === 'fail')      matrixFailures++;
      else if (ssV.status === 'warn') matrixWarnings++;
      else                            matrixPasses++;
    }

    const topicV = validation.validators.find(v => v.name === 'topic');
    if (topicV) {
      if (topicV.status === 'fail')      topicFailures++;
      else if (topicV.status === 'warn') {
        topicWarnings++;
        if (topicV.reasons.includes('topic_unknown')) {
          unknownTopics.push({
            topic:   normalized[i].topic   || normalized[i].canonicalTopic || '',
            subject: normalized[i].subject || '',
            system:  normalized[i].system  || '',
          });
        }
      } else {
        topicPasses++;
      }
    }

    const conceptV = validation.validators.find(v => v.name === 'concept');
    if (conceptV) {
      if (conceptV.status === 'fail')      conceptFailures++;
      else if (conceptV.status === 'warn') {
        conceptWarnings++;
        if (conceptV.reasons.includes('concept_unknown')) {
          unknownConcepts.push({
            concept: normalized[i].testedConcept || '',
            topic:   normalized[i].topic         || normalized[i].canonicalTopic || '',
            subject: normalized[i].subject       || '',
            system:  normalized[i].system        || '',
          });
        }
      } else {
        conceptPasses++;
      }
    }

    if (validation.passed) {
      rulePassers.push({ q: normalized[i], rawQ: rawQuestions[i], validation, idx: i });
      if (isSuspectStem(normalized[i].stem)) {
        console.warn('[stem-guard]', JSON.stringify({ rawKeys: Object.keys(rawQuestions[i]), normalizedStem: normalized[i].stem, disposition: 'rule-pass' }));
      }
    } else {
      rejectCount++;
      if (validation.validators.some(result => result.name === 'scope' && result.status === 'fail')) {
        scopeRejected++;
      }
      failers.push({ q: normalized[i], rawQ: rawQuestions[i], validation, idx: i });
    }
  }

  // ── Phase 2: parallel medical reviews for rule-based passers ─────────────────
  // For non-MR difficulties (Balanced / More Easy / More Hard) every rule passer
  // is accepted immediately and counts as mrSkipped.  For NBME/UWorld, all reviews
  // run concurrently via Promise.all, cutting per-batch latency from (N × ~4s) to ~4s.
  if (!needsReview) {
    mrSkipped += normalized.length;  // rule passers + failers all skipped MR
    for (const { q, validation } of rulePassers) {
      results.push({ ...q, ...validation.quality, id: randomUUID() });
      passCount++;
    }
  } else {
    const reviewResults = await Promise.all(
      rulePassers.map(({ q }) => callMedicalReview(q as ReviewableQuestion, difficulty)),
    );
    for (let j = 0; j < rulePassers.length; j++) {
      const { q, validation } = rulePassers[j];
      const review = reviewResults[j];
      mrRequested++;
      if (review.pass) {
        mrPassed++;
        results.push({ ...q, ...validation.quality, id: randomUUID() });
        passCount++;
      } else {
        mrRejected++;
        rejectCount++;
        await _saveFailedGeneratedQuestionCandidate(q as Record<string, any>, config, {
          ...validation,
          passed: false,
          blocking: true,
          status: 'fail',
          rejectionReasons: review.failedCategories.length ? review.failedCategories : ['medical_review_failed'],
        }, 'medical-review').catch(err => {
          console.warn('[generated-bank] failed candidate capture skipped:', (err as Error).message);
        });
        for (const reason of review.failedCategories) {
          if (reason in mrFailureCategories) {
            mrFailureCategories[reason as keyof MedicalReviewFailureCategories]++;
          }
        }
        console.warn('[validation-engine] medical-review rejected:', review.failedCategories);
      }
    }
  }

  const trackValidationTelemetry = (validation: ValidationEngineResult) => {
    const medical = validation.validators.find(result => result.name === 'medical_review');
    if (!medical) return;
    if (!validation.policy.requiresMedicalReview) {
      mrSkipped++;
      return;
    }
    mrRequested++;
    if (medical.status === 'pass') {
      mrPassed++;
      return;
    }
    mrRejected++;
    for (const reason of medical.reasons) {
      if (reason in mrFailureCategories) {
        mrFailureCategories[reason as keyof MedicalReviewFailureCategories]++;
      }
    }
  };

  // ── Phase 3: repair-and-review failers sequentially (uncommon path) ──────────
  for (const { q, rawQ, validation, idx } of failers) {
    let disposition = 'rejected';
    let repairedStem: string | null = null;
    const repairedRaw = await attemptRepair(q, validation.quality);
    if (repairedRaw) {
      const repairedNorm    = normalizeQuestion(repairedRaw, offset + idx, scope);
      repairedStem = repairedNorm.stem;
      // Intentionally uses the full validation path (including MR for NBME/UWorld) — no
      // medicalReview:false override.  A repaired question must pass medical review before
      // it can enter the bank, same as a freshly generated one.
      const repairedValidation = await runQuestionValidation(repairedNorm, config, scope);
      trackValidationTelemetry(repairedValidation);
      if (repairedValidation.passed) {
        results.push({
          ...repairedNorm,
          ...repairedValidation.quality,
          validationStatus: 'repaired',
          id: randomUUID(),
        });
        repairCount++;
        disposition = 'repair-passed';
      } else {
        console.warn('[validation-engine] repair failed:', repairedValidation.rejectionReasons, '| score:', repairedValidation.score);
        await _saveFailedGeneratedQuestionCandidate(q as Record<string, any>, config, validation, 'rule-validation').catch(err => {
          console.warn('[generated-bank] failed original candidate capture skipped:', (err as Error).message);
        });
        await _saveFailedGeneratedQuestionCandidate(repairedNorm as Record<string, any>, config, repairedValidation, 'repair-validation').catch(err => {
          console.warn('[generated-bank] failed repair candidate capture skipped:', (err as Error).message);
        });
        disposition = 'repair-failed';
      }
    } else {
      console.warn('[validation-engine] rejected:', validation.rejectionReasons, '| score:', validation.score);
      await _saveFailedGeneratedQuestionCandidate(q as Record<string, any>, config, validation, 'rule-validation').catch(err => {
        console.warn('[generated-bank] failed candidate capture skipped:', (err as Error).message);
      });
    }
    const logStem = disposition === 'repair-passed' && repairedStem !== null ? repairedStem : q.stem;
    if (isSuspectStem(logStem)) {
      console.warn('[stem-guard]', JSON.stringify({ rawKeys: Object.keys(rawQ), normalizedStem: logStem, disposition }));
    }
  }

  console.log(
    `[quality] batch result: ${normalized.length} generated → ${passCount} pass, ${repairCount} repaired, ${rejectCount} rejected` +
    (needsReview ? ` | medical-review: ${mrRequested} req, ${mrPassed} pass, ${mrRejected} reject` : ' | medical-review: skipped'),
  );
  return {
    questions: results,
    telemetry: {
      medicalReviewRequested:         mrRequested,
      medicalReviewPassed:            mrPassed,
      medicalReviewRejected:          mrRejected,
      medicalReviewSkipped:           mrSkipped,
      ruleRejected:                   rejectCount - mrRejected - scopeRejected,
      scopeRejected,
      matrixPasses,
      matrixWarnings,
      matrixFailures,
      topicPasses,
      topicWarnings,
      topicFailures,
      unknownTopics,
      conceptPasses,
      conceptWarnings,
      conceptFailures,
      unknownConcepts,
      medicalReviewFailureCategories: mrFailureCategories,
    },
  };
}

// ── Hard-mode adaptive refill ────────────────────────────────────────────────

/**
 * Per-difficulty caps for the adaptive refill loop.
 * candidatesPerRound ≈ maxCandidates / maxRounds so that both caps bind
 * at approximately the same total-candidate count and are independently
 * reachable with synthetic values in tests.
 */
export const HARD_MODE_CAPS: Record<string, { maxCandidates: number; maxRounds: number; candidatesPerRound: number }> = {
  'UWorld Challenge': { maxCandidates: 140, maxRounds: 5, candidatesPerRound: 28 },
  'NBME Difficult':   { maxCandidates: 100, maxRounds: 4, candidatesPerRound: 25 },
};

export type StoppedReason =
  | 'requested_count_reached'
  | 'max_candidates_reached'
  | 'max_refill_rounds_reached'
  | 'generation_error'
  | 'rate_limited'
  | 'unknown';

export interface GenerationLoopResult {
  accepted:            Record<string, any>[];
  totalGenerated:      number;
  refillRounds:        number;
  stoppedReason:       StoppedReason;
  totalMrRequested:    number;
  totalMrPassed:       number;
  totalMrRejected:     number;
  totalMrSkipped:      number;
  totalRuleRejected:   number;
  totalDedupRejected:  number;
  totalScopeRejected:  number;  // sum of scopeRejected across all batches
  totalMatrixPasses:   number;
  totalMatrixWarnings: number;
  totalMatrixFailures: number;
  totalTopicPasses:      number;
  totalTopicWarnings:    number;
  totalTopicFailures:    number;
  unknownTopics:         Array<{ topic: string; subject: string; system: string }>;
  totalConceptPasses:    number;
  totalConceptWarnings:  number;
  totalConceptFailures:  number;
  unknownConcepts:       Array<{ concept: string; topic: string; subject: string; system: string }>;
  medicalReviewFailureCategories: MedicalReviewFailureCategories;
}

/**
 * Adaptive refill loop for hard-mode difficulties.
 *
 * Keeps calling `batchFn` in rounds until `targetCount` accepted questions are collected
 * or a hard cap (maxRounds or maxCandidates) is reached.  Each round generates
 * `caps.candidatesPerRound` candidates split into sub-batches of `GENERATE_BATCH_SIZE`.
 *
 * `filterFn(batch, existingConcepts)` is responsible for dedup and scope-filtering;
 * it should return only questions not already accepted.  After filtering, each accepted
 * question's normalised testedConcept is added to `existingConcepts` for future rounds.
 *
 * Exported so tests can drive it with mock batchFn/filterFn without touching Anthropic.
 */
export async function runAdaptiveRefill(
  targetCount: number,
  caps:        { maxCandidates: number; maxRounds: number; candidatesPerRound: number },
  batchFn:     (count: number, offset: number) => Promise<BatchResult>,
  filterFn:    (questions: Record<string, any>[], existingConcepts: Set<string>) => Record<string, any>[],
): Promise<GenerationLoopResult> {
  const accepted: Record<string, any>[] = [];
  const existingConcepts = new Set<string>();
  let totalGenerated = 0, refillRounds = 0;
  let totalMrRequested = 0, totalMrPassed = 0, totalMrRejected = 0, totalMrSkipped = 0;
  let totalRuleRejected = 0, totalDedupRejected = 0, totalScopeRejected = 0;
  let totalMatrixPasses = 0, totalMatrixWarnings = 0, totalMatrixFailures = 0;
  let totalTopicPasses = 0, totalTopicWarnings = 0, totalTopicFailures = 0;
  const unknownTopics: Array<{ topic: string; subject: string; system: string }> = [];
  let totalConceptPasses = 0, totalConceptWarnings = 0, totalConceptFailures = 0;
  const unknownConcepts: Array<{ concept: string; topic: string; subject: string; system: string }> = [];
  const medicalReviewFailureCategories = emptyMedicalReviewFailureCategories();
  let stoppedReason: StoppedReason = 'unknown';

  outerLoop: while (accepted.length < targetCount) {
    // Cap checks before starting a new round
    if (refillRounds >= caps.maxRounds)       { stoppedReason = 'max_refill_rounds_reached'; break; }
    if (totalGenerated >= caps.maxCandidates) { stoppedReason = 'max_candidates_reached';   break; }

    let roundGenerated = 0;

    // Sub-batch loop: fill one round's worth of candidates
    while (roundGenerated < caps.candidatesPerRound && totalGenerated < caps.maxCandidates) {
      const batchSize = Math.min(
        GENERATE_BATCH_SIZE,
        caps.candidatesPerRound - roundGenerated,
        caps.maxCandidates - totalGenerated,
      );

      let batchResult: BatchResult;
      try {
        batchResult = await batchFn(batchSize, totalGenerated);
      } catch (batchErr: any) {
        stoppedReason = (batchErr as any)?.status === 429 ? 'rate_limited' : 'generation_error';
        console.warn(
          `[generate-questions] refill round ${refillRounds + 1} batch error (${stoppedReason}):`,
          String((batchErr as Error)?.message ?? batchErr).slice(0, 80),
        );
        break outerLoop;
      }

      roundGenerated    += batchSize;
      totalGenerated    += batchSize;
      totalMrRequested   += batchResult.telemetry.medicalReviewRequested;
      totalMrPassed      += batchResult.telemetry.medicalReviewPassed;
      totalMrRejected    += batchResult.telemetry.medicalReviewRejected;
      totalMrSkipped     += batchResult.telemetry.medicalReviewSkipped;
      totalRuleRejected  += batchResult.telemetry.ruleRejected;
      totalScopeRejected += batchResult.telemetry.scopeRejected;
      totalMatrixPasses   += batchResult.telemetry.matrixPasses;
      totalMatrixWarnings += batchResult.telemetry.matrixWarnings;
      totalMatrixFailures += batchResult.telemetry.matrixFailures;
      totalTopicPasses    += batchResult.telemetry.topicPasses;
      totalTopicWarnings  += batchResult.telemetry.topicWarnings;
      totalTopicFailures  += batchResult.telemetry.topicFailures;
      unknownTopics.push(...(batchResult.telemetry.unknownTopics ?? []));
      totalConceptPasses    += batchResult.telemetry.conceptPasses;
      totalConceptWarnings  += batchResult.telemetry.conceptWarnings;
      totalConceptFailures  += batchResult.telemetry.conceptFailures;
      unknownConcepts.push(...(batchResult.telemetry.unknownConcepts ?? []));
      accumulateMedicalReviewFailureCategories(medicalReviewFailureCategories, batchResult.telemetry.medicalReviewFailureCategories);

      const beforeFilter  = batchResult.questions.length;
      const newOnes       = filterFn(batchResult.questions, existingConcepts);
      totalDedupRejected += beforeFilter - newOnes.length;

      for (const q of newOnes) {
        existingConcepts.add(norm(q.testedConcept ?? ''));
        accepted.push(q);
      }
    }

    refillRounds++;
    console.log(
      `[generate-questions] refill round ${refillRounds}/${caps.maxRounds}:` +
      ` +${roundGenerated} generated, accepted=${accepted.length}/${targetCount}, total_candidates=${totalGenerated}`,
    );

    if (accepted.length >= targetCount) { stoppedReason = 'requested_count_reached'; break; }
  }

  if (stoppedReason === 'unknown') {
    stoppedReason = accepted.length >= targetCount
      ? 'requested_count_reached'
      : totalGenerated >= caps.maxCandidates
      ? 'max_candidates_reached'
      : 'max_refill_rounds_reached';
  }

  return {
    accepted, totalGenerated, refillRounds, stoppedReason,
    totalMrRequested, totalMrPassed, totalMrRejected, totalMrSkipped,
    totalRuleRejected, totalDedupRejected, totalScopeRejected,
    totalMatrixPasses, totalMatrixWarnings, totalMatrixFailures,
    totalTopicPasses, totalTopicWarnings, totalTopicFailures, unknownTopics,
    totalConceptPasses, totalConceptWarnings, totalConceptFailures, unknownConcepts,
    medicalReviewFailureCategories,
  };
}

function _questionBodyForGeneratedBank(
  question: ReturnType<typeof normalizeQuestion>,
  config: Record<string, any>,
  fingerprint: string,
  quality: QuestionQuality,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const subject = normalizeSubject(question.subject) ?? normalizeSubject(config.subject) ?? '';
  const system = normalizeSystem(question.system) ?? normalizeSystem(config.system) ?? '';
  const difficulty = normalizeDifficulty(question.difficulty) ?? normalizeDifficulty(config.difficulty) ?? 'Balanced';
  const rawTopicForNorm = question.topic || question.canonicalTopic || '';
  const canonicalTopic = normalizeTopic(rawTopicForNorm) ?? question.canonicalTopic ?? '';
  const rawConceptForNorm = question.testedConcept || '';
  const canonicalConceptNorm = normalizeConcept(rawConceptForNorm);
  const canonicalConcepts = canonicalConceptNorm ? [canonicalConceptNorm] : (rawConceptForNorm ? [rawConceptForNorm] : []);
  return {
    ...question,
    id: fingerprint,
    subject,
    system,
    canonicalTopic,
    canonicalConcepts,
    source: 'ai',
    bankStatus: 'validated_generated',
    promotionStatus: 'candidate',
    fingerprint,
    mode: config.mode || '',
    difficulty,
    validationStatus: quality.validationStatus,
    validationScore: quality.qualityScore,
    validationVersion: 'server-question-validator-v1',
    generatedAt: now,
    validatedAt: now,
    usageCount: 0,
    reportCount: 0,
  };
}

function _questionBodyForFailedGeneratedCandidate(
  question: ReturnType<typeof normalizeQuestion>,
  config: Record<string, any>,
  fingerprint: string,
  validation: ValidationEngineResult,
  source: 'rule-validation' | 'medical-review' | 'repair-validation',
): Record<string, unknown> {
  const now = new Date().toISOString();
  const subject = normalizeSubject(question.subject) ?? normalizeSubject(config.subject) ?? '';
  const system = normalizeSystem(question.system) ?? normalizeSystem(config.system) ?? '';
  const difficulty = normalizeDifficulty(question.difficulty) ?? normalizeDifficulty(config.difficulty) ?? 'Balanced';
  const rawTopicForNorm = question.topic || question.canonicalTopic || '';
  const canonicalTopic = normalizeTopic(rawTopicForNorm) ?? question.canonicalTopic ?? '';
  const rawConceptForNorm = question.testedConcept || '';
  const canonicalConceptNorm = normalizeConcept(rawConceptForNorm);
  const canonicalConcepts = canonicalConceptNorm ? [canonicalConceptNorm] : (rawConceptForNorm ? [rawConceptForNorm] : []);
  return {
    ...question,
    id: fingerprint,
    subject,
    system,
    canonicalTopic,
    canonicalConcepts,
    source: 'ai',
    bankStatus: 'validation_failed',
    promotionStatus: 'review_candidate',
    fingerprint,
    mode: config.mode || '',
    difficulty,
    validationStatus: 'fail',
    validationScore: validation.score,
    validationVersion: 'central-validation-engine-v1',
    rejectionReasons: validation.rejectionReasons,
    warnings: validation.warnings,
    validatorResults: validation.validators,
    failedAt: now,
    generatedAt: now,
    validationFailureSource: source,
    usageCount: 0,
    reportCount: 0,
  };
}

async function _validatePromotableQuestion(rawQuestion: Record<string, any>, config: Record<string, any>) {
  const scope = resolveScope(config);
  const question = normalizeQuestion(rawQuestion, 0, scope);
  const validation = await runQuestionValidation(question, config, scope);
  const fingerprint = computeQuestionFingerprint(question.stem || '', question.testedConcept || '');
  (question as Record<string, any>).id = String(rawQuestion.id || fingerprint);
  // Preserve lifecycle metadata that normalizeQuestion does not carry
  if (rawQuestion.bankStatus) (question as Record<string, any>).bankStatus = String(rawQuestion.bankStatus);
  const validFingerprint = Boolean(fingerprint && fingerprint !== '||');
  const valid = validation.passed && validFingerprint;
  return { valid, question, quality: validation.quality, validation, fingerprint };
}

export async function _saveGeneratedQuestionsToBank(questions: Record<string, any>[], config: Record<string, any>): Promise<number> {
  const repo = getRepositories().questions;
  let saved = 0;
  for (const rawQuestion of questions) {
    const { valid, question, quality, fingerprint } = await _validatePromotableQuestion(rawQuestion, config);
    if (!valid) continue;
    // P0: preserve stronger lifecycle status — do not downgrade approved/quarantined rows
    const existingRows = await repo.findGeneratedBankReview({ externalId: fingerprint, limit: 1 });
    const existingStatus = existingRows[0] ? String((existingRows[0] as Record<string, any>).bankStatus ?? '') : '';
    if (existingStatus === 'approved' || existingStatus === 'quarantined') continue;
    const body = _questionBodyForGeneratedBank(question, config, fingerprint, quality);
    await repo.upsertByExternalId(fingerprint, {
      subject: String(body.subject || ''),
      system:  String(body.system || ''),
      body,
      source: 'ai',
      bankStatus: 'validated_generated',
      mode: String(body.mode || ''),
      difficulty: String(body.difficulty || ''),
      validationScore: Number(body.validationScore || 0),
      validatedAt: String(body.validatedAt || ''),
    });
    saved++;
  }
  return saved;
}

async function _saveFailedGeneratedQuestionCandidate(
  rawQuestion: Record<string, any>,
  config: Record<string, any>,
  validation: ValidationEngineResult,
  source: 'rule-validation' | 'medical-review' | 'repair-validation',
): Promise<boolean> {
  const repo = getRepositories().questions;
  const scope = resolveScope(config);
  const question = normalizeQuestion(rawQuestion, 0, scope);
  const fingerprint = computeQuestionFingerprint(question.stem || '', question.testedConcept || '');
  if (!fingerprint || fingerprint === '||') return false;

  const existingRows = await repo.findGeneratedBankReview({ externalId: fingerprint, limit: 1 });
  const existingStatus = existingRows[0] ? String((existingRows[0] as Record<string, any>).bankStatus ?? '') : '';
  if (existingStatus === 'approved' || existingStatus === 'quarantined' || existingStatus === 'rejected') return false;

  const body = _questionBodyForFailedGeneratedCandidate(question, config, fingerprint, validation, source);
  await repo.upsertByExternalId(fingerprint, {
    subject: String(body.subject || ''),
    system: String(body.system || ''),
    body,
    source: 'ai',
    bankStatus: 'validation_failed',
    mode: String(body.mode || ''),
    difficulty: String(body.difficulty || ''),
    validationScore: Number(body.validationScore || 0),
    validatedAt: String(body.failedAt || ''),
  });
  return true;
}

async function _getReusableGeneratedBankQuestions(config: Record<string, any>, targetCount: number, approvedOnly = false): Promise<Record<string, any>[]> {
  const repo = getRepositories().questions;
  const scope = resolveScope(config);
  const rawBank = await repo.findGeneratedBankQuestions({
    subject:    config.subject,
    system:     config.system,
    difficulty: config.difficulty || 'Balanced',
    mode:       config.mode,
    limit:      Math.min(targetCount * 3, 200),
    approvedOnly,
  });

  // Scope filter runs on the raw stored body BEFORE normalizeQuestion is called,
  // because normalizeQuestion fills empty canonicalTopic/rawTopic from the request
  // scope — which would cause off-topic questions to falsely pass inScope.
  const scopeFiltered = isSpecific(scope) ? rawBank.filter(q => inScope(q as Record<string, any>, scope)) : rawBank;

  const validationResults = await Promise.all(
    scopeFiltered.map(q => _validatePromotableQuestion(q as Record<string, any>, config)),
  );
  const valid = validationResults
    .filter(result => result.valid)
    .map(result => result.question as Record<string, any>);

  try {
    const quarantinedFps = await getRepositories().questionReports.getQuarantinedFingerprints();
    if (quarantinedFps.size === 0) return valid;
    return valid.filter(q => !quarantinedFps.has(computeQuestionFingerprint(q.stem || '', q.testedConcept || '')));
  } catch {
    return [];
  }
}

router.post('/generate-questions', optionalAuth, aiLimiter, validate(generateQuestionsSchema), async (req: AuthRequest, res: Response) => {
  const { config: rawConfig } = req.body ?? {};

  if (!rawConfig?.mode || !rawConfig?.questionCount) {
    res.status(400).json({ error: 'Missing required config fields: mode, questionCount', code: 'INVALID_CONFIG' });
    return;
  }

  const STANDARDIZED_BLOCK = 'standardized-40-question-block';

  try {
    let config = rawConfig;
    if (config.blockType === STANDARDIZED_BLOCK) {
      config = {
        ...config,
        mode: 'exam',
        questionCount: 40,
        subject: '',
        system: '',
        topic: '',
        clinicalFocus: '',
        difficulty: 'Balanced',
      };
    }
    config = normalizeConfigTaxonomy(config);
    const targetCount = Math.min(Math.max(Number(config.questionCount) || 5, 1), 40);
    let scope = resolveScope(config);
    let specific = isSpecific(scope);

    // Reject suspect topic text before it reaches the prompt.
    if (specific && isTopicSuspect(scope.scopeText)) {
      res.status(400).json({ error: 'Invalid topic — contains disallowed content', code: 'INVALID_TOPIC' });
      return;
    }

    // Classify manual topics before prompt construction or generated-bank lookup.
    const topicIntake = classifyRequestedTopic(scope, config);
    if (!topicIntake.ok) {
      res.status(400).json({
        error: 'Invalid topic - enter a medical education topic',
        code: 'INVALID_TOPIC',
        reason: topicIntake.reason,
      });
      return;
    }
    config = topicIntake.config;
    scope = resolveScope(config);
    specific = isSpecific(scope);

    if (!req.userId) {
      res.status(401).json({ error: 'Authentication required.', code: 'AUTH_REQUIRED' });
      return;
    }

    // Adaptive blueprint — only for global/mixed scope; specific-topic overrides it.
    // Requires an authenticated user (optionalAuth sets req.userId when token is present).
    let adaptiveBlueprint: AdaptiveBlueprint | null = null;
    if (!specific && req.userId) {
      try {
        const { userConceptMastery, concepts } = getRepositories();
        const bp = await new AdaptiveExamService(userConceptMastery, concepts)
          .buildAdaptiveBlueprint(req.userId, targetCount);
        if (bp.enabled) adaptiveBlueprint = bp;
      } catch (err) {
        console.warn('[generate-questions] adaptive blueprint skipped:', (err as Error).message);
      }
    }
    if (adaptiveBlueprint) {
      config = { ...config, adaptiveFocusText: adaptiveBlueprint.promptFocusText };
    }

    const hardModeCaps = HARD_MODE_CAPS[config.difficulty] ?? null;
    const requireApprovalForProduction = process.env.REQUIRE_APPROVAL_FOR_PRODUCTION === 'true';
    const allowValidatedReuse = process.env.ALLOW_VALIDATED_REUSE !== 'false';
    const approvedOnly = requireApprovalForProduction || !allowValidatedReuse;
    const generatedBankQuestions = await _getReusableGeneratedBankQuestions(config, targetCount, approvedOnly);
    const validatedQueueCount = await getRepositories().questions.countGeneratedBankReview({ status: 'validated_generated' }).catch(() => -1);
    if (!adaptiveBlueprint && generatedBankQuestions.length >= targetCount) {
      const questions = generatedBankQuestions.slice(0, targetCount);
      await getRepositories().questions.markUsedByExternalIds(
        questions.map(q => String(q.fingerprint || q.id || '')),
      ).catch(() => {});
      const approvedReuseCount = questions.filter(q => String(q.bankStatus) === 'approved').length;
      const telemetry = {
        requested:              targetCount,
        generated:              0,
        available:              generatedBankQuestions.length,
        returning:              questions.length,
        duplicateRejects:       0,
        mode:                   config.mode,
        difficulty:             config.difficulty || 'Balanced',
        medicalReviewRequested: 0,
        medicalReviewPassed:    0,
        medicalReviewRejected:  0,
        medicalReviewSkipped:   0,
        totalGeneratedCandidates:      0,
        acceptedCandidates:            questions.length,
        ruleRejectedCandidates:        0,
        dedupRejectedCandidates:       0,
        scopeRejectedCandidates:       0,
        quarantineRejectedCandidates:  0,
        matrixPasses:                  0,
        matrixWarnings:                0,
        matrixFailures:                0,
        topicPasses:                   0,
        topicWarnings:                 0,
        topicFailures:                 0,
        unknownTopics:                 [],
        conceptPasses:                 0,
        conceptWarnings:               0,
        conceptFailures:               0,
        unknownConcepts:               [],
        stoppedReason:          'generated_bank_covered_request',
        medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
        reusePolicy: approvedOnly ? 'approved-only' : 'approved-first',
        approvedOnly,
        validatedFallbackAllowed: !approvedOnly,
        approvedReuseCount,
        liveGeneratedCount: 0,
        validatedQueueCount,
        approvedOnlyMode: approvedOnly,
      };
      res.json({
        questions,
        source: 'generated-bank',
        count: questions.length,
        telemetry,
        generationStrategy: 'generated-bank',
        adaptiveConcepts: [],
      });
      return;
    }

    // bankPool: bank questions to serve directly (skipped if adaptive); shortfall: how many AI must fill
    const bankPool = adaptiveBlueprint ? [] : generatedBankQuestions;
    const shortfall = targetCount - bankPool.length;
    const is40QExamBlock = config.mode === 'exam' && targetCount === 40;

    if (!process.env.ANTHROPIC_API_KEY) {
      if (bankPool.length > 0) {
        if (is40QExamBlock) {
          res.status(503).json({
            error: '40 Question Block requires exactly 40 validated questions; live AI is unavailable to fill the shortfall',
            code:  'AI_INSUFFICIENT_COUNT',
            returned: bankPool.length,
            requested: 40,
          });
          return;
        }
        // Partial bank coverage — serve what we have; can't fill shortfall without an AI key
        const questions = bankPool.slice(0, targetCount);
        await getRepositories().questions.markUsedByExternalIds(
          questions.map(q => String(q.fingerprint || q.id || '')),
        ).catch(() => {});
        const approvedReuseCount = questions.filter(q => String(q.bankStatus) === 'approved').length;
        res.json({
          questions,
          source:             'generated-bank',
          count:              questions.length,
          telemetry: {
            requested: targetCount, generated: 0, available: bankPool.length,
            returning: questions.length, duplicateRejects: 0,
            mode: config.mode, difficulty: config.difficulty || 'Balanced',
            medicalReviewRequested: 0, medicalReviewPassed: 0,
            medicalReviewRejected: 0, medicalReviewSkipped: 0,
            refillRounds: undefined, totalGeneratedCandidates: 0,
            acceptedCandidates: questions.length, ruleRejectedCandidates: 0,
            dedupRejectedCandidates: 0, scopeRejectedCandidates: 0,
            quarantineRejectedCandidates: 0, generatedBankSaved: 0,
            bankPoolUsed: bankPool.length, stoppedReason: 'bank_partial_no_api_key',
            matrixPasses: 0, matrixWarnings: 0, matrixFailures: 0,
            topicPasses: 0, topicWarnings: 0, topicFailures: 0, unknownTopics: [],
            conceptPasses: 0, conceptWarnings: 0, conceptFailures: 0, unknownConcepts: [],
            medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
            reusePolicy: approvedOnly ? 'approved-only' : 'approved-first',
            approvedOnly,
            validatedFallbackAllowed: !approvedOnly,
            approvedReuseCount,
            liveGeneratedCount: 0,
            validatedQueueCount,
            approvedOnlyMode: approvedOnly,
          },
          generationStrategy: 'generated-bank',
          adaptiveConcepts:   [],
        });
        return;
      }
      res.status(503).json({ error: 'AI generation unavailable — API key not configured', code: 'NO_API_KEY' });
      return;
    }

    let allQuestions: Record<string, any>[] = [];
    let totalGenerated = 0;
    let totalMrRequested = 0, totalMrPassed = 0, totalMrRejected = 0, totalMrSkipped = 0;
    let totalRuleRejected = 0, totalDedupRejected = 0, totalScopeRejected = 0;
    let totalMatrixPasses = 0, totalMatrixWarnings = 0, totalMatrixFailures = 0;
    let totalTopicPasses = 0, totalTopicWarnings = 0, totalTopicFailures = 0;
    const totalUnknownTopics: Array<{ topic: string; subject: string; system: string }> = [];
    let totalConceptPasses = 0, totalConceptWarnings = 0, totalConceptFailures = 0;
    const totalUnknownConcepts: Array<{ concept: string; topic: string; subject: string; system: string }> = [];
    let refillRounds: number | undefined;
    let stoppedReason: StoppedReason | undefined;
    const totalMrFailureCategories = emptyMedicalReviewFailureCategories();

    if (hardModeCaps) {
      // Hard-mode adaptive refill: keeps generating rounds until target reached or cap hit.
      const loopResult = await runAdaptiveRefill(
        shortfall,
        hardModeCaps,
        (count, offset) => generateBatch(config, count, offset, scope),
        (qs, existingConcepts) =>
          dedup(qs).filter(q =>
            (!specific || inScope(q, scope)) &&
            !existingConcepts.has(norm(q.testedConcept ?? '')),
          ),
      );
      allQuestions         = loopResult.accepted;
      totalGenerated       = loopResult.totalGenerated;
      totalMrRequested     = loopResult.totalMrRequested;
      totalMrPassed        = loopResult.totalMrPassed;
      totalMrRejected      = loopResult.totalMrRejected;
      totalMrSkipped       = loopResult.totalMrSkipped;
      totalRuleRejected    = loopResult.totalRuleRejected;
      totalDedupRejected   = loopResult.totalDedupRejected;
      totalScopeRejected   = loopResult.totalScopeRejected;
      totalMatrixPasses    = loopResult.totalMatrixPasses;
      totalMatrixWarnings  = loopResult.totalMatrixWarnings;
      totalMatrixFailures  = loopResult.totalMatrixFailures;
      totalTopicPasses     = loopResult.totalTopicPasses;
      totalTopicWarnings   = loopResult.totalTopicWarnings;
      totalTopicFailures   = loopResult.totalTopicFailures;
      totalUnknownTopics.push(...loopResult.unknownTopics);
      totalConceptPasses    = loopResult.totalConceptPasses;
      totalConceptWarnings  = loopResult.totalConceptWarnings;
      totalConceptFailures  = loopResult.totalConceptFailures;
      totalUnknownConcepts.push(...loopResult.unknownConcepts);
      refillRounds         = loopResult.refillRounds;
      stoppedReason        = loopResult.stoppedReason;
      accumulateMedicalReviewFailureCategories(totalMrFailureCategories, loopResult.medicalReviewFailureCategories);
    } else {
      // Balanced and other modes: existing fast path — no adaptive refill, no medical review.
      const bufferedCount = Math.min(shortfall + 2, 40);
      let offset = 0;
      while (offset < bufferedCount) {
        const batchSize   = Math.min(GENERATE_BATCH_SIZE, bufferedCount - offset);
        const batchResult = await generateBatch(config, batchSize, offset, scope);
        totalGenerated    += batchSize;
        allQuestions.push(...batchResult.questions);
        totalMrRequested    += batchResult.telemetry.medicalReviewRequested;
        totalMrPassed       += batchResult.telemetry.medicalReviewPassed;
        totalMrRejected     += batchResult.telemetry.medicalReviewRejected;
        totalMrSkipped      += batchResult.telemetry.medicalReviewSkipped;
        totalRuleRejected   += batchResult.telemetry.ruleRejected;
        totalScopeRejected  += batchResult.telemetry.scopeRejected;
        totalMatrixPasses   += batchResult.telemetry.matrixPasses;
        totalMatrixWarnings += batchResult.telemetry.matrixWarnings;
        totalMatrixFailures += batchResult.telemetry.matrixFailures;
        totalTopicPasses    += batchResult.telemetry.topicPasses;
        totalTopicWarnings  += batchResult.telemetry.topicWarnings;
        totalTopicFailures  += batchResult.telemetry.topicFailures;
        totalUnknownTopics.push(...batchResult.telemetry.unknownTopics);
        totalConceptPasses    += batchResult.telemetry.conceptPasses;
        totalConceptWarnings  += batchResult.telemetry.conceptWarnings;
        totalConceptFailures  += batchResult.telemetry.conceptFailures;
        totalUnknownConcepts.push(...batchResult.telemetry.unknownConcepts);
        accumulateMedicalReviewFailureCategories(totalMrFailureCategories, batchResult.telemetry.medicalReviewFailureCategories);
        offset            += batchSize;
      }

      const beforeDedup   = allQuestions.length;
      allQuestions        = dedup(allQuestions);
      totalDedupRejected  = beforeDedup - allQuestions.length;
      if (specific) allQuestions = allQuestions.filter(q => inScope(q, scope));

      if (allQuestions.length < shortfall) {
        const fillGap          = shortfall - allQuestions.length;
        const existingConcepts = new Set(allQuestions.map(q => norm(q.testedConcept)));
        try {
          const retryResult   = await generateBatch(config, fillGap + 3, allQuestions.length, scope);
          totalGenerated      += fillGap + 3;
          totalMrRequested    += retryResult.telemetry.medicalReviewRequested;
          totalMrPassed       += retryResult.telemetry.medicalReviewPassed;
          totalMrRejected     += retryResult.telemetry.medicalReviewRejected;
          totalMrSkipped      += retryResult.telemetry.medicalReviewSkipped;
          totalRuleRejected   += retryResult.telemetry.ruleRejected;
          totalScopeRejected  += retryResult.telemetry.scopeRejected;
          totalMatrixPasses   += retryResult.telemetry.matrixPasses;
          totalMatrixWarnings += retryResult.telemetry.matrixWarnings;
          totalMatrixFailures += retryResult.telemetry.matrixFailures;
          totalTopicPasses    += retryResult.telemetry.topicPasses;
          totalTopicWarnings  += retryResult.telemetry.topicWarnings;
          totalTopicFailures  += retryResult.telemetry.topicFailures;
          totalUnknownTopics.push(...retryResult.telemetry.unknownTopics);
          totalConceptPasses    += retryResult.telemetry.conceptPasses;
          totalConceptWarnings  += retryResult.telemetry.conceptWarnings;
          totalConceptFailures  += retryResult.telemetry.conceptFailures;
          totalUnknownConcepts.push(...retryResult.telemetry.unknownConcepts);
          accumulateMedicalReviewFailureCategories(totalMrFailureCategories, retryResult.telemetry.medicalReviewFailureCategories);
          const newDeduped     = dedup(retryResult.questions).filter(q =>
            inScope(q, scope) && !existingConcepts.has(norm(q.testedConcept))
          );
          totalDedupRejected  += retryResult.questions.length - newDeduped.length;
          allQuestions.push(...newDeduped);
        } catch (retryErr) {
          console.warn('[generate-questions] retry failed:', (retryErr as Error).message);
        }
      }
    }

    // ── Quarantine filter — fail-closed: if the check throws, do not serve or save generated content ──
    let quarantineRejected = 0;
    try {
      const quarantinedFps = await getRepositories().questionReports.getQuarantinedFingerprints();
      if (quarantinedFps.size > 0) {
        allQuestions = allQuestions.filter(q => {
          const fp = computeQuestionFingerprint(q.stem || '', q.testedConcept || '');
          if (quarantinedFps.has(fp)) {
            quarantineRejected++;
            console.warn(`[quarantine] filtered "${q.testedConcept}"`);
            return false;
          }
          return true;
        });
      }
    } catch (qErr) {
      console.warn('[generate-questions] quarantine check failed closed:', (qErr as Error).message);
      res.status(503).json({
        error: 'Question safety check temporarily unavailable',
        code: 'QUARANTINE_CHECK_UNAVAILABLE',
      });
      return;
    }

    // Use the full AI buffer so +2 buffer questions can fill bank-collision gaps.
    // Save the full AI output (idempotent upsert) — unused buffer questions enter the bank for future requests.
    const combined           = dedup([...bankPool, ...allQuestions]).slice(0, targetCount);
    const questions          = combined;
    // Compute reuse counts before save (save does not mutate question objects)
    const bankContrib = Math.min(bankPool.length, combined.length);
    const approvedReuseCount = combined.slice(0, bankContrib).filter(q => String(q.bankStatus) === 'approved').length;
    const liveGeneratedCount = combined.length - bankContrib;
    if (bankPool.length > 0) {
      const returnedBankFingerprints = questions
        .filter(q => bankPool.some(bankQ => computeQuestionFingerprint(bankQ.stem || '', bankQ.testedConcept || '') === computeQuestionFingerprint(q.stem || '', q.testedConcept || '')))
        .map(q => computeQuestionFingerprint(q.stem || '', q.testedConcept || ''));
      await getRepositories().questions.markUsedByExternalIds(returnedBankFingerprints).catch(() => {});
    }
    const generatedBankSaved = await _saveGeneratedQuestionsToBank(allQuestions, config).catch(() => 0);
    const [taxonomyCandidatesCaptured, conceptCandidatesCaptured] = generatedBankSaved > 0
      ? await Promise.all([
          captureUnknownTopicCandidates({
            topicIntake,
            unknownTopics: totalUnknownTopics,
            questions: allQuestions,
            config,
          }).catch(err => {
            console.warn('[generate-questions] taxonomy candidate capture skipped:', (err as Error).message);
            return 0;
          }),
          captureUnknownConceptCandidates({
            unknownConcepts: totalUnknownConcepts,
            questions: allQuestions,
            config,
          }).catch(err => {
            console.warn('[generate-questions] concept candidate capture skipped:', (err as Error).message);
            return 0;
          }),
        ])
      : [0, 0];

    const telemetry = {
      // Backward-compatible existing fields
      requested:              targetCount,
      generated:              totalGenerated,
      available:              allQuestions.length,
      returning:              questions.length,
      duplicateRejects:       totalDedupRejected,
      mode:                   config.mode,
      difficulty:             config.difficulty || 'Balanced',
      medicalReviewRequested: totalMrRequested,
      medicalReviewPassed:    totalMrPassed,
      medicalReviewRejected:  totalMrRejected,
      medicalReviewSkipped:   totalMrSkipped,
      // New additive telemetry (hard-mode only fields are undefined for Balanced)
      refillRounds,
      totalGeneratedCandidates:      totalGenerated,
      acceptedCandidates:            allQuestions.length,
      ruleRejectedCandidates:        totalRuleRejected,
      dedupRejectedCandidates:       totalDedupRejected,
      scopeRejectedCandidates:       totalScopeRejected,
      quarantineRejectedCandidates:  quarantineRejected,
      matrixPasses:                  totalMatrixPasses,
      matrixWarnings:                totalMatrixWarnings,
      matrixFailures:                totalMatrixFailures,
      topicPasses:                   totalTopicPasses,
      topicWarnings:                 totalTopicWarnings,
      topicFailures:                 totalTopicFailures,
      unknownTopics:                 totalUnknownTopics,
      taxonomyCandidatesCaptured,
      conceptCandidatesCaptured,
      conceptPasses:                 totalConceptPasses,
      conceptWarnings:               totalConceptWarnings,
      conceptFailures:               totalConceptFailures,
      unknownConcepts:               totalUnknownConcepts,
      generatedBankSaved,
      bankPoolUsed: bankPool.length,
      stoppedReason,
      medicalReviewFailureCategories: totalMrFailureCategories,
      reusePolicy: approvedOnly ? 'approved-only' : 'approved-first',
      approvedOnly,
      validatedFallbackAllowed: !approvedOnly,
      approvedReuseCount,
      liveGeneratedCount,
      validatedQueueCount,
      approvedOnlyMode: approvedOnly,
    };
    console.log('[generate-questions]', JSON.stringify(telemetry));

    if (questions.length === 0) {
      res.status(500).json({ error: 'AI generated no valid questions', code: 'EMPTY_RESULT' });
      return;
    }

    res.json({
      questions,
      source: bankPool.length > 0 ? 'hybrid' : 'ai',
      count:              questions.length,
      telemetry,
      generationStrategy: adaptiveBlueprint ? 'adaptive' : 'random',
      adaptiveConcepts:   adaptiveBlueprint ? adaptiveBlueprint.targetConcepts : [],
    });
  } catch (err) {
    if (err instanceof TaxonomyConfigError) {
      res.status(400).json({
        error: err.message,
        code: 'INVALID_TAXONOMY',
        field: err.field,
      });
      return;
    }
    const msg      = err instanceof Error ? err.message : String(err);
    const errName  = err instanceof Error ? err.constructor.name : typeof err;
    const errStatus = (err as any)?.status;
    // Safe: logs error class + HTTP status, never the API key or full payload.
    console.error('[generate-questions] error', errName, errStatus != null ? `status=${errStatus}` : '(no HTTP status)', '|', msg.slice(0, 200));
    res.status(500).json({ error: 'Question generation failed', code: 'GENERATION_FAILED' });
  }
});

// ─── POST /api/generate-flashcards ───────────────────────────────────────────
// NOTE: This endpoint has no frontend caller as of Phase 3.3.
// It is backend-complete; wiring a UI call site is a separate step.

const FC_GEN_SYSTEM = `You are an elite USMLE Step 1 flashcard writer for MEDICA Medical Education Centre.

Output ONLY a valid JSON object — no markdown fences, no commentary, no text before or after. Raw JSON only.

CRITICAL JSON SAFETY RULES:
- Never use double quotes ( " ) inside any string value. Use single quotes or rephrase.
- Never include raw newlines inside string values. One continuous line per string.
- No trailing commas after the last item in any array or object.

Each flashcard must be self-contained — answerable without any external context.
Front: clear clinical question, max 16 words.
Back: precise mechanism or fact, max 15 words.

Schema:
{
  "flashcards": [
    {
      "concept": "Specific concept name",
      "type": "Recall",
      "front": "What is the mechanism of ACE inhibitor cough?",
      "back": "Bradykinin accumulation from inhibited ACE-mediated degradation.",
      "subject": "Pharmacology",
      "system": "Cardiovascular",
      "tag": "Recall",
      "pearl": "Switching to ARBs resolves cough — ARBs do not affect bradykinin.",
      "memoryAnchor": "ACE = Accumulates Cough-inducing bradyKinin"
    }
  ]
}

type must be exactly one of: "Recall", "Pearl", "Trap", "Mnemonic".
pearl and memoryAnchor are optional — omit when not applicable.
Generate exactly the number of flashcards requested.`;

const VALID_FC_TYPES = new Set(['Recall', 'Pearl', 'Trap', 'Mnemonic']);

function normalizeFlashcard(raw: Record<string, any>, now: string): Record<string, any> | null {
  const front = String(raw.front || '').trim();
  const back  = String(raw.back  || '').trim();
  if (!front || !back) return null;

  const type = VALID_FC_TYPES.has(raw.type) ? raw.type : 'Recall';
  const id   = `fc_adaptive_${randomUUID()}_${type.toLowerCase()}`;

  return {
    id,
    front,
    back,
    clinicalPrompt:   front,
    coreMechanism:    back,
    tag:              type,
    concept:          String(raw.concept || '').trim(),
    testedConcept:    String(raw.concept || '').trim(),
    subject:          String(raw.subject || '').trim(),
    system:           String(raw.system  || '').trim(),
    pearl:            String(raw.pearl   || '').trim() || null,
    memoryAnchor:     String(raw.memoryAnchor || '').trim() || null,
    sourceQuestionId: `adaptive_${randomUUID()}`,
    sourceMode:       'adaptive' as const,
    reinforcementPriority: 'high' as const,
    reviewStatus:     'new' as const,
    reviewCount:      0,
    createdAt:        now,
  };
}

router.post('/generate-flashcards', optionalAuth, aiLimiter, validate(generateFlashcardsSchema), async (req: AuthRequest, res: Response) => {
  const { config: rawConfig } = req.body ?? {};
  const count = Math.min(Math.max(Number(rawConfig?.count ?? 10), 1), 30);

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI generation unavailable — API key not configured', code: 'NO_API_KEY' });
    return;
  }

  try {
    // Build adaptive plan when user is authenticated
    let plan: AdaptiveFlashcardPlan | null = null;
    if (req.userId) {
      try {
        const { userConceptMastery, concepts } = getRepositories();
        const bp = await new AdaptiveFlashcardService(userConceptMastery, concepts)
          .buildAdaptiveFlashcardPlan(req.userId);
        if (bp.enabled) plan = bp;
      } catch (err) {
        console.warn('[generate-flashcards] adaptive plan skipped:', (err as Error).message);
      }
    }

    // Build prompt
    const lines: string[] = [`Generate exactly ${count} USMLE Step 1 clinical reinforcement flashcards.`];
    if (rawConfig?.subject && rawConfig.subject !== 'All Subjects') lines.push(`Subject: ${rawConfig.subject}`);
    if (rawConfig?.system  && rawConfig.system  !== 'All Systems')  lines.push(`Organ System: ${rawConfig.system}`);
    if (plan?.promptFocusText) lines.push('', plan.promptFocusText);
    lines.push('', `Generate exactly ${count} flashcards. Output valid JSON only.`);
    const prompt = lines.join('\n');

    const response = await callWithRetry({
      model:      process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(count * 300, 4096),
      system:     FC_GEN_SYSTEM,
      messages:   [{ role: 'user', content: prompt }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as Anthropic.TextBlock).text)
      .join('');

    let s = text.trim().replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '').trim();
    const start = s.indexOf('{'), end = s.lastIndexOf('}');
    if (start === -1 || end <= start) {
      res.status(500).json({ error: 'AI returned invalid JSON', code: 'PARSE_ERROR' });
      return;
    }
    const parsed = JSON.parse(s.slice(start, end + 1));
    if (!Array.isArray(parsed.flashcards)) {
      res.status(500).json({ error: 'AI response missing flashcards array', code: 'EMPTY_RESULT' });
      return;
    }

    const now = new Date().toISOString();
    const flashcards = parsed.flashcards
      .map((raw: Record<string, any>) => normalizeFlashcard(raw, now))
      .filter((fc: Record<string, any> | null): fc is Record<string, any> => fc !== null)
      .slice(0, count);

    if (flashcards.length === 0) {
      res.status(500).json({ error: 'AI generated no valid flashcards', code: 'EMPTY_RESULT' });
      return;
    }

    console.log(`[generate-flashcards] strategy=${plan ? 'adaptive' : 'random'} requested=${count} returned=${flashcards.length}`);

    res.json({
      flashcards,
      count:             flashcards.length,
      flashcardStrategy: plan ? 'adaptive' : 'random',
      adaptiveConcepts:  plan ? plan.targetConcepts : [],
    });
  } catch (err) {
    console.error('[generate-flashcards]', err instanceof Error ? err.message : String(err));
    res.status(500).json({ error: 'Flashcard generation failed', code: 'GENERATION_FAILED' });
  }
});

export default router;
