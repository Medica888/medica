/**
 * Canonical difficulty depth band definitions.
 *
 * ── Scale note ────────────────────────────────────────────────────────────────
 * ENGINE_DEPTH_BANDS is calibrated to reasoningDepth() in difficultyValidator.ts,
 * a full-question, presence-based scorer (stem + options + explanation).
 *
 * STRUCTURAL_DEPTH_THRESHOLDS is calibrated to scoreReasoningDepth() in
 * questionValidator.ts, a stem-only, sentence/term-count scorer.
 *
 * Both functions return 0–100 but on different scales — the same question
 * yields different values from each. The numeric thresholds intentionally
 * differ between the two tables. Do not apply ENGINE_DEPTH_BANDS to structural
 * depth scores, or STRUCTURAL_DEPTH_THRESHOLDS to engine depth scores.
 *
 * ── Third encoding ────────────────────────────────────────────────────────────
 * DIFFICULTY_RANGES.depthMin/depthMax in questionValidator.ts is a third
 * depth table used only by scoreDifficultyCalibration() for telemetry quality
 * scoring. It is also on the scoreReasoningDepth(stem) scale but has different
 * numeric bounds than STRUCTURAL_DEPTH_THRESHOLDS (e.g. Balanced max 70 there
 * vs 75 in ENGINE_DEPTH_BANDS; More Hard max 85 there vs 90 here). It is kept
 * separate because calibration scoring tolerates wider bands than hard gates.
 * Do not fold DIFFICULTY_RANGES into this file without verifying both scales
 * and intended leniency levels are the same.
 */

/** Engine depth bands — used by difficultyValidator.ts > validateDifficulty(). */
export const ENGINE_DEPTH_BANDS: Record<string, { min: number; max: number }> = {
  'More Easy':        { min: 0,  max: 35  },
  'Balanced':         { min: 20, max: 75  },
  'More Hard':        { min: 40, max: 90  },
  'NBME Difficult':   { min: 35, max: 95  },
  'UWorld Challenge': { min: 65, max: 100 },
};

/**
 * Structural depth thresholds — used by questionValidator.ts > checkDifficultyFit().
 *
 * Only the three difficulty tiers gated by checkDifficultyFit() are present;
 * Balanced and NBME Difficult are handled elsewhere and are intentionally absent.
 */
export const STRUCTURAL_DEPTH_THRESHOLDS = {
  'More Easy': {
    softWarnAbove: 35,
    hardRejectAbove: 60,
  },
  'More Hard': {
    warnBelow: 40,
  },
  'UWorld Challenge': {
    warnBelow: 65,
  },
} as const;
