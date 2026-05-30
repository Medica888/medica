const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
]);

app.use((req, res, next) => {
  const origin = req.headers.origin;

  console.log('origin', origin);

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Generation Scope Helpers (CJS inline port of generationScope.js) ────────

function _normServer(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

const EMPTY_SELECTIONS_SERVER = new Set([
  '', 'all', 'all subjects', 'all systems', 'all topics',
  'any', 'any subject', 'any system', 'any topic',
  'general', 'mixed',
  'select subject', 'select system', 'select topic',
])

function isEmptyServer(v) {
  if (v === null || v === undefined) return true
  return EMPTY_SELECTIONS_SERVER.has(String(v).toLowerCase().trim())
}

const GEN_SUBJECT_KEYWORDS_SERVER = [
  {
    keywords: [
      'ascending tract', 'descending tract', 'spinothalamic', 'corticospinal',
      'dorsal column', 'anterolateral', 'medial lemniscus', 'neuroanatomy',
      'spinal cord anatomy', 'brainstem anatomy', 'dermatome', 'myotome',
      'brachial plexus', 'lumbosacral plexus', 'nerve root', 'spinal nerve',
      'muscle origin', 'muscle insertion', 'ligament', 'bone anatomy',
      'foramen', 'fossa', 'sulcus', 'gyrus', 'lobe anatomy',
    ],
    subject: 'Anatomy',
  },
  {
    keywords: [
      'tca cycle', 'krebs cycle', 'citric acid cycle', 'glycolysis', 'gluconeogenesis',
      'oxidative phosphorylation', 'fatty acid synthesis', 'fatty acid oxidation',
      'amino acid metabolism', 'urea cycle', 'purine synthesis', 'pyrimidine synthesis',
      'cholesterol synthesis', 'galactosemia', 'phenylketonuria', 'alkaptonuria',
      'maple syrup urine', 'homocystinuria', 'enzyme deficiency', 'lysosomal storage',
      'glycogen storage', 'inborn error', 'metabolic pathway', 'acetyl coa', 'nadh', 'fadh2',
    ],
    subject: 'Biochemistry',
  },
  {
    keywords: [
      'pharmacokinetics', 'pharmacodynamics', 'drug mechanism', 'adverse effect',
      'drug interaction', 'receptor agonist', 'receptor antagonist', 'loop diuretic',
      'thiazide', 'beta blocker', 'ace inhibitor', 'arb', 'statin', 'antibiotic',
      'antifungal', 'antiviral', 'antineoplastic', 'chemotherapy drug', 'mechanism of action',
    ],
    subject: 'Pharmacology',
  },
  {
    keywords: [
      'action potential', 'cardiac output', 'preload', 'afterload', 'starling law',
      'glomerular filtration rate', 'tubular reabsorption', 'lung compliance', 'surfactant',
      'hormone regulation', 'negative feedback', 'osmoregulation', 'renal clearance',
    ],
    subject: 'Physiology',
  },
  {
    keywords: [
      'gram positive', 'gram negative', 'virulence factor', 'antimicrobial resistance',
      'biofilm', 'bacterial culture', 'spore forming', 'acid fast', 'capsule bacteria',
    ],
    subject: 'Microbiology',
  },
  {
    keywords: [
      'mhc class', 'major histocompatibility', 'immunoglobulin class switch',
      'b cell development', 't cell development', 'complement cascade', 'innate immunity',
      'adaptive immunity', 'hypersensitivity type', 'autoimmune pathogenesis',
    ],
    subject: 'Immunology',
  },
]

const GEN_SYSTEM_KEYWORDS_SERVER = [
  {
    keywords: [
      'tca cycle', 'krebs cycle', 'glycolysis', 'gluconeogenesis', 'fatty acid',
      'urea cycle', 'amino acid metabolism', 'metabolic pathway', 'enzyme deficiency',
      'lysosomal storage', 'glycogen storage', 'inborn error', 'acetyl coa',
      'cholesterol synthesis', 'oxidative phosphorylation',
    ],
    system: 'Multisystem',
  },
  {
    keywords: [
      'cardiac', 'heart failure', 'coronary artery', 'aortic', 'arrhythmia', 'ventricular',
      'atrial fibrillation', 'myocardial', 'pericardial', 'valvular', 'hypertension',
    ],
    system: 'Cardiovascular',
  },
  {
    keywords: [
      'kidney', 'renal', 'nephron', 'glomerular', 'tubular reabsorption', 'urinary',
      'acid base', 'loop of henle', 'collecting duct', 'nephritis', 'proteinuria',
      'loop diuretic', 'thiazide diuretic', 'diuretic', 'furosemide', 'bumetanide',
      'torsemide', 'electrolyte', 'hypokalemia', 'hyperkalemia',
    ],
    system: 'Renal / Urinary',
  },
  {
    keywords: [
      'neuron', 'spinal cord', 'cranial nerve', 'stroke', 'seizure', 'dementia',
      'parkinson', 'multiple sclerosis', 'encephalopathy', 'neuropathy', 'cerebellar',
      'ascending tract', 'descending tract', 'spinothalamic', 'corticospinal',
      'dorsal column', 'anterolateral', 'medial lemniscus', 'neuroanatomy',
      'brainstem', 'thalamus', 'basal ganglia', 'white matter tract',
      'upper motor neuron', 'lower motor neuron',
    ],
    system: 'Neurology',
  },
  {
    keywords: [
      'lung', 'respiratory', 'bronchial', 'alveolar', 'pulmonary', 'pneumonia',
      'copd', 'asthma', 'pleural effusion', 'surfactant production',
    ],
    system: 'Respiratory',
  },
  {
    keywords: [
      'liver', 'hepatic', 'bile duct', 'gastrointestinal', 'bowel', 'colon',
      'stomach', 'esophagus', 'ascites', 'portal hypertension', 'pancreas exocrine',
    ],
    system: 'Gastrointestinal',
  },
  {
    keywords: [
      'thyroid', 'adrenal', 'pituitary', 'insulin secretion', 'diabetes mellitus',
      'cortisol', 'aldosterone', 'growth hormone', 'parathyroid', 'calcium regulation',
    ],
    system: 'Endocrine',
  },
  {
    keywords: [
      'red blood cell', 'anemia', 'hemoglobin', 'platelet', 'coagulation cascade',
      'hemostasis', 'leukemia', 'lymphoma', 'bone marrow', 'sickle cell',
    ],
    system: 'Hematology',
  },
  {
    keywords: [
      'bacteria', 'virus', 'fungal infection', 'parasitic', 'sepsis',
      'meningitis', 'hiv', 'tuberculosis', 'antibiotic therapy', 'opportunistic',
    ],
    system: 'Infectious Disease',
  },
]

function _normInferServer(s) {
  return String(s || '').toLowerCase().trim()
}

function inferSubjectFromTopicServer(rawTopic) {
  if (!rawTopic) return ''
  const n = _normInferServer(rawTopic)
  for (const entry of GEN_SUBJECT_KEYWORDS_SERVER) {
    for (const kw of entry.keywords) {
      if (n.includes(_normInferServer(kw))) return entry.subject
    }
  }
  return ''
}

function inferSystemFromTopicServer(rawTopic, subject) {
  if (!rawTopic) return ''
  const n = _normInferServer(rawTopic)
  for (const entry of GEN_SYSTEM_KEYWORDS_SERVER) {
    for (const kw of entry.keywords) {
      if (n.includes(_normInferServer(kw))) return entry.system
    }
  }
  return ''
}

function normalizeGenerationConfigServer(config) {
  if (!config) return {}
  const subject  = isEmptyServer(config.subject) ? '' : (config.subject || '')
  const system   = isEmptyServer(config.system)  ? '' : (config.system  || '')
  const rawTopic = ((config.rawTopic || config.topic || '')).trim()

  let inferredSubject = subject
  let inferredSystem  = system

  if (rawTopic) {
    if (!inferredSubject) inferredSubject = inferSubjectFromTopicServer(rawTopic)
    if (!inferredSystem)  inferredSystem  = inferSystemFromTopicServer(rawTopic, inferredSubject)
  }

  return {
    ...config,
    subject: inferredSubject,
    system:  inferredSystem,
  }
}

function resolveGenerationScopeServer(config) {
  const cf  = String(config.clinicalFocus      || '').trim()
  const cst = String(config.coachSpecificTopic || '').trim()
  const rt  = String(config.rawTopic           || '').trim()
  const t   = String(config.topic              || '').trim()
  const sys = String(config.system             || '').trim()
  const sub = String(config.subject            || '').trim()
  const base = {
    subject:        isEmptyServer(sub) ? '' : sub,
    system:         isEmptyServer(sys) ? '' : sys,
    rawTopic:       rt || t,
    canonicalTopic: String(config.canonicalTopic || '').trim() || t,
    topicSlug:      String(config.topicSlug      || '').trim(),
    topicSource:    String(config.topicSource    || '').trim(),
  }
  if (cf)  return { ...base, scopeType: 'clinicalFocus',      scopeText: cf,  topic: cf  }
  if (cst) return { ...base, scopeType: 'coachSpecificTopic', scopeText: cst, topic: cst }
  if (rt)  return { ...base, scopeType: 'manualTopic',        scopeText: rt,  topic: rt  }
  if (t)   return { ...base, scopeType: 'selectedTopic',      scopeText: t,   topic: t   }
  if (sys && !isEmptyServer(sys)) return { ...base, scopeType: 'system',  scopeText: sys, topic: '' }
  if (sub && !isEmptyServer(sub)) return { ...base, scopeType: 'subject', scopeText: sub, topic: '' }
  return { ...base, scopeType: 'global', scopeText: 'Mixed USMLE Step 1', topic: '' }
}

function isSpecificScopeServer(scope) {
  return ['clinicalFocus', 'coachSpecificTopic', 'manualTopic', 'selectedTopic'].includes(scope && scope.scopeType)
}

function isQuestionInScopeServer(q, scope) {
  if (!isSpecificScopeServer(scope)) return true
  const needle = _normServer(scope.scopeText)
  const primary = [q.topic, q.testedConcept, q.canonicalTopic, q.rawTopic, q.weakSpotCategory]
    .map(f => _normServer(f || '')).filter(Boolean)
  const secondary = [q.system, q.subject].map(f => _normServer(f || '')).filter(Boolean)
  return (
    primary.some(f => f.includes(needle) || (f.length >= 5 && needle.includes(f))) ||
    secondary.some(f => f === needle || f.includes(needle))
  )
}

function detectDuplicateQuestionsServer(questions) {
  const seenConcepts = new Set()
  const seenStems    = new Set()
  const seenPearls   = new Set()
  const seenAngles   = new Set()
  const result       = []
  for (const q of questions) {
    const concept  = _normServer(q.testedConcept || '')
    const stem     = _normServer((q.stem || '').slice(0, 80))
    const pearl    = _normServer(q.pearl || q.highYieldPearl || '')
    const hasAngle = !!String(q.questionAngle || '').trim()
    const angleKey = hasAngle ? _normServer((q.topic || '') + '|' + q.questionAngle) : ''
    if (concept  && seenConcepts.has(concept))  continue
    if (stem     && seenStems.has(stem))         continue
    if (pearl && pearl.length > 15 && seenPearls.has(pearl)) continue
    if (hasAngle && seenAngles.has(angleKey))    continue
    if (concept)  seenConcepts.add(concept)
    if (stem)     seenStems.add(stem)
    if (pearl && pearl.length > 15) seenPearls.add(pearl)
    if (hasAngle) seenAngles.add(angleKey)
    result.push(q)
  }
  return result
}

// ─── SKILL LOADER ─────────────────────────────────────────────────────────────
// Skills are defined as markdown files in ./skills/
// Format: YAML frontmatter (id, name, category, emoji, description)
//         + "# Template" and "# System Prompt" H1 sections

function parseSkillFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  const fmEnd = content.indexOf('\n---\n', 4);
  if (!content.startsWith('---\n') || fmEnd === -1) return null;

  const fmText = content.slice(4, fmEnd);
  const body = '\n' + content.slice(fmEnd + 5);

  const meta = {};
  fmText.split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      meta[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  });

  const extractSection = (name) => {
    const marker = `\n# ${name}\n`;
    const start = body.indexOf(marker);
    if (start === -1) return '';
    const contentStart = start + marker.length;
    const nextSection = body.indexOf('\n# ', contentStart);
    const raw = nextSection === -1 ? body.slice(contentStart) : body.slice(contentStart, nextSection);
    return raw.trim();
  };

  return {
    id: meta.id,
    name: meta.name,
    category: meta.category,
    emoji: meta.emoji,
    mode: meta.mode || null,
    description: meta.description,
    template: extractSection('Template'),
    systemPrompt: extractSection('System Prompt')
  };
}

const SKILLS = fs.readdirSync(path.join(__dirname, 'skills'))
  .filter(f => f.endsWith('.md'))
  .sort()
  .map(f => parseSkillFile(path.join(__dirname, 'skills', f)))
  .filter(Boolean);

// ─── API ROUTES ───────────────────────────────────────────────────────────────

app.get('/api/skills', (req, res) => {
  const publicSkills = SKILLS.map(({ systemPrompt, ...skill }) => skill);
  res.json(publicSkills);
});

app.post('/api/generate', async (req, res) => {
  const { skillId, guide, customSkill } = req.body;

  if (!guide || !guide.trim()) {
    return res.status(400).json({ error: 'Guide content is required' });
  }

  let skill = SKILLS.find(s => s.id === skillId);

  if (!skill && !customSkill) {
    return res.status(400).json({ error: 'Skill not found' });
  }

  const systemPrompt = customSkill?.systemPrompt || skill.systemPrompt;
  const skillName = customSkill?.name || skill.name;
  const isMCQ = skill?.mode === 'mcq' || skill?.mode === 'adaptive';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const messages = [
    {
      role: 'user',
      content: `Here is my guide for the "${skillName}" content:\n\n${guide}\n\nGenerate the content as specified in your instructions. Be specific, premium, and aligned with the Medica brand.`
    }
  ];

  try {
    while (true) {
      let roundText = '';
      let stopReason = null;

      const stream = client.messages.stream({
        model: isMCQ ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6',
        max_tokens: isMCQ ? 4096 : 8192,
        system: systemPrompt,
        messages
      });

      await new Promise((resolve, reject) => {
        stream.on('text', (text) => {
          roundText += text;
          res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
        });
        stream.on('finalMessage', (msg) => { stopReason = msg.stop_reason; resolve(); });
        stream.on('error', reject);
      });

      if (stopReason !== 'max_tokens') break;

      // Hit output limit — add this turn to history and ask Claude to continue
      messages.push({ role: 'assistant', content: roundText });
      messages.push({ role: 'user', content: 'Continue from exactly where you left off. Do not repeat any content.' });
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('Generation error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// ─── ON-DEMAND EXPLANATION ENDPOINT ──────────────────────────────────────────
const EXPLAIN_SYSTEM = `You are a USMLE anatomy explanation writer for MEDICA Medical Education Centre.

Given a question stem, answer options, and the correct answer index, write concise UWorld-style explanations.

Output ONLY a valid JSON object. Raw JSON only — no markdown fences, no commentary, nothing else.

CRITICAL JSON SAFETY RULES — violations will break the parser:
- Never use double quotes inside any string value. Use single quotes or rephrase.
- Never include raw newlines inside string values. Keep every string on one line.
- Apostrophes and hyphens are fine. Only double quotes are forbidden inside strings.
- No trailing commas after the last item in any array or object.

Schema:
{
  "explanations": [
    "A — Correct: one to two sentences — core anatomical reasoning why this is correct",
    "B — Wrong: one sentence — why this distractor fails anatomically or clinically",
    "C — Wrong: one sentence — why this distractor fails",
    "D — Wrong: one sentence — why this distractor fails",
    "E — Wrong: one sentence — why this distractor fails"
  ],
  "integration": "One sentence linking to real clinical practice, surgery, or imaging"
}

Rules:
- Correct answer: lead with anatomical mechanism, then brief clinical connection (1-2 sentences)
- Wrong answers: one clear sentence each — why they are tempting but incorrect
- Integration: one practical clinical pearl connecting this anatomy to patient care
- Sound like an experienced USMLE tutor — precise, confident, confidence-building
- Optimized for screen reading — concise, scannable, premium feel
- Total explanation should be readable in under 20 seconds`;

app.post('/api/explain', async (req, res) => {
  const { stem, options, correct, field, pearl } = req.body;
  if (!stem || !Array.isArray(options) || typeof correct !== 'number') {
    return res.status(400).json({ error: 'Missing question data' });
  }

  const userContent = `Field: ${field || 'Anatomy'}
Stem: ${stem}
Options: ${options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o.replace(/^[A-E]\.\s*/, '')}`).join(' | ')}
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
      messages: [{ role: 'user', content: userContent }]
    });

    await new Promise((resolve, reject) => {
      stream.on('text', (text) => {
        res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
      });
      stream.on('finalMessage', () => resolve());
      stream.on('error', reject);
    });

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// ─── AI QUESTION GENERATION ENDPOINT ─────────────────────────────────────────

const GENERATE_BATCH_SIZE = 20

// Tokens per question by mode: exam has no explanations (short), coach has full option analysis (long)
const TOKENS_PER_Q = { exam: 380, practice: 750, coach: 1200 }

function getMaxTokens(mode, questionCount) {
  const perQ = TOKENS_PER_Q[mode] || TOKENS_PER_Q.practice
  return Math.min(Math.ceil(questionCount * perQ * 1.25), 8192)
}

// Retry once on 429 after waiting for the rate-limit window to partially reset
async function callWithRetry(params) {
  try {
    return await client.messages.create(params)
  } catch (err) {
    if (err.status === 429) {
      await new Promise(r => setTimeout(r, 8000))
      return await client.messages.create(params)
    }
    throw err
  }
}

const QUIZ_GEN_SYSTEM = `You are an elite USMLE Step 1 question writer and tutor for MEDICA Medical Education Centre.

Output ONLY a valid JSON object — no markdown fences, no commentary, no text before or after. Raw JSON only.

CRITICAL JSON SAFETY RULES — violations will break the parser:
- Never use double quotes ( " ) inside any string value. Use single quotes or rephrase instead.
- Never include raw newlines inside string values. Keep every string on one line.
- Apostrophes and hyphens are fine. Only double quotes are forbidden inside strings.
- Do not add trailing commas after the last item in any array or object.

EXAM MODE — timed assessment simulation:
- Output per question: id, subject, system, testedConcept, weakSpotCategory, stem, options (A-D), correct
- Do NOT generate: explanation, highYieldPearl, memoryAnchor, commonTrap, optionExplanations

PRACTICE MODE — immediate feedback with teaching:
- Output per question: all Exam fields + explanation, highYieldPearl, memoryAnchor, commonTrap
- explanation: full teaching paragraph, tutor-quality

COACH MODE — elite tutoring with option-by-option deep analysis:
- Output per question: all Practice fields + optionExplanations for every option A, B, C, D
- optionExplanations: 2-3 sentences per option — why correct is right, why each wrong is a trap

JSON SCHEMA:
{
  "title": "USMLE Step 1 — [Subject]",
  "mode": "[exam|practice|coach]",
  "questions": [
    {
      "id": 1,
      "subject": "Cardiology",
      "system": "Cardiovascular",
      "testedConcept": "Short concept name",
      "weakSpotCategory": "Analytics label",
      "stem": "Clinical vignette text.",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct": "B",
      "optionExplanations": {"A": "...", "B": "...", "C": "...", "D": "..."},
      "explanation": "Full teaching paragraph.",
      "highYieldPearl": "One-line pearl",
      "memoryAnchor": "Memory trick or mnemonic",
      "commonTrap": "Specific reasoning error students make",
      "questionAngle": "mechanism|diagnosis|treatment|complication|pharmacology|pathophysiology|adverse-effect|lab-interpretation"
    }
  ]
}

OPTIONS — ABSOLUTE RULES:
- Exactly 4 options per question, labeled A through D only
- Format: ["A. text", "B. text", "C. text", "D. text"]
- NO option E. NO fifth option. NO exceptions. Ever.
- correct: exactly one letter "A", "B", "C", or "D" — never a number or index

FIELD INCLUSION BY MODE:
- optionExplanations: Coach Mode ONLY — omit entirely in Exam and Practice
- explanation, highYieldPearl, memoryAnchor, commonTrap: Practice + Coach only — omit in Exam

FORBIDDEN FIELDS — never include: status, marked, skipped, user_answer

WRITING STANDARDS:
- NBME-style clinical vignettes — concise, realistic, every sentence contributes diagnostic value
- Distractors represent realistic reasoning errors students make
- Sound like an experienced USMLE tutor, not a textbook
- Do NOT copy or quote copyrighted resources (UWorld, AMBOSS, First Aid, Pathoma, Sketchy, BRS)
- Generate original educational content only
- Difficulty: Easy = single-step reasoning, Medium = two-step/trap, Hard = multi-step integration
- When a specific topic is requested, every question must directly test that topic — not merely mention it in passing
- Each question must have a unique testedConcept. No two questions may share the same testedConcept + questionAngle combination
- questionAngle must be one of: mechanism, diagnosis, treatment, complication, pharmacology, pathophysiology, adverse-effect, lab-interpretation

Generate exactly the number of questions requested.`;

function buildQuizGenPrompt(config, count, offset, scope) {
  const modeLabel = String(config.mode).charAt(0).toUpperCase() + String(config.mode).slice(1);
  const specific = isSpecificScopeServer(scope)
  const lines = [`Mode: ${modeLabel}`]

  if (specific) {
    lines.push(`TOPIC (REQUIRED — every question must directly test this): ${scope.scopeText}`)
    const displaySubject = (scope.subject && !isEmptyServer(scope.subject)) ? scope.subject : 'Mixed'
    const displaySystem  = (scope.system  && !isEmptyServer(scope.system))  ? scope.system  : 'Mixed'
    lines.push(`Subject: ${displaySubject}`)
    lines.push(`Organ System: ${displaySystem}`)
  } else {
    const displaySubject = (config.subject && !isEmptyServer(config.subject)) ? config.subject : 'Mixed'
    const displaySystem  = (config.system  && !isEmptyServer(config.system))  ? config.system  : 'Mixed'
    lines.push(`Subject: ${displaySubject}`)
    lines.push(`Organ System: ${displaySystem}`)
    if (config.topic) lines.push(`Topic: ${config.topic}`)
    if (config.clinicalFocus) lines.push(`Clinical Themes: ${config.clinicalFocus}`)
    if (config.mode === 'coach' && config.coachSpecificTopic) {
      lines.push(`Coach Mode Specific Topic: ${config.coachSpecificTopic}`)
    }
  }

  lines.push(`Number of questions: ${count}`)
  if (offset > 0) lines.push(`Question ID offset: start IDs at ${offset + 1}`)
  lines.push(`Difficulty: ${config.difficulty || 'Mixed'}`)

  if (specific) {
    lines.push('')
    lines.push(`SCOPE REQUIREMENTS:`)
    lines.push(`- Every question must directly and specifically test "${scope.scopeText}"`)
    lines.push(`- Each question must cover a different testedConcept and a different questionAngle`)
    lines.push(`- No two questions may share the same testedConcept + questionAngle combination`)
    lines.push(`- questionAngle must be one of: mechanism, diagnosis, treatment, complication, pharmacology, pathophysiology, adverse-effect, lab-interpretation`)
  }

  lines.push('')
  lines.push(`Generate exactly ${count} USMLE Step 1-style questions. Output valid JSON only.`)
  return lines.join('\n')
}

function repairGeneratedJSON(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '');
  s = s.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return s;
}

const GEN_VALID_LETTERS = ['A', 'B', 'C', 'D'];

function normalizeGeneratedQuestion(q, index, scope) {
  const rawOpts = Array.isArray(q.options) ? q.options : [];
  const opts = rawOpts.slice(0, 4).map((o, i) => {
    let text = '';
    if (typeof o === 'string') {
      text = o.replace(/^[A-D]\.\s*/, '').trim();
    } else if (o && typeof o === 'object') {
      text = (o.text || o.content || '').trim();
    }
    return { letter: GEN_VALID_LETTERS[i], text };
  });
  while (opts.length < 4) opts.push({ letter: GEN_VALID_LETTERS[opts.length], text: '' });

  let correct = q.correct ?? q.correctAnswer ?? null;
  if (typeof correct === 'number') correct = GEN_VALID_LETTERS[correct] ?? 'A';
  if (typeof correct === 'string') correct = correct.trim().toUpperCase().charAt(0);
  if (!GEN_VALID_LETTERS.includes(correct)) correct = 'A';

  const scopeRaw = scope ? (scope.rawTopic || scope.canonicalTopic || scope.scopeText || '') : ''

  return {
    id: q.id != null ? String(q.id) : `q${index + 1}`,
    subject: q.subject || '',
    system: q.system || '',
    topic: q.topic || (scope ? scope.topic || '' : ''),
    rawTopic: q.rawTopic || scopeRaw,
    canonicalTopic: q.canonicalTopic || (scope ? scope.canonicalTopic || scopeRaw : ''),
    topicSlug: q.topicSlug || (scope ? scope.topicSlug || '' : ''),
    topicSource: q.topicSource || (scope ? scope.topicSource || '' : ''),
    questionAngle: String(q.questionAngle || '').trim(),
    difficulty: q.difficulty || '',
    testedConcept: q.testedConcept || q.tested_concept || '',
    weakSpotCategory: q.weakSpotCategory || q.weak_spot_category || '',
    stem: (q.stem || '').trim(),
    options: opts,
    correct,
    explanation: (q.explanation || '').trim(),
    pearl: q.pearl || q.highYieldPearl || q.high_yield_pearl || '',
    memoryAnchor: q.memoryAnchor || q.memory_anchor || '',
    commonTrap: q.commonTrap || q.common_trap || '',
    optionExplanations: q.optionExplanations || {},
  };
}

function validateGeneratedQuestion(q) {
  if (!q.stem?.trim()) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (q.options.some((o, i) => o.letter !== GEN_VALID_LETTERS[i] || !o.text?.trim())) return false;
  if (!GEN_VALID_LETTERS.includes(q.correct)) return false;
  return true;
}

async function generateBatch(config, count, offset, scope) {
  const prompt = buildQuizGenPrompt(config, count, offset, scope);
  const messages = [{ role: 'user', content: prompt }];
  let fullText = '';

  const maxTokens = getMaxTokens(config.mode, count)

  while (true) {
    const response = await callWithRetry({
      model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: QUIZ_GEN_SYSTEM,
      messages,
    });

    const chunk = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
    fullText += chunk;

    if (response.stop_reason !== 'max_tokens') break;

    messages.push({ role: 'assistant', content: chunk });
    messages.push({ role: 'user', content: 'Continue from exactly where you left off. Do not repeat any content.' });
  }

  const repaired = repairGeneratedJSON(fullText);
  const parsed = JSON.parse(repaired);
  if (!Array.isArray(parsed.questions)) throw new Error('AI response missing questions array');

  return parsed.questions
    .map((q, i) => normalizeGeneratedQuestion(q, offset + i, scope))
    .filter(validateGeneratedQuestion);
}

app.post('/api/generate-questions', async (req, res) => {
  console.log("[SERVER RAW BODY]", req.body)
  const { config: rawConfig } = req.body || {};

  if (!rawConfig || !rawConfig.mode || !rawConfig.questionCount) {
    return res.status(400).json({
      error: 'Missing required config fields: mode, questionCount',
      code: 'INVALID_CONFIG',
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI generation unavailable — API key not configured',
      code: 'NO_API_KEY',
    });
  }

  try {
    const config = normalizeGenerationConfigServer(rawConfig);
    console.log("[SERVER NORMALIZED CONFIG]", config)
    const targetCount = Math.min(Math.max(Number(config.questionCount) || 5, 1), 40);
    const scope = resolveGenerationScopeServer(config);
    console.log("[SERVER RESOLVED SCOPE]", scope)
    const specific = isSpecificScopeServer(scope);

    // Over-generate by 30% buffer to account for dedup/scope-rejection losses
    const bufferedCount = Math.min(Math.ceil(targetCount * 1.3), 40);
    let allQuestions = [];
    let offset = 0;

    while (offset < bufferedCount) {
      const batchSize = Math.min(GENERATE_BATCH_SIZE, bufferedCount - offset);
      const batch = await generateBatch(config, batchSize, offset, scope);
      allQuestions.push(...batch);
      offset += batchSize;
    }

    // Dedup across the full generated set
    allQuestions = detectDuplicateQuestionsServer(allQuestions);

    // Scope filter for specific scopes only
    if (specific) {
      allQuestions = allQuestions.filter(q => isQuestionInScopeServer(q, scope));
    }

    // One retry if still short
    if (allQuestions.length < targetCount) {
      const shortfall = targetCount - allQuestions.length;
      try {
        const retryBatch = await generateBatch(config, shortfall + 2, allQuestions.length, scope);
        const existingConcepts = new Set(allQuestions.map(q => _normServer(q.testedConcept)));
        const newDeduped = detectDuplicateQuestionsServer(retryBatch).filter(q =>
          isQuestionInScopeServer(q, scope) &&
          !existingConcepts.has(_normServer(q.testedConcept))
        );
        allQuestions.push(...newDeduped);
      } catch (retryErr) {
        console.warn('[generate-questions] retry failed:', retryErr.message);
      }
    }

    const questions = allQuestions.slice(0, targetCount);

    if (questions.length === 0) {
      return res.status(500).json({
        error: 'AI generated no valid questions',
        code: 'EMPTY_RESULT',
      });
    }

    res.json({ questions, source: 'ai', count: questions.length });
  } catch (err) {
    console.error('[generate-questions]', err.message);
    res.status(500).json({
      error: err.message || 'Question generation failed',
      code: 'GENERATION_FAILED',
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n  MEDICA Skills Platform`);
  console.log(`  Running at → http://localhost:${PORT}\n`);
});
