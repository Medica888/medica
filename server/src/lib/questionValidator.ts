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
}

const VALID_LETTERS = ['A', 'B', 'C', 'D'];

const HARD_REJECTIONS = new Set([
  'duplicate_options',
  'insufficient_options',
  'stem_too_short',
  'invalid_correct_letter',
  'shallow_explanation',
  'severe_clue_leakage',
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
  'shallow_explanation':    'Expand explanation to 200+ chars with mechanism and wrong-answer reasoning',
  'severe_clue_leakage':    'Rewrite stem so correct answer not named or implied in vignette',
  'no_clinical_vignette':   'Add patient age, sex, chief complaint, relevant history',
  'stem_too_short':         'Expand with full clinical vignette',
  'poor_explanation_depth': 'Include mechanism, why distractors fail, clinical pearl',
};

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
