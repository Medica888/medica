// Pure rule-based question quality scoring — no Anthropic import, fully testable.

import {
  validateCardiovascularPathology,
  type SpecialtyValidationResult,
} from './cardioPathologyValidator.js';
import {
  normalizeSubject,
  normalizeSystem,
} from './medicaTaxonomy.js';
import { STRUCTURAL_DEPTH_THRESHOLDS } from './validation/difficultyBands.js';

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
  /** Additive specialty validation metadata. Never undefined; use status for gating. */
  specialtyValidation?: SpecialtyValidationResult;
}

// Re-export so callers can reference the type without importing two files.
export type { SpecialtyValidationResult };

interface QuestionInput {
  stem: string;
  options: Array<{ letter: string; text: string }>;
  correct: string;
  explanation: string;
  optionExplanations?: Record<string, string>;
  // Optional USMLE metadata — forwarded from AI generation and used by specialty validators.
  subject?: string;
  system?: string;
  topic?: string;
  testedConcept?: string;
  questionAngle?: string;
  usmleContentArea?: string;
  physicianTask?: string;
}

// A–L covers the USMLE Step 1 extended-matching ceiling (up to 12 options).
// M and beyond are never valid answer letters.
const VALID_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** Letters of the options actually provided, in order — never assumes a fixed A–D set. */
function getOptionLetters(options: Array<{ letter: string; text: string }>): string[] {
  return (options || []).map(o => o.letter).filter(Boolean);
}

/**
 * A correct-answer letter is valid only if it's within the A–L ceiling AND matches
 * one of the options actually provided — a letter outside the given option set is
 * just as invalid as one outside A–L, even if it happens to be a "real" letter.
 */
function isValidCorrectLetter(q: QuestionInput): boolean {
  return VALID_LETTERS.includes(q.correct) && getOptionLetters(q.options).includes(q.correct);
}

const HARD_REJECTIONS = new Set([
  'duplicate_options',
  'insufficient_options',
  'stem_too_short',
  'no_clinical_vignette',
  'invalid_correct_letter',
  'shallow_explanation',
  'severe_clue_leakage',
  'answer_not_supported',
  'contradictory_explanation',
  'missing_option_explanations',
  // Distractor hardening (general path, applies to UWorld Challenge and below)
  'generic_option_present',
  // Specialty validators
  'specialty_validation_failed',
  // Universal difficulty fit
  'excessive_complexity_for_easy',
  // UWorld Challenge — structural parity (Phase 4)
  'uworld_stem_too_short',
  'hard_explanation_too_short',
  'weak_hard_distractors',
  'missing_objective_data',
  'missing_uworld_option_explanations',
  'shallow_uworld_option_explanations',
]);

// Hard rejections specific to the NBME Difficult path.
// Note: 'shallow_explanation' is intentionally absent — NBME allows concise practice explanations.
const NBME_HARD_REJECTIONS = new Set([
  'nbme_stem_too_short',
  'missing_patient_anchor',
  'weak_clinical_signal',
  'weak_single_best_answer_lead_in',
  'teaching_language_in_stem',
  'weak_distractors',
  'duplicate_options',
  'insufficient_options',
  'invalid_correct_letter',
  'clue_leakage',
  'answer_not_supported',
  'contradictory_explanation',
  'missing_option_explanations',
  'non_concise_nbme_options',
  // Specialty validators
  'specialty_validation_failed',
]);

// depthMin/depthMax here are on the scoreReasoningDepth(stem) scale — stem-only, sentence/term counting.
// ENGINE_DEPTH_BANDS in difficultyBands.ts uses the reasoningDepth(question) scale — full question,
// presence-based.  Both return 0–100 but diverge numerically for the same question.  Do NOT merge
// these tables with ENGINE_DEPTH_BANDS unless both scoring functions are aligned: Balanced max is 70
// here vs 75 in ENGINE_DEPTH_BANDS; More Hard max is 85 here vs 90 there.
export const DIFFICULTY_RANGES: Record<string, { stemMin: number; stemMax: number; depthMin: number; depthMax: number }> = {
  'More Easy':        { stemMin: 70,  stemMax: 200, depthMin: 0,  depthMax: 35 },
  'Balanced':         { stemMin: 100, stemMax: 320, depthMin: 20, depthMax: 70 },
  'More Hard':        { stemMin: 130, stemMax: 420, depthMin: 40, depthMax: 85 },
  // NBME Difficult uses concise clinical vignettes; stemMin reflects the 70-char floor, not UWorld depth.
  'NBME Difficult':   { stemMin: 70,  stemMax: 460, depthMin: 30, depthMax: 90 },
  'UWorld Challenge': { stemMin: 180, stemMax: 520, depthMin: 65, depthMax: 100 },
  'standardized':     { stemMin: 100, stemMax: 400, depthMin: 20, depthMax: 80 },
};

export const REPAIR_GUIDANCE: Record<string, string> = {
  'shallow_explanation':              'Expand explanation to 200+ chars with mechanism and wrong-answer reasoning',
  'severe_clue_leakage':             'Rewrite stem so correct answer not named or implied in vignette',
  'no_clinical_vignette':            'Add patient age, sex, chief complaint, relevant history',
  'stem_too_short':                  'Expand with full clinical vignette',
  'poor_explanation_depth':          'Include mechanism, why distractors fail, clinical pearl',
  'answer_not_supported':            'Rewrite explanation to explicitly name and support the correct option with mechanism and key terms',
  'contradictory_explanation':       'Remove any phrasing that names a wrong option as correct; clarify which answer is correct and why',
  'missing_option_explanations':     'Add per-option explanations for A, B, C, and D — each must be non-empty',
  'invalid_options':                 'Provide exactly 4 options labeled A, B, C, D each with non-empty text',
  'invalid_correct_answer':          'Set the correct field to A, B, C, or D matching one of the provided options',
  // NBME Difficult-specific repair guidance
  'nbme_stem_too_short':             'Expand stem to ≥70 chars with a clinical scenario and patient anchor',
  'missing_patient_anchor':          'Add a patient identifier (e.g. "A 45-year-old man" or "A pregnant woman")',
  'weak_single_best_answer_lead_in': 'End the stem with a clear interrogative lead-in (e.g. "Which of the following...?") and a question mark',
  'teaching_language_in_stem':       'Remove teaching cues (e.g. "remember", "high-yield", "note that") — stems must be pure clinical vignette',
  'weak_distractors':                'Replace generic or too-short options with medically specific alternatives ≥4 characters each',
  'non_concise_nbme_options':        'Shorten each option to ≤160 chars — NBME-style options are concise single best answers, not explanations',
  'clue_leakage':                    'Rewrite stem so the correct answer text does not appear verbatim or near-verbatim in the question',
  // General distractor hardening
  'generic_option_present':          'Replace generic options (e.g. "All of the above", "None of the above", "Unknown") with specific clinical alternatives',
  // Universal difficulty fit
  'excessive_complexity_for_easy':   'Simplify to a 1-step direct clinical question — remove multi-step reasoning and dense clinical context for More Easy difficulty',
  'insufficient_reasoning_depth':    'Add multi-step clinical reasoning, laboratory findings, or pathophysiological mechanisms to meet the required difficulty depth',
  // UWorld Challenge-specific repair guidance
  'uworld_stem_too_short':              'Expand stem to 180+ chars with full clinical vignette: demographics, presenting symptoms, objective findings, and timeline',
  'hard_explanation_too_short':         'Expand explanation to 350+ chars covering the mechanism, why the correct answer is right, and why each distractor fails',
  'weak_hard_distractors':              'Rewrite each option as a specific 3+ word clinical phrase (12+ chars) — avoid single drug names, abbreviations, or vague terms',
  'missing_objective_data':             'Add objective clinical data to the stem: lab values (e.g. creatinine, hemoglobin, mg/dL), vital signs (e.g. BP, HR, mmHg), or imaging/biopsy findings',
  'missing_uworld_option_explanations': 'Add per-option explanations for A, B, C, and D explaining why each option is correct or incorrect with specific mechanistic detail',
  'shallow_uworld_option_explanations': 'Expand each per-option explanation to 60+ chars with specific mechanistic reasoning about why the option is right or wrong',
  'weak_wrong_option_teaching':         'Add contrast/why-wrong teaching to 2+ wrong-option explanations (e.g. "incorrect because...", "unlike X this does not...", "does not explain...")',
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
  'mechanism', 'diagnosis', 'treatment',
  'condition', 'effect', 'activity', 'function', 'process',
  // Note: 'disease', 'disorder', 'syndrome' intentionally excluded so condition
  // names like "Graves disease", "Cushing syndrome", "panic disorder" retain their
  // meaningful tokens in the answer-support check.
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

// Returns s-inflection and -ies/-y variants of correctText for verbatim matching.
// Covers: "Aminoglycosides" ↔ "aminoglycoside" (strip -s) and
//         "Antibodies" ↔ "antibody" (strip -ies, add -y).
// Only called when text.length >= VERBATIM_MATCH_MIN_LEN (8), so short-word edge cases
// like "lies"/"dies" never reach this function.
function verbatimVariants(text: string): string[] {
  const lower = text.toLowerCase();
  if (lower.endsWith('ies')) return [lower, lower.slice(0, -3) + 'y'];
  if (lower.endsWith('s'))   return [lower, lower.slice(0, -1)];
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

  // Include all per-option explanations so coach-mode contradictions are caught.
  const optExplText = Object.values(q.optionExplanations ?? {}).join(' ');
  const explanation = [(q.explanation || ''), optExplText].join(' ').toLowerCase();
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
 * Returns 'missing_option_explanations' when coach mode questions lack a
 * per-option explanation for every option actually provided (not a fixed A-D set).
 * Matches generateAIQuestions.js:_hasCoachOptionExplanations().
 */
function checkCoachOptionExplanations(q: QuestionInput, mode: string): { reasons: string[] } {
  if (mode !== 'coach') return { reasons: [] };
  const exps = q.optionExplanations ?? {};
  const letters = getOptionLetters(q.options);
  const hasAll = letters.length > 0 && letters.every(letter => String(exps[letter] ?? '').trim());
  return { reasons: hasAll ? [] : ['missing_option_explanations'] };
}

// ── NBME Difficult — constants (mirrors medica-app/src/lib/mockQuestions.js) ──

/** True only for the NBME Difficult difficulty tier. */
export function isNbmeDifficulty(difficulty: string): boolean {
  return difficulty === 'NBME Difficult';
}

// Patient anchor: age/sex/demographic (mirrors frontend NBME_PATIENT_ANCHOR_RE).
const NBME_PATIENT_ANCHOR_RE = /\b(\d+[\s-]*(year|month|week|day)s?[\s-]*(old|aged)|pregnant|premenopausal|postmenopausal|healthy|newborn|infant|child|adolescent|man|woman|boy|girl|male|female|patient)\b/i;

// Clinical presentation signal (mirrors frontend NBME_CLINICAL_SIGNAL_RE).
const NBME_CLINICAL_SIGNAL_RE = /\b(history|presents?|comes? to|brought to|admitted|evaluated|complain|reports?|develops?|progressive|sudden|acute|chronic|week|month|day|hour|pain|dyspnea|fatigue|fever|swelling|redness|stiffness|visual|difficulty|fracture|exercise|spotting|pregnancy|mother|family|x-rays?|radiograph|examination|biopsy|catheterization|serum|urine|blood|prothrombin|hcg|vital signs|weight|medication|operation|replacement|risk)\b/i;

// Broader clinical measurement fallback — used in the count check that mirrors
// the frontend's `_clinicalSignalCount(stem) === 0` guard.
const NBME_CLINICAL_SIGNAL_COUNT_RE = /\b(\d+[\s-]*(year|month|week|day|hour)s?[\s-]*(old|aged|flight)?|bp|hr|spo2|wbc|rbc|platelet|creatinine|bun|hemoglobin|hematocrit|sodium|potassium|na|k|chloride|bicarbonate|hco3|ph|paco2|pao2|glucose|calcium|magnesium|phosphate|albumin|bilirubin|ast|alt|alp|inr|pt|ptt|troponin|lactate|cortisol|acth|serum|plasma|urine|ua|urinalysis|csf|biopsy|ct|mri|x-ray|cxr|ecg|ekg|ultrasound|doppler|wells|dvt|valve area|gradient|ammonia|antibody|mutation|enzyme|receptor|mmhg|mg\/dl|mcg\/dl|meq\/l|mmol\/l|umol\/l|u\/l|%|°c)\b/gi;

// Valid NBME lead-in patterns (broader than the general LEAD_IN_RE).
const NBME_LEAD_IN_RE = /\b(which of the following|which is|what is|why does|most likely|most appropriate|best describes|best explains|next best step|next step|mechanism|diagnosis|location|additional information|finding|cause|risk|drug|treatment|management|intervention|approach|enzyme deficiency|subtype)\b/i;

// Teaching / test-prep language that must not appear in clinical exam stems.
const NBME_TEACHING_STEM_RE = /\b(remember|note that|teaches|high-yield|classic clue|board trick|you should know)\b/i;

// Generic placeholder options that are never medically valid (applies to all modes).
const GENERIC_OPTION_RE = /^(all of the above|none of the above|unknown|other|correct|wrong|no|yes|maybe|not sure)$/i;

// ── NBME Difficult sub-scorers ────────────────────────────────────────────────

/** Fails if stem lacks a patient anchor (age, sex, or demographic). */
export function scoreNbmePatientAnchor(stem: string): { reasons: string[] } {
  return NBME_PATIENT_ANCHOR_RE.test(stem) ? { reasons: [] } : { reasons: ['missing_patient_anchor'] };
}

/**
 * Fails if stem has no clinical presentation signal AND no clinical measurement value.
 * Mirrors frontend: !NBME_CLINICAL_SIGNAL_RE.test(stem) && _clinicalSignalCount(stem) === 0.
 */
export function scoreNbmeClinicalSignal(stem: string): { reasons: string[] } {
  if (NBME_CLINICAL_SIGNAL_RE.test(stem)) return { reasons: [] };
  const count = new Set(String(stem || '').toLowerCase().match(NBME_CLINICAL_SIGNAL_COUNT_RE) || []).size;
  return count > 0 ? { reasons: [] } : { reasons: ['weak_clinical_signal'] };
}

/** Fails if stem lacks a clear NBME-style interrogative lead-in ending with '?'. */
export function scoreNbmeLeadIn(stem: string): { reasons: string[] } {
  return NBME_LEAD_IN_RE.test(stem) && /\?\s*$/.test(stem)
    ? { reasons: [] }
    : { reasons: ['weak_single_best_answer_lead_in'] };
}

/**
 * Validates NBME option style: 4 options required, no duplicates, no generic options,
 * no options shorter than 4 characters.
 * Returns a { score, reasons } pair for use in quality-score telemetry.
 */
export function scoreNbmeOptionStyle(
  options: Array<{ letter: string; text: string }>,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];

  if (options.length < 4 || options.some(o => !o.text?.trim())) {
    reasons.push('insufficient_options');
    return { score: 0, reasons };
  }

  const texts = options.map(o => o.text.trim());
  if (new Set(texts.map(t => t.toLowerCase())).size !== texts.length) {
    reasons.push('duplicate_options');
    return { score: 0, reasons };
  }

  const hasTooShort = texts.some(t => t.length < 4);
  const hasGeneric  = texts.some(t => GENERIC_OPTION_RE.test(t));
  const hasTooLong  = texts.some(t => t.length > 160);
  if (hasTooShort || hasGeneric) reasons.push('weak_distractors');
  if (hasTooLong) reasons.push('non_concise_nbme_options');

  let score = hasTooShort || hasGeneric ? 20 : 60;
  const lengths = texts.map(t => t.length);
  const minLen  = Math.min(...lengths);
  const avgLen  = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (minLen >= 10) score += 15;
  if (lengths.every(l => l >= avgLen * 0.33 && l <= avgLen * 3)) score += 15;
  if (minLen >= 20) score += 10;

  return { score: Math.min(Math.max(score, 0), 100), reasons };
}

/**
 * NBME-specific clue leakage check (mirrors frontend _hasNbmeClueLeakage).
 * Normalises both stem and answer to alphanum+space before comparison.
 */
export function scoreNbmeClueLeakage(
  stem: string,
  options: Array<{ letter: string; text: string }>,
  correct: string,
): { score: number; reasons: string[] } {
  const correctOpt = options.find(o => o.letter === correct);
  if (!correctOpt) return { score: 90, reasons: [] };

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const answer = normalize(correctOpt.text);
  const stemN  = normalize(stem);

  if (!answer || answer.length < 9) return { score: 90, reasons: [] };
  if (stemN.includes(answer)) return { score: 5, reasons: ['clue_leakage'] };

  const words = answer.split(/\s+/).filter(w => w.length >= 6);
  if (words.length >= 2) {
    const leaked = words.filter(w => stemN.includes(w)).length;
    if (leaked / words.length >= 0.8) return { score: 5, reasons: ['clue_leakage'] };
  }

  return { score: 90, reasons: [] };
}

/** Composite NBME style score (0–100) — used for telemetry only, not pass/fail gating. */
function computeNbmeStyleScore(stem: string): number {
  let score = 0;
  if (NBME_PATIENT_ANCHOR_RE.test(stem)) score += 40;
  if (NBME_CLINICAL_SIGNAL_RE.test(stem)) score += 30;
  if (NBME_LEAD_IN_RE.test(stem) && /\?\s*$/.test(stem)) score += 20;
  if (!NBME_TEACHING_STEM_RE.test(stem)) score += 10;
  return Math.min(score, 100);
}

// ── Layer 4 helper: specialty rule-pack validators ────────────────────────────
// Runs all subject/system rule-pack validators and mutates rejectionReasons.
// Centralises the identical call block that would otherwise live in both
// scoreNbmeQuestion and scoreQuestion.
function applySpecialtyValidation(q: QuestionInput, rejectionReasons: string[]): SpecialtyValidationResult {
  const result = validateCardiovascularPathology(q);
  if (result.status === 'fail') rejectionReasons.push('specialty_validation_failed');
  return result;
}

/**
 * NBME Difficult-specific question scorer. Rule-based: pass/fail is determined
 * entirely by whether any NBME_HARD_REJECTIONS reason is present.
 * qualityScore is computed for telemetry but does NOT gate validationStatus.
 */
export function scoreNbmeQuestion(
  q: QuestionInput,
  mode = 'practice',
  difficulty = 'NBME Difficult',
): QuestionQuality {
  const rejectionReasons: string[] = [];
  const stem = (q.stem || '').trim();

  // ── Layer 1: base structural ─────────────────────────────────────────────────
  if (stem.length < 70) rejectionReasons.push('nbme_stem_too_short');
  if (!isValidCorrectLetter(q)) rejectionReasons.push('invalid_correct_letter');

  // ── Layer 5: NBME-only format checks ─────────────────────────────────────────
  rejectionReasons.push(...scoreNbmePatientAnchor(stem).reasons);
  rejectionReasons.push(...scoreNbmeClinicalSignal(stem).reasons);
  rejectionReasons.push(...scoreNbmeLeadIn(stem).reasons);
  if (NBME_TEACHING_STEM_RE.test(stem)) rejectionReasons.push('teaching_language_in_stem');

  const optStyle = scoreNbmeOptionStyle(q.options);
  rejectionReasons.push(...optStyle.reasons);

  // Clue leakage (NBME-specific, softer than the general severe_clue_leakage)
  const leakage = scoreNbmeClueLeakage(stem, q.options, q.correct);
  rejectionReasons.push(...leakage.reasons);

  // ── Layer 2: semantic consistency (skipped when Layer 1 or 5 structural issues present) ──
  // Explanation quality — scored but shallow_explanation is NOT a hard NBME rejection.
  const expl = scoreExplanationQuality(q.explanation, mode);
  rejectionReasons.push(...expl.reasons);

  // Semantic consistency (skipped when structural issues are already present)
  const hasStructuralFailure = rejectionReasons.some(r => NBME_HARD_REJECTIONS.has(r));
  if (!hasStructuralFailure) {
    const answerSupport = checkAnswerSupport(q, mode);
    const contradiction  = checkAnswerContradiction(q, mode);
    const coachExpl      = checkCoachOptionExplanations(q, mode);
    rejectionReasons.push(...answerSupport.reasons, ...contradiction.reasons, ...coachExpl.reasons);
  }

  // Telemetry scores
  const nbmeStyleScore = computeNbmeStyleScore(stem);
  const depthScore     = scoreReasoningDepth(stem);
  const calibration    = scoreDifficultyCalibration(stem.length, depthScore, difficulty);

  const qualityScore = Math.round(
    0.25 * nbmeStyleScore +
    0.25 * leakage.score +
    0.20 * optStyle.score +
    0.15 * expl.score +
    0.15 * calibration,
  );

  // ── Layer 4: specialty rule-pack validators ──────────────────────────────────
  const specialtyValidation = applySpecialtyValidation(q, rejectionReasons);

  // Pass/fail is rule-based only — qualityScore is telemetry, not a gate.
  const hasHardRejection = rejectionReasons.some(r => NBME_HARD_REJECTIONS.has(r));
  const validationStatus: 'pass' | 'fail' = hasHardRejection ? 'fail' : 'pass';

  return {
    qualityScore,
    nbmeStyleScore,
    reasoningDepthScore:        depthScore,
    distractorQualityScore:     optStyle.score,
    clueLeakageScore:           leakage.score,
    explanationQualityScore:    expl.score,
    difficultyCalibrationScore: calibration,
    rejectionReasons,
    validationStatus,
    specialtyValidation,
  };
}

// ── Sub-scorers ───────────────────────────────────────────────────────────────

const NON_CLINICAL_DISCIPLINE_RE = /\b(biostatistics|epidemiology|study design|practice-based learning)\b/i;
const NON_CLINICAL_SCENARIO_RE = /\b(study|trial|cohort|case-control|screening|diagnostic test|investigators?|participants?|incidence|prevalence|sensitivity|specificity|relative risk|odds ratio|confidence interval|sample size)\b/i;

function isValidNonClinicalScenario(q: QuestionInput): boolean {
  const metadata = [q.subject, q.topic, q.testedConcept, q.questionAngle, q.physicianTask]
    .filter(Boolean)
    .join(' ');
  return NON_CLINICAL_DISCIPLINE_RE.test(metadata) && NON_CLINICAL_SCENARIO_RE.test(q.stem || '');
}

function scoreClinicalVignetteStyle(stem: string, allowNonClinicalScenario = false): { score: number; reasons: string[] } {
  const s = stem.toLowerCase();
  const reasons: string[] = [];

  const hasAge = /\b\d+[\s-]*(year|month|week|day)s?[\s-]*(old|aged)\b/i.test(s) || /\b\d+[\s-]*yo\b/i.test(s);
  const hasSex = /\b(man|woman|boy|girl|male|female|patient|he |she |his |her )\b/i.test(s);
  const hasPresentation = /\b(presents?|complain|comes? to|brought to|admitted|develops?|reports?|evaluation)\b/i.test(s);

  if (!hasAge && !hasSex && !hasPresentation) {
    if (allowNonClinicalScenario) {
      const score = Math.min(70 + (stem.length >= 150 ? 20 : 10), 100);
      return { score, reasons };
    }
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

  // Generic placeholder options (e.g. "All of the above", "Unknown") are never valid.
  if (texts.some(t => GENERIC_OPTION_RE.test(t))) {
    reasons.push('generic_option_present');
  }

  let score = 50;
  const lengths = options.map(o => o.text.length);
  const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const minLen = Math.min(...lengths);

  if (minLen < 5) score -= 20;
  const uniform = lengths.every(l => l >= avgLen * 0.33 && l <= avgLen * 3);
  if (uniform) score += 30;
  if (lengths.every(l => l >= 10)) score += 20;
  if (reasons.includes('generic_option_present')) score -= 30;

  return { score: Math.min(Math.max(score, 0), 100), reasons };
}

function scoreClueLeakage(
  stem: string,
  options: Array<{ letter: string; text: string }>,
  correct: string,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const correctOpt = options.find(o => o.letter === correct);
  if (!correctOpt) return { score: 0, reasons };

  const stemLower = stem.toLowerCase();
  const answerLower = correctOpt.text.toLowerCase().trim();

  if (answerLower.length > 8 && stemLower.includes(answerLower)) {
    reasons.push('severe_clue_leakage');
    return { score: 5, reasons };
  }

  const optionTexts = options.map(option => option.text.toLowerCase());
  const answerWords = answerLower
    .split(/\s+/)
    .filter(w => w.length >= 5)
    // Shared option labels such as "sensitivity" and "specificity" are part of
    // the answer format, not clues that distinguish the keyed option.
    .filter(w => !optionTexts.every(text => text.includes(w)));
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
  if (text.length < 150) {
    reasons.push('shallow_explanation');
    const score = text.length === 0 ? 0 : text.length < 50 ? 10 : 40;
    return { score, reasons };
  }
  if (text.length < 300) return { score: 65, reasons };
  if (text.length < 500) return { score: 82, reasons };
  return { score: 100, reasons };
}

/**
 * Universal difficulty fit check — sibling to scoreDifficultyCalibration.
 *
 * Returns reason strings for obvious difficulty mismatches.  Intentionally does
 * NOT alter the numeric calibration formula so existing qualityScore assertions
 * are unaffected.
 *
 * Hard reason (in HARD_REJECTIONS):
 *   excessive_complexity_for_easy  — More Easy with clearly hard-mode depth
 *
 * Soft reasons (NOT in HARD_REJECTIONS):
 *   difficulty_too_hard            — More Easy content above the Easy band
 *   insufficient_reasoning_depth   — More Hard / UWorld below their depth floors
 *
 * Asymmetry is intentional:
 *   More Easy  → upper bound only (catch too complex)
 *   More Hard  → lower bound only (catch too shallow)
 *   UWorld     → lower bound only (UWorld-specific structural rules are Phase 4)
 *   Balanced   → no check (existing calibration + structural gates are sufficient)
 *   NBME       → handled by scoreNbmeQuestion; never reaches this function
 */
export function checkDifficultyFit(depthScore: number, stemLength: number, difficulty: string): string[] {
  const reasons: string[] = [];
  switch (difficulty) {
    case 'More Easy': {
      const t = STRUCTURAL_DEPTH_THRESHOLDS['More Easy'];
      if (depthScore > t.hardRejectAbove) {
        reasons.push('excessive_complexity_for_easy');
      } else if (depthScore > t.softWarnAbove) {
        reasons.push('difficulty_too_hard');
      }
      break;
    }
    case 'More Hard': {
      const t = STRUCTURAL_DEPTH_THRESHOLDS['More Hard'];
      if (depthScore < t.warnBelow) {
        reasons.push('insufficient_reasoning_depth');
      }
      break;
    }
    case 'UWorld Challenge': {
      const t = STRUCTURAL_DEPTH_THRESHOLDS['UWorld Challenge'];
      if (depthScore < t.warnBelow) {
        reasons.push('insufficient_reasoning_depth');
      }
      break;
    }
    // Balanced: calibration score + structural gates (stem_too_short,
    // no_clinical_vignette, shallow_explanation) already cover extreme cases.
    // NBME Difficult: scoreNbmeQuestion handles its own depth signals.
    // 'standardized', '': no difficulty-fit check.
  }
  return reasons;
}

// ── Phase 4: UWorld Challenge — structural parity rules ──────────────────────

/**
 * Objective clinical data required in UWorld stems:
 * lab values, vital sign measurements, or imaging/procedure findings.
 * Mirrors medica-app/src/lib/mockQuestions.js OBJECTIVE_DATA_RE.
 */
const UWORLD_OBJECTIVE_DATA_RE = /\b(mg\/dl|mmol\/l|bpm|mmhg|creatinine|hemoglobin|hematocrit|wbc|platelet|sodium|potassium|ph|paco2|pao2|hco3|ecg|ekg|x-ray|mri|ct scan|biopsy|blood pressure|heart rate|temperature|antibody|enzyme|mutation|urinalysis|csf|serum|plasma|oxygen|spo2|troponin|lactate|glucose|calcium|albumin|bilirubin|inr|bp|hr)\b/i;
const UWORLD_QUANTITATIVE_STUDY_DATA_RE = /\b\d[\d,]*(?:\.\d+)?\s*(?:%|patients?|participants?|people|person-years?|years?|months?|days?|per\s+\d[\d,]*)\b/i;

/**
 * Contrast / why-wrong teaching language expected in UWorld wrong-option explanations.
 * Mirrors medica-app/src/lib/mockQuestions.js WRONG_OPTION_CONTRAST_RE.
 */
const UWORLD_CONTRAST_RE = /\b(not|does not|do not|instead|whereas|however|although|unlike|lacks?|incorrect|wrong|rather than|in contrast|less likely|rules out|incompatible|not the|fails to|neither|not seen|not consistent|not associated|not caused by)\b/i;

/**
 * UWorld Challenge structural and quality checks applied on top of the general path.
 *
 * Hard reasons (in HARD_REJECTIONS):
 *   uworld_stem_too_short             — stem < 180 chars
 *   hard_explanation_too_short        — explanation < 350 chars (skipped in exam mode when empty)
 *   weak_hard_distractors             — any option < 12 chars or < 3 words
 *   missing_objective_data            — no lab/vital/imaging signal in stem
 *   missing_uworld_option_explanations — not all A–D explanations present (practice/coach)
 *   shallow_uworld_option_explanations — any option explanation < 60 chars (practice/coach)
 *
 * Soft reason (NOT in HARD_REJECTIONS):
 *   weak_wrong_option_teaching        — < 2 wrong-option explanations use contrast language
 */
export function checkUworldSpecific(q: QuestionInput, mode: string): string[] {
  const reasons: string[] = [];
  const stem        = (q.stem        || '').trim();
  const explanation = (q.explanation || '').trim();
  const exps        = q.optionExplanations ?? {};
  const isExam      = mode === 'exam';

  // ── Stem ─────────────────────────────────────────────────────────────────────
  if (stem.length < 180) {
    reasons.push('uworld_stem_too_short');
  }

  const hasObjectiveData = UWORLD_OBJECTIVE_DATA_RE.test(stem)
    || (isValidNonClinicalScenario(q) && UWORLD_QUANTITATIVE_STUDY_DATA_RE.test(stem));
  if (!hasObjectiveData) {
    reasons.push('missing_objective_data');
  }

  // ── Explanation ───────────────────────────────────────────────────────────────
  // Exam mode with no explanation: intentionally absent — do not penalise.
  // Exam mode with a non-empty explanation that is still too short: apply the check.
  if (!isExam || explanation.length > 0) {
    if (explanation.length < 350) {
      reasons.push('hard_explanation_too_short');
    }
  }

  // ── Options ───────────────────────────────────────────────────────────────────
  if ((q.options || []).some(o => {
    const text  = (o.text || '').trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    return text.length < 12 || words < 3;
  })) {
    reasons.push('weak_hard_distractors');
  }

  // ── Option explanations (practice / coach only) ───────────────────────────────
  if (!isExam) {
    const letters = getOptionLetters(q.options);
    const hasAll = letters.length > 0 && letters.every(l => String(exps[l] ?? '').trim().length > 0);
    if (!hasAll) {
      reasons.push('missing_uworld_option_explanations');
    } else {
      if (letters.some(l => String(exps[l] ?? '').trim().length < 60)) {
        reasons.push('shallow_uworld_option_explanations');
      }
    }

    // ── Wrong-option contrast teaching (soft) ────────────────────────────────────
    const contrastCount = letters.filter(l => {
      if (l === q.correct) return false;
      const expl = String(exps[l] ?? '').trim();
      return expl.length > 0 && UWORLD_CONTRAST_RE.test(expl);
    }).length;
    if (contrastCount < 2) {
      reasons.push('weak_wrong_option_teaching');
    }
  }

  return reasons;
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
  // NBME Difficult uses a separate rule-based validator with concise-stem allowances.
  if (isNbmeDifficulty(difficulty)) return scoreNbmeQuestion(q, mode, difficulty);

  const rejectionReasons: string[] = [];
  const stem = (q.stem || '').trim();

  // ── Layer 1: base structural ──────────────────────────────────────────────────
  if (stem.length < 80) rejectionReasons.push('stem_too_short');
  if (!isValidCorrectLetter(q)) rejectionReasons.push('invalid_correct_letter');

  // ── Layer 2: content quality (vignette style, distractor, leakage, explanation) ──
  const nbme        = scoreClinicalVignetteStyle(stem, isValidNonClinicalScenario(q));
  const depthScore  = scoreReasoningDepth(stem);
  const distractor  = scoreDistractorQuality(q.options);
  const leakage     = scoreClueLeakage(stem, q.options, q.correct);
  const expl        = scoreExplanationQuality(q.explanation, mode);
  const calibration = scoreDifficultyCalibration(stem.length, depthScore, difficulty);

  rejectionReasons.push(...nbme.reasons, ...distractor.reasons, ...leakage.reasons, ...expl.reasons);

  // ── Layer 2 continued: semantic consistency (skipped on Layer 1/2 structural failure) ──
  const hasStructuralFailure = rejectionReasons.some(r =>
    r === 'stem_too_short' || r === 'invalid_correct_letter' ||
    r === 'insufficient_options' || r === 'duplicate_options' ||
    r === 'no_clinical_vignette',
  );
  if (!hasStructuralFailure) {
    const answerSupport = checkAnswerSupport(q, mode);
    const contradiction  = checkAnswerContradiction(q, mode);
    const coachExpl      = checkCoachOptionExplanations(q, mode);
    rejectionReasons.push(...answerSupport.reasons, ...contradiction.reasons, ...coachExpl.reasons);
  }

  // ── Layer 3: universal difficulty fit ────────────────────────────────────────
  rejectionReasons.push(...checkDifficultyFit(depthScore, stem.length, difficulty));

  // ── Layer 5: UWorld-only structural and quality rules ────────────────────────
  if (difficulty === 'UWorld Challenge') {
    rejectionReasons.push(...checkUworldSpecific(q, mode));
  }

  const qualityScore = Math.round(
    0.18 * nbme.score +
    0.22 * leakage.score +
    0.18 * distractor.score +
    0.18 * expl.score +
    0.14 * calibration +
    0.10 * depthScore,
  );

  // ── Layer 4: specialty rule-pack validators ──────────────────────────────────
  const specialtyValidation = applySpecialtyValidation(q, rejectionReasons);

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
    specialtyValidation,
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
 * Scans `s` left-to-right for the first `{` that starts a parseable JSON object,
 * always extending the candidate to the last `}` in the string.
 * This handles AI responses that include prose with stray braces before the real JSON.
 * Fails closed: returns null on any parse failure or if no candidate is found.
 */
function extractJsonObject(s: string): Record<string, unknown> | null {
  const lastBrace = s.lastIndexOf('}');
  if (lastBrace === -1) return null;
  let pos = 0;
  while (pos <= lastBrace) {
    const start = s.indexOf('{', pos);
    if (start === -1 || start > lastBrace) break;
    try {
      const candidate = JSON.parse(s.slice(start, lastBrace + 1));
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        return candidate as Record<string, unknown>;
      }
    } catch {
      pos = start + 1;
      continue;
    }
    break;
  }
  return null;
}

/**
 * Parses and validates the AI medical reviewer's JSON response.
 * Fail-closed: returns { pass: false } on any parse error, malformed structure,
 * or if ANY category dimension is "fail" — even when status claims "pass".
 */
export function parseMedicalReviewResponse(raw: string): { pass: boolean; result: MedicalReviewResult | null } {
  try {
    let s = raw.trim().replace(/^```(?:json)?\s*\n?/gi, '').replace(/\n?```\s*$/gi, '').trim();
    const parsed = extractJsonObject(s);
    if (!parsed) return { pass: false, result: null };
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

// ── Scope alignment ───────────────────────────────────────────────────────────

// Broad/permissive scope values that should never trigger a mismatch.
const BROAD_SCOPE_VALUES = new Set([
  '', 'all', 'all subjects', 'all systems', 'all topics',
  'any', 'any subject', 'any system', 'any topic',
  'general', 'mixed', 'multisystem',
  'select subject', 'select system', 'select topic',
]);

export function isBroadScope(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return BROAD_SCOPE_VALUES.has(String(v).toLowerCase().trim());
}

function normalizeForScope(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Alias maps ────────────────────────────────────────────────────────────────
// Each inner array is a synonym group; the first element is the canonical form.
// All comparisons use normalizeForScope output (lowercase, alphanum+space).

function canonicalizeSubject(s: string): string {
  const normalized = normalizeSubject(s);
  return normalized ? normalizeForScope(normalized) : normalizeForScope(s);
}

function canonicalizeSystem(s: string): string {
  const normalized = normalizeSystem(s);
  return normalized ? normalizeForScope(normalized) : normalizeForScope(s);
}

// ── System text detection (used when question metadata is absent) ─────────────
// Returns the canonical system name if the stem clearly signals it, else ''.
// Conservative: requires at least one high-specificity keyword.

const SYSTEM_TEXT_SIGNALS: Array<{ canonical: string; re: RegExp }> = [
  { canonical: 'Cardiovascular', re: /\b(coronary|myocardial|infarct|arrhythmia|endocarditis|atherosclerosis|aorta|angina|echocardiogram|pericardium|ventricular|atrial)\b/i },
  { canonical: 'Neurology',     re: /\b(neuron|cerebral|cortex|brainstem|spinal\s+cord|seizure|epilepsy|meningitis|encephalitis|cranial\s+nerve|myelination|demyelination|parkinson|alzheimer|multiple\s+sclerosis)\b/i },
  { canonical: 'Renal / Urinary', re: /\b(glomerulus|nephron|creatinine|glomerular|nephrotic|nephritic|hematuria|proteinuria|podocyte|collecting\s+duct|loop\s+of\s+henle|dialysis|polycystic\s+kidney)\b/i },
  { canonical: 'Gastrointestinal', re: /\b(hepatitis|cirrhosis|portal\s+hypertension|bilirubin|cholestasis|pancreatitis|amylase|lipase|celiac|crohn|ulcerative\s+colitis|esophageal|gastric|peptic\s+ulcer)\b/i },
  { canonical: 'Respiratory',   re: /\b(alveol|surfactant|fev1|fvc|bronchiectasis|emphysema|asthma|copd|pneumothorax|pleural\s+effusion|diffusion\s+capacity|pulmonary\s+embolism)\b/i },
  { canonical: 'Dermatology',   re: /\b(epidermis|dermis|melanocyte|keratinocyte|psoriasis|pemphigus|dermatitis|melanoma|sebaceous|alopecia)\b/i },
  { canonical: 'Endocrine',     re: /\b(thyroid|parathyroid|adrenal\s+cortex|pituitary|insulin\s+resistance|glucagon|cortisol|aldosterone|pheochromocytoma|acromegaly|cushing|addison)\b/i },
  { canonical: 'Hematology',    re: /\b(hemoglobin|hematocrit|platelet|coagulation|fibrin|thrombin|anemia|leukemia|lymphoma|hemophilia|sickle\s+cell|thalassemia|bone\s+marrow)\b/i },
  { canonical: 'Musculoskeletal', re: /\b(osteoporosis|rheumatoid\s+arthritis|gout|myopathy|muscular\s+dystrophy|osteomyelitis|osteosarcoma|tendon|ligament\s+tear)\b/i },
  { canonical: 'Reproductive',  re: /\b(uterus|ovary|testis|prostate|cervix|fallopian|placenta|ectopic\s+pregnancy|preeclampsia|endometriosis|fibroids|amenorrhea)\b/i },
];

function detectSystemFromStem(stem: string): string {
  for (const { canonical, re } of SYSTEM_TEXT_SIGNALS) {
    if (re.test(stem)) return canonical;
  }
  return '';
}

// ── Topic helpers ─────────────────────────────────────────────────────────────

/** All topic-like fields on a question object. */
type QuestionTopicFields = {
  topic?: string;
  testedConcept?: string;
  questionAngle?: string;
  canonicalTopic?: string;
  rawTopic?: string;
  weakSpotCategory?: string;
};

/**
 * Returns true when ANY topic-like metadata field on q partially matches normReq.
 * Uses substring match in either direction, mirroring the original topic logic.
 */
function anyTopicFieldMatches(q: QuestionTopicFields, normReq: string): boolean {
  const fields = [
    q.topic, q.testedConcept, q.questionAngle,
    q.canonicalTopic, q.rawTopic, q.weakSpotCategory,
  ];
  for (const f of fields) {
    const norm = normalizeForScope(String(f || ''));
    if (!norm || isBroadScope(norm)) continue;
    if (norm.includes(normReq) || normReq.includes(norm)) return true;
  }
  return false;
}

/**
 * Returns true when stem or option text contains enough keywords from the
 * requested topic to make a positive alignment call.
 * Used only as a fallback when all topic metadata fields are absent.
 */
function stemTopicKeywordMatch(stem: string, options: Array<{ text: string }>, reqTopic: string): boolean {
  const normReq = normalizeForScope(reqTopic);
  const topicWords = normReq.split(/\s+/).filter(w => w.length >= 4);
  if (topicWords.length === 0) return false;
  const optText = options.map(o => String(o.text || '')).join(' ');
  const haystack = normalizeForScope(stem + ' ' + optText);
  const hits = topicWords.filter(w => haystack.includes(w)).length;
  return hits >= Math.ceil(topicWords.length / 2);
}

/**
 * Universal scope-alignment check. Returns mismatch reasons for any axis
 * where the question demonstrably does not match the requested scope.
 *
 * Rules
 * ─────
 * • Broad requested values (All Systems, All Topics, Multisystem, …) always pass.
 * • Alias groups: "Cardiovascular" ≡ "Cardiology" ≡ "Cardiac"; "Nervous System"
 *   ≡ "Neurology"; "Pathology" ≡ "Pathophysiology"; etc.
 *
 * Subject axis
 *   • Metadata present and non-broad → alias-normalize and compare.
 *   • Metadata absent → skip (subject is a discipline label; text fallback is
 *     unreliable and would produce too many false rejections).
 *
 * System axis
 *   • Metadata present and non-broad → alias-normalize and compare.
 *   • Metadata absent + stem present → text detection; reject only if a DIFFERENT
 *     system is positively identified. No evidence → skip (don't reject).
 *
 * Topic axis
 *   • Checks all topic-like fields: topic, testedConcept, questionAngle,
 *     canonicalTopic, rawTopic, weakSpotCategory (any match passes).
 *   • All fields absent + stem/options present → keyword match.
 *   • No text available → skip (can't evaluate).
 */
export function scoreScopeAlignment(
  q: {
    subject?: string; system?: string; topic?: string;
    testedConcept?: string; questionAngle?: string;
    canonicalTopic?: string; rawTopic?: string; weakSpotCategory?: string;
    stem?: string;
    options?: Array<{ letter: string; text: string }>;
  },
  requestedScope?: { subject?: string; system?: string; topic?: string },
): string[] {
  if (!requestedScope) return [];

  const reasons: string[] = [];

  // ── Subject ─────────────────────────────────────────────────────────────────
  const reqSubject = requestedScope.subject ?? '';
  if (!isBroadScope(reqSubject)) {
    const actSubject = String(q.subject || '').trim();
    if (actSubject && !isBroadScope(actSubject)) {
      if (canonicalizeSubject(reqSubject) !== canonicalizeSubject(actSubject)) {
        reasons.push('off_scope_subject');
      }
    }
    // actSubject empty → skip (subject text fallback too unreliable)
  }

  // ── System ──────────────────────────────────────────────────────────────────
  const reqSystem = requestedScope.system ?? '';
  if (!isBroadScope(reqSystem)) {
    const actSystem = String(q.system || '').trim();
    const canonReq  = canonicalizeSystem(reqSystem);

    if (actSystem && !isBroadScope(actSystem) && normalizeForScope(actSystem) !== 'multisystem') {
      if (canonicalizeSystem(actSystem) !== canonReq) {
        reasons.push('off_scope_system');
      }
    } else if (!actSystem) {
      // Metadata absent — use text detection as fallback.
      // Only reject when text positively identifies a DIFFERENT system.
      const stem = String(q.stem || '');
      if (stem) {
        const detected = detectSystemFromStem(stem);
        if (detected && canonicalizeSystem(detected) !== canonReq) {
          reasons.push('off_scope_system');
        }
        // detected === '' or detected === canonReq → pass (no evidence of mismatch)
      }
      // No stem → skip (cannot evaluate)
    }
  }

  // ── Topic ───────────────────────────────────────────────────────────────────
  const reqTopic = requestedScope.topic ?? '';
  if (!isBroadScope(reqTopic)) {
    const normReq = normalizeForScope(reqTopic);

    // Determine whether the question carries any topic-like metadata.
    const TOPIC_FIELDS = [
      q.topic, q.testedConcept, q.questionAngle,
      q.canonicalTopic, q.rawTopic, q.weakSpotCategory,
    ];
    const hasTopicMeta = TOPIC_FIELDS.some(f => {
      const s = String(f || '').trim();
      return s.length > 0 && !isBroadScope(s);
    });

    if (hasTopicMeta) {
      // Metadata present — reject if no field matches.
      if (!anyTopicFieldMatches(q, normReq)) {
        reasons.push('off_scope_topic');
      }
    } else {
      // No topic metadata — try text fallback.
      const stem    = String(q.stem || '');
      const options = q.options ?? [];
      if (stem || options.length > 0) {
        if (!stemTopicKeywordMatch(stem, options, reqTopic)) {
          reasons.push('off_scope_topic');
        }
      }
      // No text at all → skip (cannot evaluate without evidence)
    }
  }

  return reasons;
}

// ── Repair prompt ─────────────────────────────────────────────────────────────

export function buildRepairPrompt(q: Record<string, unknown>, quality: QuestionQuality): string {
  const actionable = quality.rejectionReasons.filter(r => REPAIR_GUIDANCE[r]);
  if (actionable.length === 0) return '';
  const instructions = actionable.map(r => `- ${REPAIR_GUIDANCE[r]}`).join('\n');

  // Build a compact payload to stay within the repair call's token budget.
  // optionExplanations are large and only needed when the failure relates to them.
  const needsOptExpl = quality.rejectionReasons.includes('missing_option_explanations')
    || quality.rejectionReasons.includes('contradictory_explanation');

  const payload: Record<string, unknown> = {
    stem:        q.stem,
    options:     q.options,
    correct:     q.correct,
    explanation: q.explanation,
  };
  if (needsOptExpl && q.optionExplanations != null) {
    payload.optionExplanations = q.optionExplanations;
  }
  if (q.testedConcept) payload.testedConcept = q.testedConcept;
  if (q.topic)         payload.topic         = q.topic;

  return (
    `Fix the following USMLE question. Issues to fix:\n${instructions}\n\n` +
    `Original question (JSON):\n${JSON.stringify(payload, null, 2)}\n\n` +
    `Return ONLY the fixed question as a single JSON object matching the original schema. Raw JSON only.`
  );
}
