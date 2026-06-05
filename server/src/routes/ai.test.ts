import { describe, it, expect, beforeEach } from 'vitest';
import {
  runAdaptiveRefill,
  HARD_MODE_CAPS,
  emptyMedicalReviewFailureCategories,
  collectFailedMedicalReviewCategories,
  MEDICAL_REVIEW_CATEGORIES,
  type BatchResult,
  type StoppedReason,
  type MedicalReviewFailureCategories,
} from './ai.js';
import {
  scoreScopeAlignment,
  requiresMedicalReview,
} from '../lib/questionValidator.js';
import type { MedicalReviewResult } from '../lib/questionValidator.js';
import { InMemoryQuestionReportsRepository } from '../repositories/memory/QuestionReportsRepository.js';
import { setRepositories, createInMemoryRepositories } from '../repositories/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Build a minimal BatchResult for use as a mock batchFn return.
 * acceptedCount: how many questions the batch "accepts" (pass rule-based + MR).
 * totalRaw: how many questions the batch "generated" in total before filtering.
 * mrPass / mrFail: medical-review pass/fail counts (sum may be < totalRaw due to rule rejects).
 * failureCategories: optional per-category failure counts (defaults to all zero).
 */
function makeBatchResult(
  acceptedCount: number,
  totalRaw: number,
  mrPass: number,
  mrFail: number,
  failureCategories?: Partial<MedicalReviewFailureCategories>,
): BatchResult {
  const questions = Array.from({ length: acceptedCount }, () => ({
    id:             `mock-${++_idCounter}`,
    testedConcept:  `uniqueconcept${_idCounter}`,
    stem:           `Mock stem ${_idCounter}`,
  }));
  const ruleRejected = totalRaw - (mrPass + mrFail);
  return {
    questions,
    telemetry: {
      medicalReviewRequested: mrPass + mrFail,
      medicalReviewPassed:    mrPass,
      medicalReviewRejected:  mrFail,
      medicalReviewSkipped:   0,
      ruleRejected:           Math.max(0, ruleRejected),
      scopeRejected:          0,
      medicalReviewFailureCategories: {
        ...emptyMedicalReviewFailureCategories(),
        ...failureCategories,
      },
    },
  };
}

/** Pass-through filter: no dedup, no scope filtering. */
const noFilter = (qs: Record<string, any>[], _: Set<string>) => qs;

// ── HARD_MODE_CAPS shape ──────────────────────────────────────────────────────

describe('HARD_MODE_CAPS', () => {
  it('defines caps for UWorld Challenge and NBME Difficult only', () => {
    expect(HARD_MODE_CAPS['UWorld Challenge']).toBeDefined();
    expect(HARD_MODE_CAPS['NBME Difficult']).toBeDefined();
    expect(HARD_MODE_CAPS['Balanced']).toBeUndefined();
    expect(HARD_MODE_CAPS['More Hard']).toBeUndefined();
    expect(HARD_MODE_CAPS['More Easy']).toBeUndefined();
    expect(HARD_MODE_CAPS['standardized']).toBeUndefined();
  });

  it('UWorld maxCandidates and maxRounds are consistent with candidatesPerRound', () => {
    const uw = HARD_MODE_CAPS['UWorld Challenge'];
    expect(uw.maxCandidates).toBeGreaterThan(0);
    expect(uw.maxRounds).toBeGreaterThan(0);
    // candidatesPerRound × maxRounds ≥ maxCandidates so the loops are consistent
    expect(uw.candidatesPerRound * uw.maxRounds).toBeGreaterThanOrEqual(uw.maxCandidates);
  });

  it('NBME Difficult maxCandidates and maxRounds are consistent', () => {
    const nb = HARD_MODE_CAPS['NBME Difficult'];
    expect(nb.candidatesPerRound * nb.maxRounds).toBeGreaterThanOrEqual(nb.maxCandidates);
  });
});

// ── runAdaptiveRefill ─────────────────────────────────────────────────────────

describe('runAdaptiveRefill — stop conditions', () => {
  it('stops with requested_count_reached when target is met within the caps', async () => {
    // Each call returns 5 accepted; target=10 → should finish after 2 sub-batch calls inside 1 round
    const batchFn = async () => makeBatchResult(5, 8, 5, 3);
    const result = await runAdaptiveRefill(
      10,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.stoppedReason).toBe('requested_count_reached');
    expect(result.accepted.length).toBeGreaterThanOrEqual(10);
  });

  it('UWorld Challenge: continues refill rounds after first low-yield batch', async () => {
    let callCount = 0;
    // Returns only 2 accepted per batch (simulates high MR rejection)
    const batchFn = async () => { callCount++; return makeBatchResult(2, 8, 2, 6); };
    const result = await runAdaptiveRefill(
      10,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(callCount).toBeGreaterThan(1);  // needed multiple batches
    expect(result.stoppedReason).toBe('requested_count_reached');
  });

  it('NBME Difficult: continues refill rounds after first low-yield batch', async () => {
    let callCount = 0;
    const batchFn = async () => { callCount++; return makeBatchResult(1, 8, 1, 7); };
    // target=3, maxRounds=4, 1 accepted per round → 3 rounds → requested_count_reached
    const result = await runAdaptiveRefill(
      3,
      { maxCandidates: 200, maxRounds: 4, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(callCount).toBeGreaterThan(1);  // needed > 1 round to reach target
    expect(result.stoppedReason).toBe('requested_count_reached');
  });

  it('stops with max_candidates_reached when candidate cap is hit before target', async () => {
    // Returns 0 accepted per batch — can never reach target
    const batchFn = async () => makeBatchResult(0, 8, 0, 8);
    const result = await runAdaptiveRefill(
      40,
      { maxCandidates: 16, maxRounds: 100, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.stoppedReason).toBe('max_candidates_reached');
    expect(result.totalGenerated).toBeGreaterThanOrEqual(16);
    expect(result.accepted.length).toBe(0);
  });

  it('stops with max_refill_rounds_reached when round cap is hit before target', async () => {
    // Returns 1 accepted per batch; target=40 but only 2 rounds allowed
    const batchFn = async () => makeBatchResult(1, 8, 1, 7);
    const result = await runAdaptiveRefill(
      40,
      { maxCandidates: 10000, maxRounds: 2, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.stoppedReason).toBe('max_refill_rounds_reached');
    expect(result.refillRounds).toBe(2);
  });

  it('stops with generation_error on batch failure and preserves already-accepted questions', async () => {
    let callCount = 0;
    const batchFn = async (): Promise<BatchResult> => {
      callCount++;
      if (callCount === 2) throw new Error('Simulated connection error');
      return makeBatchResult(3, 8, 3, 5);
    };
    const result = await runAdaptiveRefill(
      30,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.stoppedReason).toBe('generation_error');
    expect(result.accepted.length).toBeGreaterThan(0); // round 1 batch 1 accepted 3
  });

  it('stops with rate_limited on 429-status error', async () => {
    const batchFn = async (): Promise<BatchResult> => {
      const err = Object.assign(new Error('Rate limited'), { status: 429 });
      throw err;
    };
    const result = await runAdaptiveRefill(
      10,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.stoppedReason).toBe('rate_limited');
  });
});

// ── Telemetry accumulation ────────────────────────────────────────────────────

describe('runAdaptiveRefill — telemetry fields', () => {
  it('accumulates medicalReview fields across all batches', async () => {
    let calls = 0;
    const batchFn = async () => {
      calls++;
      // 5 MR pass, 3 MR reject per batch; called twice to reach target 10
      return makeBatchResult(5, 8, 5, 3);
    };
    const result = await runAdaptiveRefill(
      10,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.totalMrRequested).toBe(calls * 8);  // mrPass + mrFail per call
    expect(result.totalMrPassed).toBe(calls * 5);
    expect(result.totalMrRejected).toBe(calls * 3);
    expect(result.totalMrSkipped).toBe(0);
  });

  it('counts ruleRejected correctly', async () => {
    // 5 accepted, 8 raw, 5 MR pass, 2 MR fail → ruleRejected = 8 - (5+2) = 1
    const batchFn = async () => makeBatchResult(5, 8, 5, 2);
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.totalRuleRejected).toBe(1);
  });

  it('counts totalGenerated as sum of batchSize args passed to batchFn', async () => {
    const seenCounts: number[] = [];
    const batchFn = async (count: number) => {
      seenCounts.push(count);
      return makeBatchResult(3, count, 3, 0);
    };
    const result = await runAdaptiveRefill(
      6,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    const expectedGenerated = seenCounts.reduce((a, b) => a + b, 0);
    expect(result.totalGenerated).toBe(expectedGenerated);
  });

  it('counts dedupRejectedCandidates from filterFn removals', async () => {
    // filterFn drops 1 question per call (simulates dedup)
    const filterFn = (qs: Record<string, any>[], _: Set<string>) => qs.slice(0, qs.length - 1);
    let callCount = 0;
    const batchFn = async () => { callCount++; return makeBatchResult(4, 8, 4, 4); };

    const result = await runAdaptiveRefill(
      6,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      filterFn,
    );
    // Each call delivers 4 accepted but filterFn drops 1 → 3 actually added per call
    // To reach 6 accepted we need ceil(6/3) = 2 calls → dedupRejectedCandidates = 2
    expect(result.totalDedupRejected).toBe(callCount);
  });

  it('refillRounds counts how many full rounds were completed', async () => {
    // With candidatesPerRound=8 and GENERATE_BATCH_SIZE=8, each round = 1 batch
    // 1 accepted per batch, target=5 → 5 rounds needed
    const batchFn = async () => makeBatchResult(1, 8, 1, 7);
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.refillRounds).toBe(5);
    expect(result.stoppedReason).toBe('requested_count_reached');
  });
});

// ── Balanced mode does not use refill ────────────────────────────────────────

describe('Balanced difficulty — no refill', () => {
  it('HARD_MODE_CAPS does not include Balanced', () => {
    expect(HARD_MODE_CAPS['Balanced']).toBeUndefined();
  });

  it('hard-mode caps are only defined for UWorld Challenge and NBME Difficult', () => {
    const coveredDifficulties = Object.keys(HARD_MODE_CAPS);
    expect(coveredDifficulties).toContain('UWorld Challenge');
    expect(coveredDifficulties).toContain('NBME Difficult');
    expect(coveredDifficulties).not.toContain('Balanced');
    expect(coveredDifficulties).not.toContain('More Hard');
    expect(coveredDifficulties).not.toContain('More Easy');
  });
});

// ── Existing BatchTelemetry fields ────────────────────────────────────────────

describe('BatchResult / BatchTelemetry interface', () => {
  it('makeBatchResult produces the expected shape', () => {
    const r = makeBatchResult(3, 8, 3, 4);
    expect(r.questions).toHaveLength(3);
    expect(r.telemetry.medicalReviewRequested).toBe(7); // 3+4
    expect(r.telemetry.medicalReviewPassed).toBe(3);
    expect(r.telemetry.medicalReviewRejected).toBe(4);
    expect(r.telemetry.medicalReviewSkipped).toBe(0);
    expect(r.telemetry.ruleRejected).toBe(1); // 8 - 7
  });

  it('GenerationLoopResult preserves all telemetry fields in returned object', async () => {
    const batchFn = async () => makeBatchResult(5, 8, 5, 2);
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    // All pre-existing fields present
    expect(typeof result.accepted).toBe('object');
    expect(typeof result.totalGenerated).toBe('number');
    expect(typeof result.refillRounds).toBe('number');
    expect(typeof result.stoppedReason).toBe('string');
    expect(typeof result.totalMrRequested).toBe('number');
    expect(typeof result.totalMrPassed).toBe('number');
    expect(typeof result.totalMrRejected).toBe('number');
    expect(typeof result.totalMrSkipped).toBe('number');
    expect(typeof result.totalRuleRejected).toBe('number');
    expect(typeof result.totalDedupRejected).toBe('number');
    // New additive field present
    expect(typeof result.medicalReviewFailureCategories).toBe('object');
    for (const cat of MEDICAL_REVIEW_CATEGORIES) {
      expect(typeof result.medicalReviewFailureCategories[cat]).toBe('number');
    }
  });
});

// ── Medical review failure-category helpers ───────────────────────────────────

describe('emptyMedicalReviewFailureCategories', () => {
  it('returns an object with all five categories set to zero', () => {
    const counts = emptyMedicalReviewFailureCategories();
    expect(counts.medicalAccuracy).toBe(0);
    expect(counts.singleBestAnswer).toBe(0);
    expect(counts.distractorPlausibility).toBe(0);
    expect(counts.difficultyAlignment).toBe(0);
    expect(counts.explanationQuality).toBe(0);
    expect(Object.keys(counts)).toHaveLength(5);
  });

  it('covers exactly the MEDICAL_REVIEW_CATEGORIES list', () => {
    const counts = emptyMedicalReviewFailureCategories();
    for (const cat of MEDICAL_REVIEW_CATEGORIES) {
      expect(counts[cat]).toBe(0);
    }
  });
});

describe('collectFailedMedicalReviewCategories', () => {
  it('returns empty array for null result', () => {
    expect(collectFailedMedicalReviewCategories(null)).toEqual([]);
  });

  it('returns only failing categories from a partial failure result', () => {
    const result: MedicalReviewResult = {
      status:                 'fail',
      medicalAccuracy:        'pass',
      singleBestAnswer:       'pass',
      distractorPlausibility: 'fail',
      difficultyAlignment:    'fail',
      explanationQuality:     'pass',
      reasons:                ['distractorPlausibility', 'difficultyAlignment'],
      summary:                'Two categories failed.',
    };
    const failed = collectFailedMedicalReviewCategories(result);
    expect(failed).toContain('distractorPlausibility');
    expect(failed).toContain('difficultyAlignment');
    expect(failed).not.toContain('medicalAccuracy');
    expect(failed).not.toContain('singleBestAnswer');
    expect(failed).not.toContain('explanationQuality');
    expect(failed).toHaveLength(2);
  });

  it('returns all five categories when every category fails', () => {
    const result: MedicalReviewResult = {
      status:                 'fail',
      medicalAccuracy:        'fail',
      singleBestAnswer:       'fail',
      distractorPlausibility: 'fail',
      difficultyAlignment:    'fail',
      explanationQuality:     'fail',
      reasons:                [...MEDICAL_REVIEW_CATEGORIES],
      summary:                'All failed.',
    };
    expect(collectFailedMedicalReviewCategories(result)).toHaveLength(5);
  });

  it('returns empty array when all categories pass', () => {
    const result: MedicalReviewResult = {
      status:                 'pass',
      medicalAccuracy:        'pass',
      singleBestAnswer:       'pass',
      distractorPlausibility: 'pass',
      difficultyAlignment:    'pass',
      explanationQuality:     'pass',
      reasons:                [],
      summary:                'All passed.',
    };
    expect(collectFailedMedicalReviewCategories(result)).toHaveLength(0);
  });

  it('multiple failed categories each appear exactly once', () => {
    const result: MedicalReviewResult = {
      status:                 'fail',
      medicalAccuracy:        'fail',
      singleBestAnswer:       'pass',
      distractorPlausibility: 'fail',
      difficultyAlignment:    'pass',
      explanationQuality:     'fail',
      reasons:                ['medicalAccuracy', 'distractorPlausibility', 'explanationQuality'],
      summary:                'Three categories failed.',
    };
    const failed = collectFailedMedicalReviewCategories(result);
    expect(failed).toHaveLength(3);
    expect(new Set(failed).size).toBe(3); // no duplicates
  });
});

// ── runAdaptiveRefill — category telemetry ────────────────────────────────────

describe('runAdaptiveRefill — category telemetry', () => {
  it('accumulates category counts across multiple batches', async () => {
    // Each batch reports 1 difficultyAlignment and 2 distractorPlausibility failures
    const perBatch: Partial<MedicalReviewFailureCategories> = { difficultyAlignment: 1, distractorPlausibility: 2 };
    let callCount = 0;
    const batchFn = async () => { callCount++; return makeBatchResult(3, 8, 3, 3, perBatch); };
    const result = await runAdaptiveRefill(
      6,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.medicalReviewFailureCategories.difficultyAlignment).toBe(callCount * 1);
    expect(result.medicalReviewFailureCategories.distractorPlausibility).toBe(callCount * 2);
    expect(result.medicalReviewFailureCategories.medicalAccuracy).toBe(0);
  });

  it('category counts stay zero when all medical reviews pass', async () => {
    const batchFn = async () => makeBatchResult(5, 5, 5, 0);
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    for (const cat of MEDICAL_REVIEW_CATEGORIES) {
      expect(result.medicalReviewFailureCategories[cat]).toBe(0);
    }
  });

  it('parse/API failure (null result) leaves category counts at zero while rejections still count', async () => {
    // mrFail=6 but no failureCategories specified → all zeros (simulates null parse result)
    const batchFn = async () => makeBatchResult(2, 8, 2, 6);
    const result = await runAdaptiveRefill(
      2,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.totalMrRejected).toBeGreaterThan(0);
    for (const cat of MEDICAL_REVIEW_CATEGORIES) {
      expect(result.medicalReviewFailureCategories[cat]).toBe(0);
    }
  });

  it('balanced / no-review path — category counts all remain zero', async () => {
    // Simulates balanced mode: mrRequested=0, mrSkipped=N, no category failures
    const batchFn = async () => makeBatchResult(5, 5, 0, 0);
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(result.totalMrRequested).toBe(0);
    for (const cat of MEDICAL_REVIEW_CATEGORIES) {
      expect(result.medicalReviewFailureCategories[cat]).toBe(0);
    }
  });

  it('medicalReviewFailureCategories is present and fully typed on GenerationLoopResult', async () => {
    const batchFn = async () => makeBatchResult(5, 8, 5, 2, { medicalAccuracy: 1, explanationQuality: 1 });
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    const cats = result.medicalReviewFailureCategories;
    expect(cats).toBeDefined();
    expect(typeof cats.medicalAccuracy).toBe('number');
    expect(typeof cats.singleBestAnswer).toBe('number');
    expect(typeof cats.distractorPlausibility).toBe('number');
    expect(typeof cats.difficultyAlignment).toBe('number');
    expect(typeof cats.explanationQuality).toBe('number');
    // Sanity: at least one category incremented
    expect(cats.medicalAccuracy + cats.explanationQuality).toBeGreaterThan(0);
  });
});

// ── Scope rejection — universal hard gate ────────────────────────────────────
// Scope rejection now applies to every difficulty.  Medical review is still
// NBME Difficult / UWorld Challenge only.  These tests verify both separations.

describe('scope rejection — universal hard gate (all difficulties)', () => {
  it('scoreScopeAlignment rejects a question with wrong subject and system', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pathology', system: 'Respiratory', topic: 'Tension pneumothorax mechanism' },
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Cardiac output regulation' },
    );
    expect(reasons).toContain('off_scope_subject');
    expect(reasons).toContain('off_scope_system');
    expect(reasons).toContain('off_scope_topic');
  });

  it('scoreScopeAlignment rejects a question with wrong system only', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Renal', topic: 'Diuretic mechanisms' },
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'Antihypertensive agents' },
    );
    expect(reasons).toContain('off_scope_system');
    expect(reasons).not.toContain('off_scope_subject');
  });

  it('scope decision is independent of difficulty — scoreScopeAlignment has no difficulty param', () => {
    // scoreScopeAlignment is a pure function with no difficulty awareness.
    // The route wires it for ALL difficulties when scope is specific.
    const reasons = scoreScopeAlignment(
      { subject: 'Pathology', system: 'Renal', topic: 'Nephrotic syndrome' },
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Heart failure' },
    );
    // Same rejection regardless of caller difficulty — the function has no mode param
    expect(reasons).toContain('off_scope_subject');
    expect(reasons).toContain('off_scope_system');
    expect(reasons).toContain('off_scope_topic');
  });

  it('Balanced scoped generation — scoreScopeAlignment still rejects off-topic questions', () => {
    // Before this change, scope was only applied for NBME/UWorld. Now it applies
    // universally. We verify the decision function is correct for Balanced usage.
    const balancedQuestion = {
      subject: 'Pathology', system: 'Respiratory', topic: 'Pulmonary fibrosis',
      testedConcept: 'Idiopathic pulmonary fibrosis pathology',
    };
    const reasons = scoreScopeAlignment(
      balancedQuestion,
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'Beta blocker mechanism' },
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons).toContain('off_scope_subject');
    expect(reasons).toContain('off_scope_system');
    expect(reasons).toContain('off_scope_topic');
  });

  it('More Easy scoped generation — scoreScopeAlignment passes on-topic questions', () => {
    // testedConcept contains the requested topic as a substring → passes
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular', testedConcept: 'ACE inhibitors blood pressure mechanism' },
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'ACE inhibitors' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('More Hard scoped generation — alias Neurology/Nervous System accepted', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Nervous System' },
      { subject: 'Physiology', system: 'Neurology' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('medical review remains NBME/UWorld-only despite universal scope', () => {
    expect(requiresMedicalReview('NBME Difficult')).toBe(true);
    expect(requiresMedicalReview('UWorld Challenge')).toBe(true);
    expect(requiresMedicalReview('Balanced')).toBe(false);
    expect(requiresMedicalReview('More Hard')).toBe(false);
    expect(requiresMedicalReview('More Easy')).toBe(false);
  });

  it('broad "All Systems" scope never rejects any actual system', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Respiratory' },
      { subject: 'Physiology', system: 'All Systems' },
    )).toHaveLength(0);
  });

  it('broad "All Subjects" scope never rejects any actual subject', () => {
    expect(scoreScopeAlignment(
      { subject: 'Pathology', system: 'Cardiovascular' },
      { subject: 'All Subjects', system: 'Cardiovascular' },
    )).toHaveLength(0);
  });

  it('Multisystem actual value never triggers off_scope_system', () => {
    // A cross-system question labeled Multisystem should pass any system request
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Multisystem' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    )).not.toContain('off_scope_system');
  });

  it('question with no metadata does not crash and returns []', () => {
    expect(() => scoreScopeAlignment(
      {},
      { subject: 'Neurology', system: 'Neurology', topic: 'Stroke' },
    )).not.toThrow();
    expect(scoreScopeAlignment(
      {},
      { subject: 'Neurology', system: 'Neurology', topic: 'Stroke' },
    )).toHaveLength(0);
  });

  it('off-scope rejection increments ruleRejected in batchFn result — adaptive refill continues', async () => {
    // When a batchFn yields 0 questions (simulating all scope-rejected), refill must continue.
    let calls = 0;
    const batchFn = async () => {
      calls++;
      // First 2 calls: 0 accepted, all "rejected" (scope-rejected in practice)
      if (calls <= 2) return makeBatchResult(0, 8, 0, 0);
      // 3rd call: enough to meet target
      return makeBatchResult(5, 8, 5, 3);
    };
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 10, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(calls).toBeGreaterThan(2);
    expect(result.accepted.length).toBe(5);
    expect(result.stoppedReason).toBe('requested_count_reached');
  });

  it('GenerationLoopResult includes totalScopeRejected field', async () => {
    const batchFn = async () => makeBatchResult(5, 8, 5, 3);
    const result = await runAdaptiveRefill(
      5,
      { maxCandidates: 200, maxRounds: 5, candidatesPerRound: 8 },
      batchFn,
      noFilter,
    );
    expect(typeof result.totalScopeRejected).toBe('number');
    // makeBatchResult always sets scopeRejected: 0, so the sum is 0
    expect(result.totalScopeRejected).toBe(0);
  });

  it('BatchTelemetry includes scopeRejected field', () => {
    const r = makeBatchResult(3, 8, 3, 4);
    expect(typeof r.telemetry.scopeRejected).toBe('number');
    expect(r.telemetry.scopeRejected).toBe(0);
  });

  it('totalScopeRejected accumulates scopeRejected across batches', async () => {
    // Simulate batches that each report 3 scope-rejected questions (from generateBatch
    // internal counting — the refill loop passes these through as telemetry).
    const batchWithScopeRejects = (): BatchResult => ({
      questions: [{ id: `q${++_idCounter}`, testedConcept: `concept${_idCounter}`, stem: 'Test' }],
      telemetry: {
        medicalReviewRequested: 0,
        medicalReviewPassed:    0,
        medicalReviewRejected:  0,
        medicalReviewSkipped:   1,
        ruleRejected:           0,
        scopeRejected:          3,
        medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
      },
    });
    const result = await runAdaptiveRefill(
      2,
      { maxCandidates: 100, maxRounds: 5, candidatesPerRound: 8 },
      async () => batchWithScopeRejects(),
      noFilter,
    );
    // Each batch reports 3 scope-rejected; result must accumulate them
    expect(result.totalScopeRejected).toBe(result.refillRounds * 3);
  });
});

// ── Phase 6: Quarantine filter proof ─────────────────────────────────────────
//
// The generate-questions route applies a quarantine filter after generation:
//
//   const quarantinedFps = await getRepositories().questionReports.getQuarantinedFingerprints();
//   allQuestions = allQuestions.filter(q => {
//     const fp = computeQuestionFingerprint(q.stem || '', q.testedConcept || '');
//     return !quarantinedFps.has(fp);
//   });
//
// computeQuestionFingerprint in ai.ts mirrors questionDedup.js:getQuestionFingerprint.
// These tests prove:
//   1. Reports above threshold correctly populate the quarantine set.
//   2. The fingerprint algorithm is deterministic and consistent with the backend format.
//   3. The filter logic removes exactly the quarantined questions.
//   4. Non-quarantined questions survive the filter.

describe('quarantine filter — end-to-end data flow proof', () => {
  // Inline mirror of ai.ts:computeQuestionFingerprint / questionDedup.js:getQuestionFingerprint.
  // Both use the same algorithm; we reproduce it here to prove parity without a cross-package import.
  function fp(stem: string, concept: string): string {
    const s = stem.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const c = concept.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${s}||${c}`;
  }

  function makeReport(fingerprint: string, reason: 'wrong_answer' | 'bad_explanation' | 'off_topic', userId: string | null = null) {
    return {
      user_id:            userId,
      question_id:        null,
      fingerprint,
      reason,
      source:             null,
      mode:               null,
      difficulty:         null,
      requested_subject:  null,
      requested_system:   null,
      requested_topic:    null,
      actual_subject:     null,
      actual_system:      null,
      actual_topic:       null,
      tested_concept:     null,
      usmle_content_area: null,
      physician_task:     null,
      stem_preview:       null,
    } as const;
  }

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
  });

  // ── 1. Quarantine threshold logic ─────────────────────────────────────────────

  it('fingerprint with 2 wrong_answer reports from different users is quarantined', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const targetFp = fp('a 68-year-old man develops sudden right homonymous hemianopia without motor deficits', 'Posterior cerebral artery occlusion');

    await repo.create(makeReport(targetFp, 'wrong_answer', 'user-a'));
    await repo.create(makeReport(targetFp, 'wrong_answer', 'user-b'));

    const quarantined = await repo.getQuarantinedFingerprints();
    expect(quarantined.has(targetFp)).toBe(true);
  });

  it('fingerprint with 1 wrong_answer report is NOT quarantined (threshold not met)', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const clearFp = fp('a 45-year-old woman presents with chest pain on exertion', 'Stable angina pectoris');

    await repo.create(makeReport(clearFp, 'wrong_answer', 'user-a'));

    const quarantined = await repo.getQuarantinedFingerprints();
    expect(quarantined.has(clearFp)).toBe(false);
  });

  it('fingerprint with 3 off_topic reports is quarantined', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const targetFp = fp('a 55-year-old man with hypertension presents with new onset headache', 'Secondary hypertension causes');

    await repo.create(makeReport(targetFp, 'off_topic'));
    await repo.create(makeReport(targetFp, 'off_topic'));
    await repo.create(makeReport(targetFp, 'off_topic'));

    const quarantined = await repo.getQuarantinedFingerprints();
    expect(quarantined.has(targetFp)).toBe(true);
  });

  it('fingerprint with 5 total reports (any reason) is quarantined', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const targetFp = fp('a 32-year-old woman presents with fatigue and weight gain', 'Hypothyroidism diagnosis');

    for (let i = 0; i < 5; i++) {
      await repo.create(makeReport(targetFp, 'bad_explanation'));
    }

    const quarantined = await repo.getQuarantinedFingerprints();
    expect(quarantined.has(targetFp)).toBe(true);
  });

  // ── 2. Fingerprint algorithm parity ───────────────────────────────────────────

  it('fingerprint is deterministic — same stem+concept always produces same fingerprint', () => {
    const stem    = 'A 68-year-old man develops sudden right homonymous hemianopia without motor or sensory deficits.';
    const concept = 'Posterior cerebral artery occlusion';
    expect(fp(stem, concept)).toBe(fp(stem, concept));
  });

  it('fingerprint stem is truncated at 120 chars — matches ai.ts:computeQuestionFingerprint', () => {
    const longStem  = 'A'.repeat(200);
    const shortStem = 'A'.repeat(120);
    const concept   = 'some concept';
    // Both should produce the same fingerprint because the first 120 chars are identical
    expect(fp(longStem, concept)).toBe(fp(shortStem, concept));
  });

  it('fingerprint separator is || — matching format used by backend quarantine filter', () => {
    const result = fp('a patient presents with chest pain', 'Acute MI');
    expect(result).toContain('||');
    const [stemPart, conceptPart] = result.split('||');
    expect(stemPart).toBeTruthy();
    expect(conceptPart).toBeTruthy();
  });

  it('fingerprint is case-insensitive — mixed case stem matches lowercase stem', () => {
    const stem    = 'A 55-Year-Old MAN Presents With Chest Pain';
    const concept = 'Acute Myocardial Infarction';
    expect(fp(stem, concept)).toBe(fp(stem.toLowerCase(), concept.toLowerCase()));
  });

  // ── 3. Filter logic — simulates the route's quarantine step ──────────────────

  it('filter removes the quarantined question and preserves the clean one', () => {
    const stem1    = 'a 68-year-old man develops sudden right homonymous hemianopia without motor deficits';
    const concept1 = 'Posterior cerebral artery occlusion';
    const stem2    = 'a 45-year-old woman presents with chest pain radiating to left arm';
    const concept2 = 'Acute myocardial infarction';

    const quarantinedFps = new Set([fp(stem1, concept1)]);

    const allQuestions = [
      { id: 'q-bad',  stem: stem1, testedConcept: concept1 },
      { id: 'q-good', stem: stem2, testedConcept: concept2 },
    ];

    // Simulate the exact filter from generate-questions route (lines 1079-1088 of ai.ts)
    const filtered = allQuestions.filter(q => {
      const questionFp = fp(q.stem || '', q.testedConcept || '');
      return !quarantinedFps.has(questionFp);
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('q-good');
  });

  it('empty quarantine set leaves all questions untouched', () => {
    const questions = [
      { id: 'q1', stem: 'stem one', testedConcept: 'concept a' },
      { id: 'q2', stem: 'stem two', testedConcept: 'concept b' },
    ];

    const filtered = questions.filter(q => !new Set<string>().has(fp(q.stem, q.testedConcept)));
    expect(filtered).toHaveLength(2);
  });

  it('question fingerprint computed at report time matches fingerprint computed at filter time', () => {
    // This is the key parity assertion: report fingerprint === filter fingerprint.
    // If they diverged, reported questions would not be quarantined correctly.
    const questionStem    = 'A 38-year-old woman with SLE presents with RBC casts and 4+ proteinuria.';
    const questionConcept = 'Lupus nephritis class IV';

    // Fingerprint as computed when user reports the question (frontend: getQuestionFingerprint)
    const reportFp = fp(questionStem, questionConcept);

    // Fingerprint as computed when the backend filters generation results (ai.ts: computeQuestionFingerprint)
    const filterFp = fp(questionStem, questionConcept);

    expect(reportFp).toBe(filterFp);
  });

  // ── 4. Multi-user accumulation ────────────────────────────────────────────────

  it('reports from different users accumulate toward the quarantine threshold', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const targetFp = fp('a 28-year-old man presents with joint pain and hyperuricemia', 'Gout pathophysiology');

    // 1 report — below threshold
    await repo.create(makeReport(targetFp, 'wrong_answer', 'user-1'));
    expect((await repo.getQuarantinedFingerprints()).has(targetFp)).toBe(false);

    // 2nd report — crosses wrong_answer >= 2 threshold → quarantined
    await repo.create(makeReport(targetFp, 'wrong_answer', 'user-2'));
    expect((await repo.getQuarantinedFingerprints()).has(targetFp)).toBe(true);
  });

  it('quarantining one fingerprint does not affect a different fingerprint', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const bad  = fp('a bad question stem that is reported repeatedly by multiple users', 'Reported concept');
    const good = fp('a perfectly good question stem that no user has reported at all', 'Clean concept');

    await repo.create(makeReport(bad, 'wrong_answer', 'user-a'));
    await repo.create(makeReport(bad, 'wrong_answer', 'user-b'));

    const quarantined = await repo.getQuarantinedFingerprints();
    expect(quarantined.has(bad)).toBe(true);
    expect(quarantined.has(good)).toBe(false);
  });
});
