import { Router } from 'express';
import type { Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { scoreQuestion, buildRepairPrompt, isSuspectStem, type QuestionQuality } from '../lib/questionValidator.js';

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

router.post('/generate', async (req: Request, res: Response) => {
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
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
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

router.post('/explain', async (req: Request, res: Response) => {
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
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: msg })}\n\n`);
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

async function callWithRetry(params: Anthropic.MessageCreateParamsNonStreaming) {
  try {
    return await client.messages.create(params);
  } catch (err: any) {
    if (err?.status === 429) {
      await new Promise(r => setTimeout(r, 8000));
      return await client.messages.create(params);
    }
    throw err;
  }
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

function resolveScope(config: Record<string, any>) {
  const cf  = String(config.clinicalFocus      || '').trim();
  const cst = String(config.coachSpecificTopic || '').trim();
  const rt  = String(config.rawTopic           || '').trim();
  const t   = String(config.topic              || '').trim();
  const sys = String(config.system             || '').trim();
  const sub = String(config.subject            || '').trim();

  const base = {
    subject: isEmpty(sub) ? '' : sub,
    system:  isEmpty(sys) ? '' : sys,
    rawTopic: rt || t,
    canonicalTopic: String(config.canonicalTopic || '').trim() || t,
    topicSlug:   String(config.topicSlug   || '').trim(),
    topicSource: String(config.topicSource || '').trim(),
  };

  if (cf)  return { ...base, scopeType: 'clinicalFocus',      scopeText: cf,  topic: cf  };
  if (cst) return { ...base, scopeType: 'coachSpecificTopic', scopeText: cst, topic: cst };
  if (rt)  return { ...base, scopeType: 'manualTopic',        scopeText: rt,  topic: rt  };
  if (t)   return { ...base, scopeType: 'selectedTopic',      scopeText: t,   topic: t   };
  if (sys && !isEmpty(sys)) return { ...base, scopeType: 'system',  scopeText: sys, topic: '' };
  if (sub && !isEmpty(sub)) return { ...base, scopeType: 'subject', scopeText: sub, topic: '' };
  return { ...base, scopeType: 'global', scopeText: 'Mixed USMLE Step 1', topic: '' };
}

const SPECIFIC_SCOPES = new Set(['clinicalFocus', 'coachSpecificTopic', 'manualTopic', 'selectedTopic']);

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

// ── Question generation ──────────────────────────────────────────────────────

const QUIZ_GEN_SYSTEM = `You are an elite USMLE Step 1 question writer and tutor for MEDICA Medical Education Centre.

Output ONLY a valid JSON object — no markdown fences, no commentary, no text before or after. Raw JSON only.

CRITICAL JSON SAFETY RULES:
- Never use double quotes ( " ) inside any string value. Use single quotes or rephrase instead.
- Never include raw newlines inside string values. Keep every string on one line.
- No trailing commas after the last item in any array or object.

EXAM MODE: output subject, system, testedConcept, weakSpotCategory, stem, options (A-D), correct. No explanations. No id field.
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
Generate exactly the number of questions requested. Each must have a unique testedConcept.`;

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
    if (config.mode === 'coach' && config.coachSpecificTopic) {
      lines.push(`Coach Mode Specific Topic: ${config.coachSpecificTopic}`);
    }
  }

  lines.push(`Number of questions: ${count}`);
  lines.push(`Difficulty: ${config.difficulty || 'Mixed'}`);

  if (specific) {
    lines.push('', 'SCOPE REQUIREMENTS:');
    lines.push(`- Every question must directly test "${scope.scopeText}"`);
    lines.push('- Each question must cover a different testedConcept and a different questionAngle');
    lines.push('- questionAngle: mechanism, diagnosis, treatment, complication, pharmacology, pathophysiology, adverse-effect, lab-interpretation');
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

  let correct: string = q.correct ?? q.correctAnswer ?? 'A';
  if (typeof correct === 'number') correct = VALID_LETTERS[correct] ?? 'A';
  if (typeof correct === 'string') correct = correct.trim().toUpperCase().charAt(0);
  if (!VALID_LETTERS.includes(correct)) correct = 'A';

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
    questionAngle: String(q.questionAngle || '').trim(),
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
  config: Record<string, any>,
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

async function generateBatch(config: Record<string, any>, count: number, offset: number, scope: ReturnType<typeof resolveScope>) {
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

  const parsed = JSON.parse(s);
  if (!Array.isArray(parsed.questions)) throw new Error('AI response missing questions array');

  const rawQuestions: Record<string, any>[] = parsed.questions;
  const normalized = rawQuestions.map(
    (q, i) => normalizeQuestion(q, offset + i, scope),
  );

  const results: Array<Record<string, any>> = [];
  let passCount = 0, repairCount = 0, rejectCount = 0;

  for (let i = 0; i < normalized.length; i++) {
    const q = normalized[i];
    const rawQ = rawQuestions[i];
    const quality = scoreQuestion(q, config.mode, config.difficulty || 'Balanced');

    let disposition: string;

    if (quality.validationStatus === 'pass') {
      results.push({ ...q, ...quality, id: randomUUID() });
      passCount++;
      disposition = 'pass';
    } else {
      const repairedRaw = await attemptRepair(q, quality, config);
      if (repairedRaw) {
        const repairedNorm = normalizeQuestion(repairedRaw, offset + i, scope);
        const repairedQuality = scoreQuestion(repairedNorm, config.mode, config.difficulty || 'Balanced');
        if (repairedQuality.validationStatus === 'pass') {
          results.push({ ...repairedNorm, ...repairedQuality, validationStatus: 'repaired', id: randomUUID() });
          repairCount++;
          disposition = 'repair-passed';
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
    }

    if (isSuspectStem(q.stem)) {
      console.warn('[stem-guard]', JSON.stringify({
        rawKeys:       Object.keys(rawQ),
        raw:           rawQ,
        normalizedStem: q.stem,
        disposition,
      }));
    }
  }
  console.log(`[quality] batch result: ${normalized.length} generated → ${passCount} pass, ${repairCount} repaired, ${rejectCount} rejected`);
  return results;
}

router.post('/generate-questions', async (req: Request, res: Response) => {
  const { config: rawConfig } = req.body ?? {};

  if (!rawConfig?.mode || !rawConfig?.questionCount) {
    res.status(400).json({ error: 'Missing required config fields: mode, questionCount', code: 'INVALID_CONFIG' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'AI generation unavailable — API key not configured', code: 'NO_API_KEY' });
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
        coachSpecificTopic: '',
        difficulty: 'Balanced',
      };
    }
    const targetCount = Math.min(Math.max(Number(config.questionCount) || 5, 1), 40);
    const scope = resolveScope(config);
    const specific = isSpecific(scope);
    const bufferedCount = Math.min(Math.ceil(targetCount * 1.5), 40);

    let allQuestions: Record<string, any>[] = [];
    let offset = 0;
    let totalGenerated = 0;

    while (offset < bufferedCount) {
      const batchSize = Math.min(GENERATE_BATCH_SIZE, bufferedCount - offset);
      const batch = await generateBatch(config, batchSize, offset, scope);
      totalGenerated += batchSize;
      allQuestions.push(...batch);
      offset += batchSize;
    }

    const beforeDedup = allQuestions.length;
    allQuestions = dedup(allQuestions);
    const duplicateRejects = beforeDedup - allQuestions.length;
    if (specific) allQuestions = allQuestions.filter(q => inScope(q, scope));

    if (allQuestions.length < targetCount) {
      const shortfall = targetCount - allQuestions.length;
      const existingConcepts = new Set(allQuestions.map(q => norm(q.testedConcept)));
      try {
        const retryBatch = await generateBatch(config, shortfall + 3, allQuestions.length, scope);
        totalGenerated += shortfall + 3;
        const newDeduped = dedup(retryBatch).filter(q =>
          inScope(q, scope) && !existingConcepts.has(norm(q.testedConcept))
        );
        allQuestions.push(...newDeduped);
      } catch (retryErr) {
        console.warn('[generate-questions] retry failed:', (retryErr as Error).message);
      }
    }

    const questions = allQuestions.slice(0, targetCount);

    const telemetry = {
      requested:       targetCount,
      generated:       totalGenerated,
      available:       allQuestions.length,
      returning:       questions.length,
      duplicateRejects,
      mode:            config.mode,
      difficulty:      config.difficulty || 'Balanced',
    };
    console.log('[generate-questions]', JSON.stringify(telemetry));

    if (questions.length === 0) {
      res.status(500).json({ error: 'AI generated no valid questions', code: 'EMPTY_RESULT' });
      return;
    }

    res.json({ questions, source: 'ai', count: questions.length, telemetry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[generate-questions]', msg);
    res.status(500).json({ error: msg || 'Question generation failed', code: 'GENERATION_FAILED' });
  }
});

export default router;
