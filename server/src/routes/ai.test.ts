import { describe, it, expect } from 'vitest';
import {
  runAdaptiveRefill,
  HARD_MODE_CAPS,
  type BatchResult,
  type StoppedReason,
} from './ai.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;

/**
 * Build a minimal BatchResult for use as a mock batchFn return.
 * acceptedCount: how many questions the batch "accepts" (pass rule-based + MR).
 * totalRaw: how many questions the batch "generated" in total before filtering.
 * mrPass / mrFail: medical-review pass/fail counts (sum may be < totalRaw due to rule rejects).
 */
function makeBatchResult(acceptedCount: number, totalRaw: number, mrPass: number, mrFail: number): BatchResult {
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
    // All expected fields present
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
  });
});
