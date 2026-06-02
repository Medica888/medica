// Pure rule-based question quality scoring — no Anthropic import, fully testable.

// ── Suspect stem detection ────────────────────────────────────────────────────

const SUSPECT_STEM_PREFIXES = [
  'a patient with',
  'a patient presents',
  'a patient who',
  'a patient is',
  'a man presents',
  'a woman presents',
];

/**
 * Returns true when a normalized stem looks too thin to be a valid vignette:
 * either shorter than 100 characters (bare question) or starting with a generic
 * phrase that omits the age/labs/findings required for NBME-style questions.
 */
export function isSuspectStem(stem: string): boolean {
  if (stem.length < 100) return true;
  const lower = stem.toLowerCase().trimStart();
  return SUSPECT_STEM_PREFIXES.some(p => lower.startsWith(p));
}

export interface QuestionQuality {
  qualityScore: number;
  nbmeStyleScore: number;
  reasoningDepthScore: number;
  distractorQualityScore: number;
  clueLeakageScore: number;
  explanationQualityScore: number;
  difficultyCalibrationScore: number;
  rejectionReasons: string[];
  validationStatus: 'pass' | 'fail' | 'repaired';
}

interface QuestionInput {
  stem: string;
  options: Array<{ letter: string; text: string }>;
  correct: string;
  explanation: string;
  optionExplanations?: Record<string, string>;
}

const VALID_LETTERS = ['A', 'B', 'C', 'D'];

const HARD_REJECTIONS = new Set([
  'duplicate_options',
  'insufficient_options',
  'stem_too_short',
  'invalid_correct_letter',
  'shallow_explanation',
  'severe_clue_leakage',
  'answer_not_supported',
  'contradictory_explanation',
  'missing_option_explanations',
]);

export const DIFFICULTY_RANGES: Record<string, { stemMin: number; stemMax: number; depthMin: number; depthMax: number }> = {
  'More Easy':        { stemMin: 70,  stemMax: 200, depthMin: 0,  depthMax: 35 },
  'Balanced':         { stemMin: 100, stemMax: 320, depthMin: 20, depthMax: 70 },
  'More Hard':        { stemMin: 130, stemMax: 420, depthMin: 40, depthMax: 85 },
  'NBME Difficult':   { stemMin: 150, stemMax: 460, depthMin: 50, depthMax: 90 },
  'UWorld Challenge': { stemMin: 180, stemMax: 520, depthMin: 65, depthMax: 100 },
  'standardized':     { stemMin: 100, stemMax: 400, depthMin: 20, depthMax: 80 },
};

export const REPAIR_GUIDANCE: Record<string, string> = {
  'shallow_explanation':         'Expand explanation to 200+ chars with mechanism and wrong-answer reasoning',
  'severe_clue_leakage':         'Rewrite stem so correct answer not named or implied in vignette',
  'no_clinical_vignette':        'Add patient age, sex, chief complaint, relevant history',
  'stem_too_short':              'Expand with full clinical vignette',
  'poor_explanation_depth':      'Include mechanism, why distractors fail, clinical pearl',
  'answer_not_supported':        'Rewrite explanation to explicitly name and support the correct option with mechanism and key terms',
  'contradictory_explanation':   'Remove any phrasing that names a wrong option as correct; clarify which answer is correct and why',
  'missing_option_explanations': 'Add per-option explanations for A, B, C, and D — each must be non-empty',
  'invalid_options':             'Provide exactly 4 options labeled A, B, C, D each with non-empty text',
  'invalid_correct_answer':      'Set the correct field to A, B, C, or D matching one of the provided options',
};

// ── Semantic consistency helpers ──────────────────────────────────────────────
// Ported from medica-app/src/lib/ai/generateAIQuestions.js so the backend
// rejects unsupported/contradictory questions before they reach the client.

// Medical abbreviations that are valid standalone answer choices.
// When the correct option text matches one of these (case-insensitive), the
// answer-support check is bypassed — a clinically correct explanation need not
// restate the abbreviation verbatim.
const MEDICAL_ABBREVIATIONS = new Set([
  // Energy molecules
  'ATP', 'ADP', 'AMP', 'GTP', 'NADH', 'NADPH', 'FADH2',
  // Nucleic acids
  'DNA', 'RNA', 'mRNA', 'tRNA', 'rRNA', 'miRNA',
  // Electrolytes / elements
  'Na', 'K', 'Ca', 'Mg', 'Cl', 'Fe', 'Zn', 'Cu', 'Phos',
  // Endocrine hormones
  'TSH', 'LH', 'FSH', 'ADH', 'PTH', 'PTHrP', 'GH', 'ACTH', 'CRH', 'TRH', 'GnRH',
  'T3', 'T4', 'PRL', 'MSH', 'DHEA', 'IGF',
  // Kidney / renal
  'GFR', 'BUN', 'ADH',
  // Immunoglobulins / immune
  'IgA', 'IgG', 'IgM', 'IgE', 'IgD', 'MHC', 'HLA', 'NK', 'TCR', 'BCR',
  // Infectious disease
  'HIV', 'HBV', 'HCV', 'HPV', 'HSV', 'CMV', 'EBV', 'VZV', 'RSV', 'HAV',
  // Enzymes / clinical markers
  'ACE', 'ADA', 'ALP', 'ALT', 'AST', 'GGT', 'LDH', 'CK', 'BNP', 'PSA',
  'INR', 'PT', 'PTT', 'ESR', 'CRP', 'CBC', 'WBC', 'RBC', 'HCG',
  // Imaging / procedures
  'CT', 'MRI', 'PET', 'MRA', 'ECG', 'EKG', 'EEG',
  // Cardiopulmonary / systemic
  'MI', 'CHF', 'DVT', 'PE', 'COPD', 'ARDS', 'SIADH', 'DKA',
  // Neuroanatomy
  'CNS', 'PNS', 'CSF', 'BBB',
]);

const STOP_WORDS = new Set([
  'the', 'and', 'with', 'without', 'from', 'that', 'this', 'these', 'those',
  'best', 'most', 'likely', 'primary', 'current', 'patient', 'presentation',
  'mechanism', 'diagnosis', 'treatment', 'disease', 'disorder', 'syndrome',
  'condition', 'effect', 'activity', 'function', 'process',
]);

function extractMeaningfulTokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 4 && !STOP_WORDS.has(t));
}

function getOptionText(options: Array<{ letter: string; text: string }>, letter: string): string {
  return (options.find(o => o.letter === letter)?.text ?? '').trim();
}

// Minimum length for the verbatim substring check in checkAnswerSupport.
// Options shorter than this rely on token-based matching instead.
const VERBATIM_MATCH_MIN_LEN = 8;

// Returns simple s-inflection variants of correctText for verbatim matching.
// Covers the common medical plural/singular pair (e.g. "Aminoglycosides" ↔ "aminoglycoside").
// Only applies when text.length >= VERBATIM_MATCH_MIN_LEN to avoid spurious matches on short words.
function verbatimVariants(text: string): string[] {
  const lower = text.toLowerCase();
  if (lower.endsWith('s')) return [lower, lower.slice(0, -1)];
  return [lower, lower + 's'];
}

/**
 * Returns 'answer_not_supported' when the explanation (or per-option explanation)
 * contains too few meaningful terms from the correct option text.
 * Skipped for exam mode (no explanation required).
 * Matches the rejection logic in generateAIQuestions.js:_supportsCorrectAnswer().
 */
function checkAnswerSupport(q: QuestionInput, mode: string): { reasons: string[] } {
  if (mode === 'exam') return { reasons: [] };

  const correctText = getOptionText(q.options, q.correct);
  if (!correctText) return { reasons: ['answer_not_supported'] };

  const explanation = [q.explanation, q.optionExplanations?.[q.correct]]
    .filter(Boolean).join(' ').toLowerCase();

  if (!explanation.trim()) return { reasons: ['answer_not_supported'] };

  // Known medical abbreviations are valid answer choices regardless of whether
  // the explanation restates them verbatim. Clinical explanations often describe
  // the mechanism without spelling out the abbreviation every time.
  if (MEDICAL_ABBREVIATIONS.has(correctText.trim().toUpperCase())) {
    return { reasons: [] };
  }

  if (correctText.length >= VERBATIM_MATCH_MIN_LEN && verbatimVariants(correctText).some(v => explanation.includes(v))) {
    return { reasons: [] };
  }

  const tokens = extractMeaningfulTokens(correctText);
  // Short text with no extractable tokens and not in the abbreviation allowlist:
  // fall back to verbatim presence check before rejecting.
  if (tokens.length === 0) {
    return explanation.includes(correctText.toLowerCase())
      ? { reasons: [] }
      : { reasons: ['answer_not_supported'] };
  }

  const matches = tokens.filter(t => explanation.includes(t)).length;
  return matches >= Math.min(2, tokens.length)
    ? { reasons: [] }
    : { reasons: ['answer_not_supported'] };
}

/**
 * Returns 'contradictory_explanation' when the explanation explicitly names
 * a wrong option as the correct answer.
 * Skipped for exam mode.
 * Matches generateAIQuestions.js:_contradictsCorrectAnswer().
 */
function checkAnswerContradiction(q: QuestionInput, mode: string): { reasons: string[] } {
  if (mode === 'exam') return { reasons: [] };

  const explanation = (q.explanation || '').toLowerCase();
  if (!explanation.trim()) return { reasons: [] };

  const contradicts = q.options.some(opt => {
    if (opt.letter === q.correct) return false;
    const text = opt.text.toLowerCase().trim();
    if (text.length < 6) return false;
    return (
      explanation.includes(`correct answer is ${text}`) ||
      explanation.includes(`${text} is the correct answer`) ||
      explanation.includes(`${text} is correct because`) ||
      explanation.includes(`answer is ${text}`) ||
      explanation.includes(`the correct choice is ${text}`) ||
      explanation.includes(`the best answer is ${text}`) ||
      explanation.includes(`we select ${text}`) ||
      explanation.includes(`you should choose ${text}`) ||
      explanation.includes(`${text} should be selected`) ||
      explanation.includes(`${text} is therefore correct`)
    );
  });

  return { reasons: contradicts ? ['contradictory_explanation'] : [] };
}

/**
 * Returns 'missing_option_explanations' when coach mode questions lack
 * per-option explanations for all four letters A-D.
 * Matches generateAIQuestions.js:_hasCoachOptionExplanations().
 */
function checkCoachOptionExplanations(q: QuestionInput, mode: string): { reasons: string[] } {
  if (mode !== 'coach') return { reasons: [] };
  const exps = q.optionExplanations ?? {};
  const hasAll = VALID_LETTERS.every(letter => String(exps[letter] ?? '').trim());
  return { reasons: hasAll ? [] : ['missing_option_explanations'] };
}

// ── Sub-scorers ───────────────────────────────────────────────────────────────

function scoreNbmeStyle(stem: string): { score: number; reasons: string[] } {
  const s = stem.toLowerCase();
  const reasons: string[] = [];

  const hasAge = /\b\d+[\s-]*(year|month|week|day)s?[\s-]*(old|aged)\b/i.test(s) || /\b\d+[\s-]*yo\b/i.test(s);
  const hasSex = /\b(man|woman|boy|girl|male|female|patient|he |she |his |her )\b/i.test(s);
  const hasPresentation = /\b(presents?|complain|comes? to|brought to|admitted|develops?|reports?|evaluation)\b/i.test(s);

  if (!hasAge && !hasSex && !hasPresentation) {
    reasons.push('no_clinical_vignette');
    return { score: 0, reasons };
  }

  let score = 0;
  if (hasAge) score += 30;
  if (hasSex) score += 20;
  if (hasPresentation) score += 20;
  if (stem.length >= 150) score += 20;
  else if (stem.length >= 100) score += 10;

  const hasLabs = /\b(mg\/dl|mmol\/l|bpm|mmhg|creatinine|hemoglobin|wbc|sodium|potassium|ecg|ekg|x-ray|mri|ct scan|biopsy|blood pressure|heart rate|temperature|platelet|hematocrit)\b/i.test(s);
  if (hasLabs) score += 10;

  return { score: Math.min(score, 100), reasons };
}

function scoreReasoningDepth(stem: string): number {
  const sentences = stem.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
  const termPattern = /\b(mg|dl|mmol|bpm|mmhg|diagnosis|treatment|symptom|sign|pathology|mechanism|enzyme|receptor|gene|mutation|infection|deficiency|syndrome|disease|disorder|acid|base|electrolyte|hormone|neurotransmitter|antibody|antigen|atp|dna|rna|protein|membrane|channel|transporter|phosphorylation|acetylation|inhibitor|agonist|antagonist)\b/gi;
  const termCount = (stem.match(termPattern) || []).length;

  let score = 0;
  score += Math.min(sentences * 15, 40);
  score += Math.min(termCount * 5, 40);
  score += stem.length >= 200 ? 20 : stem.length >= 100 ? 10 : 0;
  return Math.min(score, 100);
}

function scoreDistractorQuality(options: Array<{ letter: string; text: string }>): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (options.length < 4 || options.some(o => !o.text?.trim())) {
    reasons.push('insufficient_options');
    return { score: 0, reasons };
  }

  const texts = options.map(o => o.text.toLowerCase().trim());
  if (new Set(texts).size !== texts.length) {
    reasons.push('duplicate_options');
    return { score: 0, reasons };
  }

  let score = 50;
  const lengths = options.map(o => o.text.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const minLen = Math.min(...lengths);

  if (minLen < 5) score -= 20;
  const uniform = lengths.every(l => l >= avgLen * 0.33 && l <= avgLen * 3);
  if (uniform) score += 30;
  if (lengths.every(l => l >= 10)) score += 20;

  return { score: Math.min(Math.max(score, 0), 100), reasons };
}

function scoreClueLeakage(
  stem: string,
  options: Array<{ letter: string; text: string }>,
  correct: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const correctOpt = options.find(o => o.letter === correct);
  if (!correctOpt) return { score: 100, reasons };

  const stemLower = stem.toLowerCase();
  const answerLower = correctOpt.text.toLowerCase().trim();

  if (answerLower.length > 8 && stemLower.includes(answerLower)) {
    reasons.push('severe_clue_leakage');
    return { score: 5, reasons };
  }

  const answerWords = answerLower.split(/\s+/).filter(w => w.length >= 5);
  if (answerWords.length >= 2) {
    const leaked = answerWords.filter(w => stemLower.includes(w)).length;
    const ratio = leaked / answerWords.length;
    if (ratio >= 0.8) {
      reasons.push('severe_clue_leakage');
      return { score: 5, reasons };
    }
    if (ratio >= 0.6) return { score: 25, reasons };
    if (ratio >= 0.4) return { score: 55, reasons };
  }

  return { score: 90, reasons };
}

function scoreExplanationQuality(explanation: string, mode: string): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  if (!mode || mode === 'exam') return { score: 100, reasons };

  const text = (explanation || '').trim();
  if (text.length < 50) {
    reasons.push('shallow_explanation');
    return { score: text.length === 0 ? 0 : 10, reasons };
  }
  if (text.length < 150) return { score: 40, reasons };
  if (text.length < 300) return { score: 65, reasons };
  if (text.length < 500) return { score: 82, reasons };
  return { score: 100, reasons };
}

function scoreDifficultyCalibration(stemLength: number, depthScore: number, difficulty: string): number {
  const ranges = DIFFICULTY_RANGES[difficulty] ?? DIFFICULTY_RANGES['Balanced'];
  let score = 0;

  if (stemLength >= ranges.stemMin && stemLength <= ranges.stemMax) {
    score += 50;
  } else if (stemLength < ranges.stemMin) {
    score += Math.floor((stemLength / ranges.stemMin) * 50);
  } else {
    score += 40;
  }

  if (depthScore >= ranges.depthMin && depthScore <= ranges.depthMax) {
    score += 50;
  } else if (depthScore < ranges.depthMin) {
    score += Math.floor((depthScore / Math.max(ranges.depthMin, 1)) * 50);
  } else {
    score += 40;
  }

  return Math.min(score, 100);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scoreQuestion(
  q: QuestionInput,
  mode = 'practice',
  difficulty = 'Balanced',
): QuestionQuality {
  const rejectionReasons: string[] = [];
  const stem = (q.stem || '').trim();

  if (stem.length < 80) rejectionReasons.push('stem_too_short');
  if (!VALID_LETTERS.includes(q.correct)) rejectionReasons.push('invalid_correct_letter');

  const nbme        = scoreNbmeStyle(stem);
  const depthScore  = scoreReasoningDepth(stem);
  const distractor  = scoreDistractorQuality(q.options);
  const leakage     = scoreClueLeakage(stem, q.options, q.correct);
  const expl        = scoreExplanationQuality(q.explanation, mode);
  const calibration = scoreDifficultyCalibration(stem.length, depthScore, difficulty);

  rejectionReasons.push(...nbme.reasons, ...distractor.reasons, ...leakage.reasons, ...expl.reasons);

  // Semantic consistency checks — skipped when structural issues already make the question fail,
  // mirroring the frontend's early-return-on-structural-failure pattern.
  const hasStructuralFailure = rejectionReasons.some(r =>
    r === 'stem_too_short' || r === 'invalid_correct_letter' ||
    r === 'insufficient_options' || r === 'duplicate_options',
  );
  if (!hasStructuralFailure) {
    const answerSupport = checkAnswerSupport(q, mode);
    const contradiction  = checkAnswerContradiction(q, mode);
    const coachExpl      = checkCoachOptionExplanations(q, mode);
    rejectionReasons.push(...answerSupport.reasons, ...contradiction.reasons, ...coachExpl.reasons);
  }

  const qualityScore = Math.round(
    0.20 * nbme.score +
    0.25 * leakage.score +
    0.20 * distractor.score +
    0.20 * expl.score +
    0.15 * calibration,
  );

  const hasHardRejection = rejectionReasons.some(r => HARD_REJECTIONS.has(r));
  const validationStatus: 'pass' | 'fail' = qualityScore >= 60 && !hasHardRejection ? 'pass' : 'fail';

  return {
    qualityScore,
    nbmeStyleScore:             nbme.score,
    reasoningDepthScore:        depthScore,
    distractorQualityScore:     distractor.score,
    clueLeakageScore:           leakage.score,
    explanationQualityScore:    expl.score,
    difficultyCalibrationScore: calibration,
    rejectionReasons,
    validationStatus,
  };
}

// ── AI medical review (NBME Difficult / UWorld Challenge only) ────────────────

const MEDICAL_REVIEW_DIFFICULTIES = new Set(['NBME Difficult', 'UWorld Challenge']);

/** Returns true only for difficulties that require an AI medical review pass. */
export function requiresMedicalReview(difficulty: string): boolean {
  return MEDICAL_REVIEW_DIFFICULTIES.has(difficulty);
}

export interface MedicalReviewResult {
  status:                 'pass' | 'fail';
  medicalAccuracy:        'pass' | 'fail';
  singleBestAnswer:       'pass' | 'fail';
  distractorPlausibility: 'pass' | 'fail';
  difficultyAlignment:    'pass' | 'fail';
  explanationQuality:     'pass' | 'fail';
  reasons: string[];
  summary: string;
}

const REVIEW_CATEGORIES: ReadonlyArray<keyof Omit<MedicalReviewResult, 'status' | 'reasons' | 'summary'>> = [
  'medicalAccuracy',
  'singleBestAnswer',
  'distractorPlausibility',
  'difficultyAlignment',
  'explanationQuality',
];

export interface ReviewableQuestion {
  stem:        string;
  options:     Array<{ letter: string; text: string }>;
  correct:     string;
  explanation: string;
}

export function buildMedicalReviewPrompt(question: ReviewableQuestion, difficulty: string): string {
  const opts = question.options.map(o => `${o.letter}. ${o.text}`).join('\n');
  const expl = question.explanation?.trim() || '';
  const explLine = expl ? expl : '(none — exam mode)';
  return [
    `You are a medical education expert reviewing a USMLE ${difficulty} question.`,
    '',
    'Evaluate these 5 dimensions:',
    '1. medicalAccuracy — Are all clinical facts in the stem, options, and explanation correct?',
    '2. singleBestAnswer — Is the marked option clearly superior to all others?',
    '3. distractorPlausibility — Are wrong options realistically challenging without being unfair?',
    `4. difficultyAlignment — Does complexity and reasoning depth match ${difficulty}?`,
    '5. explanationQuality — Does the explanation teach the mechanism and address distractors?',
    '',
    'RULES:',
    '- Set status to "fail" if ANY dimension is "fail".',
    '- When Explanation is "(none — exam mode)", set explanationQuality to "pass" — explanation is not required for exam-mode questions.',
    '- List only failing dimensions in reasons.',
    '',
    'Return ONLY this JSON — no markdown, no commentary:',
    '{',
    '  "status": "pass",',
    '  "medicalAccuracy": "pass",',
    '  "singleBestAnswer": "pass",',
    '  "distractorPlausibility": "pass",',
    '  "difficultyAlignment": "pass",',
    '  "explanationQuality": "pass",',
    '  "reasons": [],',
    '  "summary": "one sentence"',
    '}',
    '',
    'QUESTION:',
    `Difficulty: ${difficulty}`,
    `Stem: ${question.stem}`,
    'Options:',
    opts,
    `Correct: ${question.correct}`,
    `Explanation: ${explLine}`,
  ].join('\n');
}

/**
 * Parses and validates the AI medical reviewer's JSON response.
 * Fail-closed: returns { pass: false } on any parse error, malformed structure,
 * or if ANY category dimension is "fail" — even when status claims "pass".
 */
export function parseMedicalReviewResponse(raw: string): { pass: boolean; result: MedicalReviewResult | null } {
  try {
    let s = raw.trim().replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '').trim();
    const start = s.indexOf('{');
    const end   = s.lastIndexOf('}');
    if (start === -1 || end <= start) return { pass: false, result: null };

    const parsed = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return { pass: false, result: null };
    if (parsed['status'] !== 'pass' && parsed['status'] !== 'fail') return { pass: false, result: null };

    for (const cat of REVIEW_CATEGORIES) {
      if (parsed[cat] !== 'pass' && parsed[cat] !== 'fail') return { pass: false, result: null };
    }

    const result: MedicalReviewResult = {
      status:                 parsed['status'] as 'pass' | 'fail',
      medicalAccuracy:        parsed['medicalAccuracy']        as 'pass' | 'fail',
      singleBestAnswer:       parsed['singleBestAnswer']       as 'pass' | 'fail',
      distractorPlausibility: parsed['distractorPlausibility'] as 'pass' | 'fail',
      difficultyAlignment:    parsed['difficultyAlignment']    as 'pass' | 'fail',
      explanationQuality:     parsed['explanationQuality']     as 'pass' | 'fail',
      reasons: Array.isArray(parsed['reasons']) ? (parsed['reasons'] as unknown[]).map(String) : [],
      summary: String(parsed['summary'] ?? ''),
    };

    // Fail closed: any category fail overrides a passing status claim.
    const anyFail = REVIEW_CATEGORIES.some(cat => result[cat] === 'fail');
    return { pass: !anyFail && result.status === 'pass', result };
  } catch {
    return { pass: false, result: null };
  }
}

// ── Repair prompt ─────────────────────────────────────────────────────────────

export function buildRepairPrompt(q: Record<string, unknown>, quality: QuestionQuality): string {
  const actionable = quality.rejectionReasons.filter(r => REPAIR_GUIDANCE[r]);
  if (actionable.length === 0) return '';
  const instructions = actionable.map(r => `- ${REPAIR_GUIDANCE[r]}`).join('\n');
  return (
    `Fix the following USMLE question. Issues to fix:\n${instructions}\n\n` +
    `Original question (JSON):\n${JSON.stringify(q, null, 2)}\n\n` +
    `Return ONLY the fixed question as a single JSON object matching the original schema. Raw JSON only.`
  );
}
