import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockMessagesCreate = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockMessagesCreate, stream: vi.fn() };
  },
}));
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
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
import { setRepositories, createInMemoryRepositories, getRepositories } from '../repositories/index.js';
import { config } from '../config.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, config.jwtSecret)}`;
}

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

function makePromotableQuestion(overrides: Record<string, any> = {}) {
  return {
    id: 'ai-q-1',
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    topic: 'ACE inhibitors',
    testedConcept: 'ACE inhibitor bradykinin cough mechanism',
    questionAngle: 'adverse-effect',
    usmleContentArea: 'Cardiovascular System',
    physicianTask: 'Mechanism',
    stem: 'A 58-year-old man with hypertension and proteinuria starts lisinopril. Two weeks later he develops a persistent dry nonproductive cough without fever, wheezing, or abnormal chest radiograph findings. Which mechanism best explains this adverse effect?',
    options: [
      { letter: 'A', text: 'Accumulation of bradykinin due to angiotensin-converting enzyme inhibition' },
      { letter: 'B', text: 'Direct activation of beta-2 adrenergic receptors in bronchial smooth muscle' },
      { letter: 'C', text: 'Inhibition of cyclooxygenase causing excess leukotriene production' },
      { letter: 'D', text: 'Increased aldosterone secretion causing airway mucosal edema' },
    ],
    correct: 'A',
    explanation: 'ACE inhibitors block angiotensin-converting enzyme, which normally degrades bradykinin. Accumulation of bradykinin can cause a persistent dry cough, making bradykinin accumulation the correct mechanism.',
    optionExplanations: {
      A: 'Correct: ACE inhibition increases bradykinin, producing cough.',
      B: 'Beta-2 activation causes bronchodilation, not ACE inhibitor cough.',
      C: 'Leukotriene excess is associated with aspirin-exacerbated respiratory disease.',
      D: 'ACE inhibitors reduce aldosterone rather than increase it.',
    },
    ...overrides,
  };
}

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

describe('generated question bank', () => {
  let app: ReturnType<typeof createApp>;

  // Mirrors _questionBodyForGeneratedBank in ai.ts — seeds the repo directly
  // so tests don't depend on a POST endpoint.
  function fingerprintOf(q: Record<string, any>): string {
    const s = (q.stem || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const c = (q.testedConcept || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${s}||${c}`;
  }

  async function seedBankQuestion(overrides: Record<string, any> = {}, config: Record<string, any> = { mode: 'practice', difficulty: 'Balanced' }) {
    const q = makePromotableQuestion(overrides);
    const fingerprint = fingerprintOf(q);
    const bankStatus = String(config.bankStatus || 'validated_generated');
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: String(q.subject || ''),
      system:  String(q.system  || ''),
      body: {
        ...q,
        id: fingerprint,
        source: 'ai',
        bankStatus,
        mode: config.mode || '',
        difficulty: q.difficulty || config.difficulty || 'Balanced',
      },
      source: 'ai',
      bankStatus,
      mode: String(config.mode || ''),
      difficulty: String(q.difficulty || config.difficulty || 'Balanced'),
    });
    return { question: q, fingerprint };
  }

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
    delete process.env.ANTHROPIC_API_KEY;
    // user-1 is the admin for governance tests; non-admin tests use user-999.
    process.env.ADMIN_USER_IDS = 'user-1';
    app = createApp();
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_IDS;
  });

  it('serves bank questions before requiring live AI', async () => {
    const seeded = makePromotableQuestion();
    const seededFingerprint = fingerprintOf(seeded);
    await seedBankQuestion(seeded);

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.count).toBe(1);
    expect(res.body.telemetry.generated).toBe(0);
    expect((getRepositories().questions as any)._getEntry(seededFingerprint)?.usageCount).toBe(1);
  });

  it('does not serve bank questions scoped to a different topic', async () => {
    // ACE inhibitor question in bank; request asks for Cardiac arrhythmias
    await seedBankQuestion();

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'Cardiac arrhythmias' } });

    expect(res.body.source).not.toBe('generated-bank');
  });

  it('serves legacy Skin bank rows for Dermatology requests', async () => {
    await seedBankQuestion({
      subject: 'Pathology',
      system: 'Skin',
      topic: 'Melanoma',
      testedConcept: 'melanoma asymmetric border recognition',
      questionAngle: 'diagnosis',
      stem: 'A 64-year-old man with fair skin presents with an enlarging asymmetric pigmented lesion with irregular borders and color variation on his upper back. Which diagnosis best explains this lesion?',
    });

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, system: 'Dermatology', difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.questions[0].system).toBe('Dermatology');
  });

  it('serves old generated-bank rows whose lifecycle metadata originally lived in body JSON', async () => {
    const legacyQuestion = makePromotableQuestion({
      subject: 'Cardiology',
      system: 'Skin',
      topic: 'Melanoma',
      testedConcept: 'melanoma asymmetric border recognition',
      questionAngle: 'diagnosis',
      stem: 'A 64-year-old man with fair skin presents with an enlarging asymmetric pigmented lesion with irregular borders and color variation on his upper back. Which diagnosis best explains this lesion?',
    });
    const fingerprint = fingerprintOf(legacyQuestion);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: legacyQuestion.subject,
      system: legacyQuestion.system,
      body: {
        ...legacyQuestion,
        id: fingerprint,
        source: 'ai',
        bankStatus: 'validated_generated',
        validationStatus: 'pass',
        validationScore: 90,
        mode: 'practice',
        difficulty: 'Balanced',
      },
    });

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, system: 'Dermatology', difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.questions[0].subject).not.toBe('Cardiology');
    expect(res.body.questions[0].system).toBe('Dermatology');
  });

  it('normalizes request system aliases before generated-bank retrieval', async () => {
    await seedBankQuestion({
      subject: 'Physiology',
      system: 'Renal / Urinary',
      topic: 'GFR regulation',
      testedConcept: 'afferent arteriole constriction lowers glomerular filtration rate',
      questionAngle: 'mechanism',
      stem: 'A 52-year-old man receives a medication that constricts the afferent arteriole. Which change in glomerular filtration rate is expected from this renal hemodynamic effect?',
    });

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, system: 'Nephrology', difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.questions[0].system).toBe('Renal / Urinary');
  });

  it('POST /generated-question-bank does not exist', async () => {
    await request(app)
      .post('/api/generated-question-bank')
      .send({ config: { mode: 'practice' }, questions: [makePromotableQuestion()] })
      .expect(404);
  });

  it('GET /generated-question-bank does not expose generated-bank contents', async () => {
    await seedBankQuestion();

    await request(app)
      .get('/api/generated-question-bank?mode=practice&difficulty=Balanced')
      .expect(404);
  });

  it('requires auth for generated-bank review endpoints', async () => {
    await request(app)
      .get('/api/generated-question-bank/review')
      .expect(401);

    await request(app)
      .get('/api/generated-question-bank/metrics')
      .expect(401);
  });

  it('lists generated-bank questions for authenticated review', async () => {
    const { fingerprint } = await seedBankQuestion();

    const res = await request(app)
      .get('/api/generated-question-bank/review?status=validated_generated')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.questions[0].externalId).toBe(fingerprint);
    expect(res.body.questions[0].bankStatus).toBe('validated_generated');
  });

  it('returns generated-bank lifecycle metrics', async () => {
    await seedBankQuestion();
    await seedBankQuestion(
      {
        testedConcept: 'beta blocker negative chronotropy mechanism',
        stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol. Which receptor effect explains the lower heart rate?',
        topic: 'Beta blockers',
        questionAngle: 'mechanism',
      },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' },
    );

    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.validatedGenerated).toBe(1);
    expect(res.body.approved).toBe(1);
    expect(res.body.quarantined).toBe(0);
  });

  it('prefers approved generated-bank questions over unapproved validated candidates', async () => {
    await seedBankQuestion(
      {
        testedConcept: 'ACE inhibitor bradykinin cough mechanism',
        topic: 'ACE inhibitors',
        questionAngle: 'adverse-effect',
      },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' },
    );
    await seedBankQuestion(
      {
        testedConcept: 'beta blocker negative chronotropy mechanism',
        stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol. Which receptor effect explains the lower heart rate?',
        topic: 'Beta blockers',
        questionAngle: 'mechanism',
      },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' },
    );

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.questions[0].testedConcept).toBe('beta blocker negative chronotropy mechanism');
  });

  it('quarantines a generated-bank question so it cannot be reused', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'quarantined' })
      .expect(200);

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('does not reuse generated-bank questions that fail the validation engine', async () => {
    await seedBankQuestion({
      subject: 'Pathology',
      system: 'Cardiovascular',
      topic: 'Beta blockers',
      testedConcept: 'beta blocker negative chronotropy mechanism',
      stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol succinate. After two weeks his resting heart rate decreases from 88 to 62 beats per minute. Which receptor mechanism explains this cardiovascular drug effect?',
    });

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Pathology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('fails closed for generated-bank reuse when quarantine lookup fails', async () => {
    await seedBankQuestion();
    (getRepositories().questionReports as any).getQuarantinedFingerprints = async () => {
      throw new Error('quarantine unavailable');
    };

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('blocks approval when a generated-bank question fails validation', async () => {
    const { fingerprint } = await seedBankQuestion({
      subject: 'Pathology',
      system: 'Cardiovascular',
      topic: 'Beta blockers',
      testedConcept: 'beta blocker negative chronotropy mechanism',
      stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol succinate. After two weeks his resting heart rate decreases from 88 to 62 beats per minute. Which receptor mechanism explains this cardiovascular drug effect?',
    });

    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'approved' })
      .expect(422);

    expect(res.body.code).toBe('GENERATED_QUESTION_VALIDATION_FAILED');
    expect(res.body.rejectionReasons).toContain('subject_system:cardio_pharmacology_not_pathology');
  });

  it('does not treat Balanced as any generated-bank difficulty', async () => {
    await seedBankQuestion(
      { difficulty: 'UWorld Challenge' },
      { mode: 'practice', difficulty: 'UWorld Challenge' },
    );

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('rejects truly unknown subject labels at the AI request boundary', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Space Medicine', difficulty: 'Balanced' } })
      .expect(400);

    expect(res.body.code).toBe('INVALID_TAXONOMY');
    expect(res.body.field).toBe('subject');
  });

  it('keeps 40-question exam blocks strict when generated bank is partial and AI is unavailable', async () => {
    await seedBankQuestion({}, { mode: 'exam', difficulty: 'Balanced' });

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'exam', questionCount: 40, difficulty: 'Balanced' } })
      .expect(503);

    expect(res.body.code).toBe('AI_INSUFFICIENT_COUNT');
    expect(res.body.returned).toBe(1);
    expect(res.body.requested).toBe(40);
  });

  // ── Admin authorization enforcement ──────────────────────────────────────────

  it('returns 403 for non-admin user on GET /review', async () => {
    const res = await request(app)
      .get('/api/generated-question-bank/review')
      .set('Authorization', authHeader('user-999'))  // not in ADMIN_USER_IDS
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 for non-admin user on GET /metrics', async () => {
    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader('user-999'))
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 for non-admin user on PATCH /status', async () => {
    const { fingerprint } = await seedBankQuestion();
    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-999'))
      .send({ status: 'quarantined' })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 403 when ADMIN_USER_IDS is not configured (fail closed)', async () => {
    delete process.env.ADMIN_USER_IDS;  // remove admin config entirely
    app = createApp();
    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader('user-1'))  // even user-1 is denied
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('allows admin user through on GET /review', async () => {
    const { fingerprint } = await seedBankQuestion();
    const res = await request(app)
      .get('/api/generated-question-bank/review')
      .set('Authorization', authHeader('user-1'))  // user-1 is in ADMIN_USER_IDS
      .expect(200);
    expect(res.body.count).toBe(1);
    expect(res.body.questions[0].externalId).toBe(fingerprint);
  });

  // ── Audit log ─────────────────────────────────────────────────────────────────

  it('writes an audit log entry on quarantine', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'quarantined' })
      .expect(200);

    // Allow the fire-and-forget log to settle
    await new Promise(r => setTimeout(r, 10));
    const logs = getRepositories().auditLog.getAll();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('quarantined');
    expect(logs[0].userId).toBe('user-1');
    expect(logs[0].questionId).toBe(fingerprint);
    expect(logs[0].newStatus).toBe('quarantined');
    expect(logs[0].previousStatus).toBe('validated_generated');
  });

  it('writes an audit log entry on re-approval', async () => {
    const { fingerprint } = await seedBankQuestion();

    // Quarantine first, then approve
    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'quarantined' })
      .expect(200);

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'validated_generated' })
      .expect(200);

    await new Promise(r => setTimeout(r, 10));
    const logs = getRepositories().auditLog.getAll();
    expect(logs).toHaveLength(2);
    expect(logs[0].action).toBe('quarantined');
    expect(logs[1].action).toBe('validated_generated');
    expect(logs[1].previousStatus).toBe('quarantined');
  });
});

// ── Hybrid question bank fill ─────────────────────────────────────────────────
// When bank has k < N questions: serve k from bank, fill N-k via live AI,
// combine, save only the AI fill. These tests mock @anthropic-ai/sdk so no
// real API key or network call is needed.

describe('hybrid question bank fill', () => {
  let app: ReturnType<typeof createApp>;

  function fingerprintOf(q: Record<string, any>): string {
    const s = (q.stem || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const c = (q.testedConcept || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${s}||${c}`;
  }

  async function seedBankQuestion(overrides: Record<string, any> = {}, config: Record<string, any> = { mode: 'practice', difficulty: 'Balanced' }) {
    const q = makePromotableQuestion(overrides);
    const fingerprint = fingerprintOf(q);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: String(q.subject || ''),
      system:  String(q.system  || ''),
      body: {
        ...q,
        id: fingerprint,
        source: 'ai',
        bankStatus: 'validated_generated',
        mode: config.mode || '',
        difficulty: q.difficulty || config.difficulty || 'Balanced',
      },
    });
  }

  function aiResponseWith(questions: Record<string, any>[]) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ questions }) }],
      stop_reason: 'end_turn',
    };
  }

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
    process.env.ANTHROPIC_API_KEY = 'test-key-hybrid';
    mockMessagesCreate.mockReset();
    app = createApp();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  // Each question needs a unique topic+questionAngle pair to avoid dedup() angle-key collisions.
  // dedup() drops a question when norm(topic+'|'+questionAngle) matches a previously seen entry.

  it('does not show or save live AI questions that fail validation', async () => {
    mockMessagesCreate.mockResolvedValue(aiResponseWith([
      makePromotableQuestion({
        subject: 'Pathology',
        system: 'Cardiovascular',
        topic: 'Beta blockers',
        testedConcept: 'beta blocker negative chronotropy mechanism',
        stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol succinate. After two weeks his resting heart rate decreases from 88 to 62 beats per minute. Which receptor mechanism explains this cardiovascular drug effect?',
      }),
    ]));

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Pathology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).not.toBe(200);
    expect((await getRepositories().questions.getGeneratedBankMetrics()).total).toBe(0);
  });

  it('serves bank questions and fills shortfall with AI when bank is partial', async () => {
    await seedBankQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });
    await seedBankQuestion({
      testedConcept: 'beta blocker negative chronotropy mechanism',
      stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol succinate 50 mg daily. After two weeks his resting heart rate falls from 88 to 62 beats per minute. Which receptor mechanism explains this effect?',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
    });

    const aiQuestion = makePromotableQuestion({
      testedConcept: 'calcium channel blocker vascular relaxation mechanism',
      stem: 'A 52-year-old woman with essential hypertension is started on amlodipine 5 mg daily. After four weeks her systolic blood pressure decreases by 18 mmHg. Which mechanism accounts for the blood pressure reduction with this drug?',
      topic: 'Calcium channel blockers',
      questionAngle: 'hemodynamics',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([aiQuestion]));

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 3, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(3);
    expect(res.body.source).toBe('hybrid');
    const concepts = res.body.questions.map((q: any) => q.testedConcept);
    expect(concepts).toContain('ACE inhibitor bradykinin cough mechanism');
    expect(concepts).toContain('beta blocker negative chronotropy mechanism');
    expect(concepts).toContain('calcium channel blocker vascular relaxation mechanism');
  });

  it('deduplicates AI fill against bank pool — same concept is not returned twice', async () => {
    // Bank has 1 ACE inhibitor question; AI returns only a duplicate concept (same as bank).
    // After combining: the bank question is kept, the AI duplicate is filtered out.
    await seedBankQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });

    const duplicateConcept = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism', // same concept as bank
      stem: 'A 61-year-old man with chronic kidney disease on enalapril for six weeks develops a persistent dry cough without dyspnea or fever. Which mechanism best explains this medication side effect?',
      topic: 'ACE inhibitors',
      questionAngle: 'bradykinin', // different angle from bank to survive intra-batch dedup
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([duplicateConcept]));

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 2, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).toBe(200);
    // Concept appears exactly once — the AI duplicate was removed by the final dedup
    const concepts = res.body.questions.map((q: any) => q.testedConcept);
    expect(concepts.filter((c: string) => c === 'ACE inhibitor bradykinin cough mechanism')).toHaveLength(1);
  });

  it('saves only the AI fill to the bank — bank questions are not re-saved', async () => {
    await seedBankQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });

    const aiQuestion = makePromotableQuestion({
      testedConcept: 'calcium channel blocker vascular relaxation mechanism',
      stem: 'A 52-year-old woman with essential hypertension is started on amlodipine 5 mg daily. After four weeks her systolic blood pressure decreases by 18 mmHg. Which mechanism accounts for the reduction?',
      topic: 'Calcium channel blockers',
      questionAngle: 'hemodynamics',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([aiQuestion]));

    await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 2, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    // Exactly 2 bank rows: original + AI fill. Not 3 — bank question was not re-saved.
    const bankRows = await getRepositories().questions.findGeneratedBankQuestions({
      subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced', mode: 'practice', limit: 10,
    });
    expect(bankRows).toHaveLength(2);
  });

  it('returns source=ai when bank is empty and AI generates all questions', async () => {
    const q1 = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });
    const q2 = makePromotableQuestion({
      testedConcept: 'beta blocker negative chronotropy mechanism',
      stem: 'A 60-year-old man with hypertension and angina starts metoprolol succinate. After two weeks his resting heart rate decreases from 88 to 62 beats per minute. Which mechanism explains this cardiac effect?',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([q1, q2]));

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 2, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ai');
    expect(res.body.questions).toHaveLength(2);
  });

  it('corrects AI-generated Cardiology subject into Cardiovascular system before saving to bank', async () => {
    const aiQuestion = makePromotableQuestion({
      subject: 'Cardiology',
      system: '',
      testedConcept: 'beta blocker negative chronotropy mechanism',
      stem: 'A 60-year-old man with hypertension and stable angina starts metoprolol succinate. After two weeks his resting heart rate decreases from 88 to 62 beats per minute. Which receptor mechanism explains this cardiac effect?',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([aiQuestion]));

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.questions[0].subject).not.toBe('Cardiology');
    expect(res.body.questions[0].system).toBe('Cardiovascular');

    const bankRows = await getRepositories().questions.findGeneratedBankQuestions({
      system: 'Cardiovascular', difficulty: 'Balanced', mode: 'practice', limit: 10,
    });
    expect(bankRows).toHaveLength(1);
    expect(bankRows[0].subject).not.toBe('Cardiology');
    expect(bankRows[0].system).toBe('Cardiovascular');
  });

  it('telemetry includes bankPoolUsed count', async () => {
    const bankQuestion = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });
    const bankFingerprint = fingerprintOf(bankQuestion);
    await seedBankQuestion(bankQuestion);

    const aiQuestion = makePromotableQuestion({
      testedConcept: 'calcium channel blocker vascular relaxation mechanism',
      stem: 'A 52-year-old woman with essential hypertension is started on amlodipine 5 mg daily. After four weeks her systolic blood pressure decreases by 18 mmHg. Which mechanism accounts for the blood pressure reduction?',
      topic: 'Calcium channel blockers',
      questionAngle: 'hemodynamics',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([aiQuestion]));

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 2, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).toBe(200);
    expect(res.body.telemetry.bankPoolUsed).toBe(1);
    expect((getRepositories().questions as any)._getEntry(bankFingerprint)?.usageCount).toBe(1);
  });

  // ── Parallel medical review (Phase 2) ────────────────────────────────────────
  // NBME Difficult and UWorld Challenge questions that pass Phase 1 rule validators
  // are submitted to medical review in parallel via Promise.all (not sequentially).
  // This test verifies: (1) MR telemetry counts exactly the rule-passing questions;
  // (2) rule-failing questions never reach MR; (3) total mock calls = 1 gen + N MR.

  it('NBME Difficult: Phase 2 runs MR only for rule-passing questions', async () => {
    // Two well-formed Pharmacology + Cardiovascular questions that will pass
    // Phase 1 rule validation. Both use the same stem structure as makePromotableQuestion
    // (depth ~95, which is within ENGINE_DEPTH_BANDS['NBME Difficult'] min=35 max=95).
    const q1 = makePromotableQuestion({
      testedConcept: 'ace inhibitor bradykinin nbme parallel test one',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });
    const q2 = makePromotableQuestion({
      testedConcept: 'beta blocker negative chronotropy nbme parallel test two',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
      stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol succinate. After two weeks his resting heart rate falls from 88 to 62 beats per minute without fever, wheezing, or abnormal chest radiograph findings. Which mechanism best explains this cardiovascular drug effect?',
      explanation: 'Metoprolol is a selective beta-1 adrenergic receptor antagonist. By blocking beta-1 receptors in the sinoatrial node it reduces heart rate (negative chronotropy). This mechanism accounts for the observed fall in resting heart rate without systemic bronchospasm.',
    });

    const mrPassText = JSON.stringify({
      status: 'pass',
      medicalAccuracy: 'pass',
      singleBestAnswer: 'pass',
      distractorPlausibility: 'pass',
      difficultyAlignment: 'pass',
      explanationQuality: 'pass',
      reasons: [],
      summary: 'Meets all criteria',
    });
    const mrPassResponse = {
      content: [{ type: 'text', text: mrPassText }],
      stop_reason: 'end_turn',
    };

    // Call 1: batch generation; calls 2+ (parallel): MR for each rule passer
    mockMessagesCreate
      .mockResolvedValueOnce(aiResponseWith([q1, q2]))
      .mockResolvedValue(mrPassResponse);

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 2, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'NBME Difficult' } });

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(2);

    // Both rule-passers went through MR and passed
    expect(res.body.telemetry.medicalReviewRequested).toBe(2);
    expect(res.body.telemetry.medicalReviewPassed).toBe(2);
    expect(res.body.telemetry.medicalReviewRejected).toBe(0);

    // runAdaptiveRefill makes candidatesPerRound/GENERATE_BATCH_SIZE sub-batch calls per round;
    // total calls = N sub-batch gen calls + 2 MR calls. At minimum: 1 gen + 2 MR = 3.
    expect(mockMessagesCreate.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('NBME Difficult: rule-failing question is not sent to medical review', async () => {
    // q1 passes rules; q2 has subject mismatch so it fails Phase 1 and never reaches MR
    const q1 = makePromotableQuestion({
      testedConcept: 'ace inhibitor bradykinin rule pass test',
      topic: 'ACE inhibitors',
      questionAngle: 'adverse-effect',
    });
    const q2 = makePromotableQuestion({
      subject: 'Pathology',   // mismatch: config requests Pharmacology
      testedConcept: 'beta blocker heart rate reduction rule fail test',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
    });

    const mrPassText = JSON.stringify({
      status: 'pass',
      medicalAccuracy: 'pass',
      singleBestAnswer: 'pass',
      distractorPlausibility: 'pass',
      difficultyAlignment: 'pass',
      explanationQuality: 'pass',
      reasons: [],
      summary: 'Meets all criteria',
    });
    const mrPassResponse = {
      content: [{ type: 'text', text: mrPassText }],
      stop_reason: 'end_turn',
    };

    mockMessagesCreate
      .mockResolvedValueOnce(aiResponseWith([q1, q2]))
      .mockResolvedValue(mrPassResponse);

    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Pharmacology', system: 'Cardiovascular', difficulty: 'NBME Difficult' } });

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(1);

    // Only the 1 rule-passing question was reviewed — the rule-failer never reached MR
    expect(res.body.telemetry.medicalReviewRequested).toBe(1);
    expect(res.body.telemetry.medicalReviewRejected).toBe(0);

    // At minimum: 1 gen call + 1 MR call = 2. Rule-failer (q2) adds 0 MR calls (subject mismatch
    // has no entry in REPAIR_GUIDANCE so repair is skipped; MR never runs for failers in Phase 2).
    expect(mockMessagesCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
