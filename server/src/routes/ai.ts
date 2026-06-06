import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { AdaptiveExamService } from '../services/AdaptiveExamService.js';
import { AdaptiveFlashcardService } from '../services/AdaptiveFlashcardService.js';
import { optionalAuth } from '../middleware/optionalAuth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { aiLimiter } from '../middleware/rateLimiter.js';
import { getRepositories } from '../repositories/index.js';
import type { AdaptiveBlueprint, AdaptiveFlashcardPlan } from '../types/index.js';
import {
  generateQuestionsSchema,
  generatedQuestionBankQuerySchema,
  generateFlashcardsSchema,
  explainSchema,
  skillsGenerateSchema,
} from '../schemas/ai.js';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  scoreQuestion, buildRepairPrompt, isSuspectStem,
  requiresMedicalReview, buildMedicalReviewPrompt, parseMedicalReviewResponse,
  scoreScopeAlignment,
  type QuestionQuality, type ReviewableQuestion, type MedicalReviewResult,
} from '../lib/questionValidator.js';

const router = Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

router.post('/generate', aiLimiter, validate(skillsGenerateSchema), async (req: Request, res: Response) => {
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

router.post('/explain', aiLimiter, validate(explainSchema), async (req: Request, res: Response) => {
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
  return EMPTY.has(String(v).toLowerCase().trim());
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
      "subject": "Cardiology",
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

  return {
    id: `q${index + 1}`,
    subject: q.subject || '',
    system: q.system || '',
    topic: q.topic || scope.topic || '',
    rawTopic: q.rawTopic || scopeRaw,
    canonicalTopic: q.canonicalTopic || scope.canonicalTopic || scopeRaw,
    topicSlug:   q.topicSlug   || scope.topicSlug   || '',
    topicSource: q.topicSource || scope.topicSource || '',
    questionAngle:    String(q.questionAngle    || '').trim(),
    usmleContentArea: String(q.usmleContentArea || '').trim(),
    usmleSubdomain:   String(q.usmleSubdomain   || '').trim(),
    physicianTask:    String(q.physicianTask     || '').trim(),
    difficulty: q.difficulty || '',
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

export interface BatchTelemetry {
  medicalReviewRequested: number;
  medicalReviewPassed:    number;
  medicalReviewRejected:  number;
  medicalReviewSkipped:   number;
  ruleRejected:           number;
  scopeRejected:          number;  // hard-rejected for NBME/UWorld scope mismatch before medical review
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
    return { questions: [], telemetry: { medicalReviewRequested: 0, medicalReviewPassed: 0, medicalReviewRejected: 0, medicalReviewSkipped: 0, ruleRejected: 0, scopeRejected: 0, medicalReviewFailureCategories: emptyMedicalReviewFailureCategories() } };
  }
  if (!Array.isArray(parsed.questions)) {
    console.warn('[generateBatch] AI response missing questions array');
    return { questions: [], telemetry: { medicalReviewRequested: 0, medicalReviewPassed: 0, medicalReviewRejected: 0, medicalReviewSkipped: 0, ruleRejected: 0, scopeRejected: 0, medicalReviewFailureCategories: emptyMedicalReviewFailureCategories() } };
  }

  const rawQuestions: Record<string, any>[] = parsed.questions as Record<string, any>[];
  const normalized = rawQuestions.map((q, i) => normalizeQuestion(q, offset + i, scope));

  const results: Array<Record<string, any>> = [];
  let passCount = 0, repairCount = 0, rejectCount = 0;

  const difficulty  = config.difficulty || 'Balanced';
  const needsReview = requiresMedicalReview(difficulty);
  let mrRequested = 0, mrPassed = 0, mrRejected = 0, mrSkipped = 0;
  const mrFailureCategories = emptyMedicalReviewFailureCategories();

  // ── Phase 1: split rule-based passers from failers ────────────────────────────
  type ScoredItem = { q: ReturnType<typeof normalizeQuestion>; rawQ: Record<string, any>; quality: QuestionQuality; idx: number };
  const passers: ScoredItem[] = [];
  const failers: ScoredItem[] = [];

  // Universal scope rejection: applies to every difficulty whenever the user
  // requested a specific subject, system, or topic.  Broad values ('', 'All Systems',
  // 'Multisystem', etc.) are already normalised to '' by resolveScope, so the check
  // is a no-op for global/mixed generation.  Scope-rejected questions exit via
  // continue — they never reach callMedicalReview.
  const requestedScopeForCheck =
    scope.subject || scope.system || scope.topic
      ? { subject: scope.subject, system: scope.system, topic: scope.topic }
      : undefined;
  let scopeRejected = 0;

  for (let i = 0; i < normalized.length; i++) {
    if (requestedScopeForCheck) {
      const scopeReasons = scoreScopeAlignment(normalized[i], requestedScopeForCheck);
      if (scopeReasons.length > 0) {
        scopeRejected++;
        rejectCount++;
        console.warn(`[scope] rejected "${normalized[i].testedConcept}" | ${difficulty} | ${scopeReasons.join(', ')}`);
        continue;
      }
    }

    const quality = scoreQuestion(normalized[i], config.mode, difficulty);
    (quality.validationStatus === 'pass' ? passers : failers).push({ q: normalized[i], rawQ: rawQuestions[i], quality, idx: i });
  }

  // ── Phase 2: medical reviews run in parallel for all rule-based passers ───────
  // Running them concurrently cuts per-batch review time from (N × 15s) to ~15s,
  // which directly reduces the window for transient ECONNRESET failures.
  if (needsReview) {
    mrRequested += passers.length;
    const reviewResults = await Promise.all(passers.map(({ q }) => callMedicalReview(q as ReviewableQuestion, difficulty)));
    for (let i = 0; i < passers.length; i++) {
      const { q, rawQ, quality } = passers[i];
      const { pass, failedCategories } = reviewResults[i];
      if (pass) {
        results.push({ ...q, ...quality, id: randomUUID() });
        passCount++;
        mrPassed++;
      } else {
        rejectCount++;
        mrRejected++;
        for (const cat of failedCategories) mrFailureCategories[cat]++;
        const failLabel = failedCategories.length ? failedCategories.join(',') : 'unclassified';
        console.warn(`[medical-review] rejected: ${q.testedConcept} | ${difficulty} | failed=${failLabel}`);
      }
      if (isSuspectStem(q.stem)) {
        console.warn('[stem-guard]', JSON.stringify({ rawKeys: Object.keys(rawQ), normalizedStem: q.stem, disposition: pass ? 'pass' : 'medical-review-failed' }));
      }
    }
  } else {
    mrSkipped += passers.length;
    for (const { q, rawQ, quality } of passers) {
      results.push({ ...q, ...quality, id: randomUUID() });
      passCount++;
      if (isSuspectStem(q.stem)) {
        console.warn('[stem-guard]', JSON.stringify({ rawKeys: Object.keys(rawQ), normalizedStem: q.stem, disposition: 'pass' }));
      }
    }
  }

  // ── Phase 3: repair-and-review failers sequentially (uncommon path) ───────────
  for (const { q, rawQ, quality, idx } of failers) {
    let disposition: string;
    let repairedStem: string | null = null;
    const repairedRaw = await attemptRepair(q, quality);
    if (repairedRaw) {
      const repairedNorm    = normalizeQuestion(repairedRaw, offset + idx, scope);
      repairedStem = repairedNorm.stem;
      const repairedQuality = scoreQuestion(repairedNorm, config.mode, difficulty);
      if (repairedQuality.validationStatus === 'pass') {
        if (needsReview) {
          mrRequested++;
          const { pass: reviewPass, failedCategories: repairFailedCats } = await callMedicalReview(repairedNorm as ReviewableQuestion, difficulty);
          if (reviewPass) {
            results.push({ ...repairedNorm, ...repairedQuality, validationStatus: 'repaired', id: randomUUID() });
            repairCount++;
            mrPassed++;
            disposition = 'repair-passed';
          } else {
            rejectCount++;
            mrRejected++;
            for (const cat of repairFailedCats) mrFailureCategories[cat]++;
            const failLabel = repairFailedCats.length ? repairFailedCats.join(',') : 'unclassified';
            console.warn(`[medical-review] repaired question rejected: ${repairedNorm.testedConcept} | ${difficulty} | failed=${failLabel}`);
            disposition = 'repair-medical-review-failed';
          }
        } else {
          mrSkipped++;
          results.push({ ...repairedNorm, ...repairedQuality, validationStatus: 'repaired', id: randomUUID() });
          repairCount++;
          disposition = 'repair-passed';
        }
      } else {
        rejectCount++;
        console.warn('[quality] repair failed — rejecting:', repairedQuality.rejectionReasons);
        disposition = 'repair-failed';
      }
    } else {
      rejectCount++;
      console.warn('[quality] rejected (no actionable repair):', quality.rejectionReasons, '| score:', quality.qualityScore);
      disposition = 'rejected';
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
      totalMrRequested  += batchResult.telemetry.medicalReviewRequested;
      totalMrPassed     += batchResult.telemetry.medicalReviewPassed;
      totalMrRejected   += batchResult.telemetry.medicalReviewRejected;
      totalMrSkipped    += batchResult.telemetry.medicalReviewSkipped;
      totalRuleRejected  += batchResult.telemetry.ruleRejected;
      totalScopeRejected += batchResult.telemetry.scopeRejected;
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
  return {
    ...question,
    id: fingerprint,
    source: 'ai',
    bankStatus: 'validated_generated',
    promotionStatus: 'candidate',
    fingerprint,
    mode: config.mode || '',
    difficulty: question.difficulty || config.difficulty || 'Balanced',
    validationStatus: quality.validationStatus,
    validationScore: quality.qualityScore,
    validationVersion: 'server-question-validator-v1',
    generatedAt: now,
    validatedAt: now,
    usageCount: 0,
    reportCount: 0,
  };
}

function _validatePromotableQuestion(rawQuestion: Record<string, any>, config: Record<string, any>) {
  const scope = resolveScope(config);
  const question = normalizeQuestion(rawQuestion, 0, scope);
  const quality = scoreQuestion(question, config.mode || 'practice', config.difficulty || 'Balanced');
  const fingerprint = computeQuestionFingerprint(question.stem || '', question.testedConcept || '');
  question.id = String(rawQuestion.id || fingerprint);
  const validFingerprint = Boolean(fingerprint && fingerprint !== '||');
  const valid = quality.validationStatus === 'pass' && validFingerprint;
  return { valid, question, quality, fingerprint };
}

async function _saveGeneratedQuestionsToBank(questions: Record<string, any>[], config: Record<string, any>): Promise<number> {
  const repo = getRepositories().questions;
  let saved = 0;
  for (const rawQuestion of questions) {
    const { valid, question, quality, fingerprint } = _validatePromotableQuestion(rawQuestion, config);
    if (!valid) continue;
    const body = _questionBodyForGeneratedBank(question, config, fingerprint, quality);
    await repo.upsertByExternalId(fingerprint, {
      subject: String(body.subject || ''),
      system:  String(body.system || ''),
      body,
    });
    saved++;
  }
  return saved;
}

async function _getReusableGeneratedBankQuestions(config: Record<string, any>, targetCount: number): Promise<Record<string, any>[]> {
  const repo = getRepositories().questions;
  const scope = resolveScope(config);
  const rawBank = await repo.findGeneratedBankQuestions({
    subject:    config.subject,
    system:     config.system,
    difficulty: config.difficulty || 'Balanced',
    mode:       config.mode,
    limit:      Math.min(targetCount * 3, 200),
  });

  // Scope filter runs on the raw stored body BEFORE normalizeQuestion is called,
  // because normalizeQuestion fills empty canonicalTopic/rawTopic from the request
  // scope — which would cause off-topic questions to falsely pass inScope.
  const scopeFiltered = isSpecific(scope) ? rawBank.filter(q => inScope(q as Record<string, any>, scope)) : rawBank;

  const valid = scopeFiltered
    .map(q => _validatePromotableQuestion(q as Record<string, any>, config))
    .filter(result => result.valid)
    .map(result => result.question as Record<string, any>);

  try {
    const quarantinedFps = await getRepositories().questionReports.getQuarantinedFingerprints();
    if (quarantinedFps.size === 0) return valid;
    return valid.filter(q => !quarantinedFps.has(computeQuestionFingerprint(q.stem || '', q.testedConcept || '')));
  } catch {
    return valid;
  }
}

router.get('/generated-question-bank', optionalAuth, async (req: Request, res: Response) => {
  const parsed = generatedQuestionBankQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const questions = await getRepositories().questions.findGeneratedBankQuestions(parsed.data);
    res.json({ questions, count: questions.length, source: 'generated-bank' });
  } catch (err) {
    console.error('[generated-question-bank] list failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Generated question bank lookup failed' });
  }
});

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
    const targetCount = Math.min(Math.max(Number(config.questionCount) || 5, 1), 40);
    const scope = resolveScope(config);
    const specific = isSpecific(scope);

    // Reject suspect topic text before it reaches the prompt.
    if (specific && isTopicSuspect(scope.scopeText)) {
      res.status(400).json({ error: 'Invalid topic — contains disallowed content', code: 'INVALID_TOPIC' });
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
    const generatedBankQuestions = await _getReusableGeneratedBankQuestions(config, targetCount);
    if (!adaptiveBlueprint && generatedBankQuestions.length >= targetCount) {
      const questions = generatedBankQuestions.slice(0, targetCount);
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
        stoppedReason:          'generated_bank_covered_request',
        medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
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

    if (!process.env.ANTHROPIC_API_KEY) {
      res.status(503).json({ error: 'AI generation unavailable — API key not configured', code: 'NO_API_KEY' });
      return;
    }

    let allQuestions: Record<string, any>[] = [];
    let totalGenerated = 0;
    let totalMrRequested = 0, totalMrPassed = 0, totalMrRejected = 0, totalMrSkipped = 0;
    let totalRuleRejected = 0, totalDedupRejected = 0, totalScopeRejected = 0;
    let refillRounds: number | undefined;
    let stoppedReason: StoppedReason | undefined;
    const totalMrFailureCategories = emptyMedicalReviewFailureCategories();

    if (hardModeCaps) {
      // Hard-mode adaptive refill: keeps generating rounds until target reached or cap hit.
      const loopResult = await runAdaptiveRefill(
        targetCount,
        hardModeCaps,
        (count, offset) => generateBatch(config, count, offset, scope),
        (qs, existingConcepts) =>
          dedup(qs).filter(q =>
            (!specific || inScope(q, scope)) &&
            !existingConcepts.has(norm(q.testedConcept ?? '')),
          ),
      );
      allQuestions       = loopResult.accepted;
      totalGenerated     = loopResult.totalGenerated;
      totalMrRequested   = loopResult.totalMrRequested;
      totalMrPassed      = loopResult.totalMrPassed;
      totalMrRejected    = loopResult.totalMrRejected;
      totalMrSkipped     = loopResult.totalMrSkipped;
      totalRuleRejected  = loopResult.totalRuleRejected;
      totalDedupRejected = loopResult.totalDedupRejected;
      totalScopeRejected = loopResult.totalScopeRejected;
      refillRounds       = loopResult.refillRounds;
      stoppedReason      = loopResult.stoppedReason;
      accumulateMedicalReviewFailureCategories(totalMrFailureCategories, loopResult.medicalReviewFailureCategories);
    } else {
      // Balanced and other modes: existing fast path — no adaptive refill, no medical review.
      const bufferedCount = Math.min(Math.ceil(targetCount * 1.5), 40);
      let offset = 0;
      while (offset < bufferedCount) {
        const batchSize   = Math.min(GENERATE_BATCH_SIZE, bufferedCount - offset);
        const batchResult = await generateBatch(config, batchSize, offset, scope);
        totalGenerated    += batchSize;
        allQuestions.push(...batchResult.questions);
        totalMrRequested  += batchResult.telemetry.medicalReviewRequested;
        totalMrPassed     += batchResult.telemetry.medicalReviewPassed;
        totalMrRejected   += batchResult.telemetry.medicalReviewRejected;
        totalMrSkipped    += batchResult.telemetry.medicalReviewSkipped;
        totalRuleRejected  += batchResult.telemetry.ruleRejected;
        totalScopeRejected += batchResult.telemetry.scopeRejected;
        accumulateMedicalReviewFailureCategories(totalMrFailureCategories, batchResult.telemetry.medicalReviewFailureCategories);
        offset            += batchSize;
      }

      const beforeDedup   = allQuestions.length;
      allQuestions        = dedup(allQuestions);
      totalDedupRejected  = beforeDedup - allQuestions.length;
      if (specific) allQuestions = allQuestions.filter(q => inScope(q, scope));

      if (allQuestions.length < targetCount) {
        const shortfall        = targetCount - allQuestions.length;
        const existingConcepts = new Set(allQuestions.map(q => norm(q.testedConcept)));
        try {
          const retryResult   = await generateBatch(config, shortfall + 3, allQuestions.length, scope);
          totalGenerated      += shortfall + 3;
          totalMrRequested    += retryResult.telemetry.medicalReviewRequested;
          totalMrPassed       += retryResult.telemetry.medicalReviewPassed;
          totalMrRejected     += retryResult.telemetry.medicalReviewRejected;
          totalMrSkipped      += retryResult.telemetry.medicalReviewSkipped;
          totalRuleRejected   += retryResult.telemetry.ruleRejected;
          totalScopeRejected  += retryResult.telemetry.scopeRejected;
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

    // ── Quarantine filter — fail-open: if the check throws, generation proceeds ──
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
      console.warn('[generate-questions] quarantine check skipped:', (qErr as Error).message);
    }

    const questions = allQuestions.slice(0, targetCount);
    const generatedBankSaved = await _saveGeneratedQuestionsToBank(questions, config);

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
      generatedBankSaved,
      stoppedReason,
      medicalReviewFailureCategories: totalMrFailureCategories,
    };
    console.log('[generate-questions]', JSON.stringify(telemetry));

    if (questions.length === 0) {
      res.status(500).json({ error: 'AI generated no valid questions', code: 'EMPTY_RESULT' });
      return;
    }

    res.json({
      questions,
      source: 'ai',
      count:              questions.length,
      telemetry,
      generationStrategy: adaptiveBlueprint ? 'adaptive' : 'random',
      adaptiveConcepts:   adaptiveBlueprint ? adaptiveBlueprint.targetConcepts : [],
    });
  } catch (err) {
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
