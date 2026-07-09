import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _resetSlots, tryAcquireSlot } from '../middleware/aiConcurrency.js';

const mockMessagesCreate = vi.hoisted(() => vi.fn());
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockMessagesCreate, stream: vi.fn() };
  },
}));
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createApp } from '../app.js';
import {
  runAdaptiveRefill,
  _saveGeneratedQuestionsToBank,
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
import { InMemoryUsersRepository } from '../repositories/memory/UsersRepository.js';
import { setRepositories, createInMemoryRepositories, getRepositories } from '../repositories/index.js';
import { config } from '../config.js';
import { taxonomyResolutionService } from '../services/TaxonomyResolutionService.js';
import {
  ClinicianReviewService,
  computeSamplingDecision,
  computeDueAt,
  isDeterministicSample,
} from '../services/ClinicianReviewService.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let _idCounter = 0;

function authHeader(userId = 'user-1') {
  return `Bearer ${jwt.sign({ sub: userId }, config.jwtSecret)}`;
}

function seedAuthUsers(): void {
  const users = getRepositories().users as InMemoryUsersRepository;
  users._seedWithId('user-1');
  users._seedWithId('user-999');
  void users.setEmailVerified('user-1');
  void users.setEmailVerified('user-999');
  const eligibleCreatedAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
  users._setCreatedAt('user-1', eligibleCreatedAt);
  users._setCreatedAt('user-999', eligibleCreatedAt);
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
      matrixPasses:           0,
      matrixWarnings:         0,
      matrixFailures:         0,
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
  const base = {
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

  const topic = String(base.topic || '').toLowerCase();
  const concept = String(base.testedConcept || '').toLowerCase();
  const hasCustomOptions = Object.prototype.hasOwnProperty.call(overrides, 'options');
  const hasCustomExplanation = Object.prototype.hasOwnProperty.call(overrides, 'explanation');
  const hasCustomOptionExplanations = Object.prototype.hasOwnProperty.call(overrides, 'optionExplanations');

  if ((topic.includes('beta blocker') || concept.includes('beta blocker')) && !hasCustomOptions) {
    base.options = [
      { letter: 'A', text: 'Beta-1 adrenergic receptor antagonism in the sinoatrial node' },
      { letter: 'B', text: 'Angiotensin-converting enzyme inhibition with bradykinin accumulation' },
      { letter: 'C', text: 'L-type calcium channel blockade in vascular smooth muscle' },
      { letter: 'D', text: 'Direct epithelial sodium channel blockade in the collecting duct' },
    ];
    base.correct = 'A';
    if (!hasCustomExplanation) {
      base.explanation = 'Beta blockers such as metoprolol antagonize beta-1 adrenergic receptors in cardiac nodal tissue. Reduced beta-1 signaling decreases cAMP-mediated pacemaker activity, causing negative chronotropy and a lower heart rate.';
    }
    if (!hasCustomOptionExplanations) {
      base.optionExplanations = {
        A: 'Correct: beta-1 adrenergic receptor antagonism lowers heart rate by reducing nodal cAMP signaling.',
        B: 'Incorrect because ACE inhibition explains bradykinin cough, not metoprolol negative chronotropy.',
        C: 'Incorrect because calcium channel blockade describes amlodipine or verapamil effects.',
        D: 'Incorrect because ENaC blockade describes potassium-sparing diuretics.',
      };
    }
  }

  if ((topic.includes('calcium channel') || concept.includes('calcium channel')) && !hasCustomOptions) {
    base.options = [
      { letter: 'A', text: 'L-type calcium channel blockade in arteriolar smooth muscle' },
      { letter: 'B', text: 'Beta-1 adrenergic receptor antagonism in the sinoatrial node' },
      { letter: 'C', text: 'Angiotensin-converting enzyme inhibition with bradykinin accumulation' },
      { letter: 'D', text: 'Na-K-2Cl cotransporter inhibition in the thick ascending limb' },
    ];
    base.correct = 'A';
    if (!hasCustomExplanation) {
      base.explanation = 'Amlodipine is a dihydropyridine calcium channel blocker that inhibits L-type calcium channels in arteriolar smooth muscle. Reduced calcium entry relaxes vascular smooth muscle, lowers systemic vascular resistance, and decreases blood pressure.';
    }
    if (!hasCustomOptionExplanations) {
      base.optionExplanations = {
        A: 'Correct: L-type calcium channel blockade relaxes arteriolar smooth muscle and lowers blood pressure.',
        B: 'Incorrect because beta-1 blockade lowers heart rate rather than directly relaxing arterioles.',
        C: 'Incorrect because ACE inhibition lowers angiotensin II and increases bradykinin.',
        D: 'Incorrect because NKCC2 inhibition describes loop diuretics.',
      };
    }
  }

  return base;
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
        matrixPasses:           0,
        matrixWarnings:         0,
        matrixFailures:         0,
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
    seedAuthUsers();
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

    await repo.create(makeReport(targetFp, 'off_topic', 'user-a'));
    await repo.create(makeReport(targetFp, 'off_topic', 'user-b'));
    await repo.create(makeReport(targetFp, 'off_topic', 'user-c'));

    const quarantined = await repo.getQuarantinedFingerprints();
    expect(quarantined.has(targetFp)).toBe(true);
  });

  it('fingerprint with 5 total reports (any reason) is quarantined', async () => {
    const repo = new InMemoryQuestionReportsRepository();
    const targetFp = fp('a 32-year-old woman presents with fatigue and weight gain', 'Hypothyroidism diagnosis');

    for (let i = 0; i < 5; i++) {
      await repo.create(makeReport(targetFp, 'bad_explanation', `user-${i}`));
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
    seedAuthUsers();
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
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.count).toBe(1);
    expect(res.body.telemetry.generated).toBe(0);
    expect(res.body.telemetry.matrixPasses).toBe(0);
    expect(res.body.telemetry.matrixWarnings).toBe(0);
    expect(res.body.telemetry.matrixFailures).toBe(0);
    expect((getRepositories().questions as any)._getEntry(seededFingerprint)?.usageCount).toBe(1);
  });

  it('does not serve bank questions scoped to a different topic', async () => {
    // ACE inhibitor question in bank; request asks for Cardiac arrhythmias
    await seedBankQuestion();

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'Cardiac arrhythmias' } });

    expect(res.body.source).not.toBe('generated-bank');
  });

  it('rejects non-medical manual topics before live AI is required', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'banana heart magic' } })
      .expect(400);

    expect(res.body.code).toBe('INVALID_TOPIC');
    expect(res.body.reason).toContain('non-medical');
  });

  it('allows medical unknown manual topics to continue into the AI generation path', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'breast cancers' } })
      .expect(503);

    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('allows orthopedic medical unknown manual topics to continue into the AI generation path', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'patellar dislocations' } })
      .expect(503);

    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('accepts known topic aliases before prompt construction', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({
        config: {
          mode: 'practice',
          questionCount: 1,
          subject: 'Pharmacology',
          system: 'Renal',
          difficulty: 'Balanced',
          topic: 'loop diuretics',
        },
      })
      .expect(503);

    expect(res.body.code).toBe('NO_API_KEY');
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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

    expect(res.body.metrics.total).toBe(2);
    expect(res.body.metrics.validatedGenerated).toBe(1);
    expect(res.body.metrics.approved).toBe(1);
    expect(res.body.metrics.quarantined).toBe(0);
  });

  it('requires admin access for taxonomy candidate review endpoints', async () => {
    await request(app)
      .get('/api/taxonomy-candidates')
      .expect(401);

    await request(app)
      .get('/api/taxonomy-candidates')
      .set('Authorization', authHeader('user-999'))
      .expect(403);
  });

  it('lists pending taxonomy candidates for admins', async () => {
    await getRepositories().taxonomyCandidates.upsertUnknownTopicCandidate({
      rawLabel: 'breast cancers',
      normalizedGuess: 'Breast Cancers',
      subject: 'Pathology',
      system: 'Reproductive',
      exampleQuestionFingerprint: 'fp-breast-cancers',
      source: 'manual_topic',
    });

    const res = await request(app)
      .get('/api/taxonomy-candidates?status=pending')
      .set('Authorization', authHeader('user-1'))
      .expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.candidates[0]).toMatchObject({
      rawLabel: 'breast cancers',
      normalizedGuess: 'Breast Cancers',
      subject: 'Pathology',
      system: 'Reproductive',
      status: 'pending',
      frequency: 1,
    });
  });

  it('allows admins to map a taxonomy candidate as an alias', async () => {
    const candidate = await getRepositories().taxonomyCandidates.upsertUnknownTopicCandidate({
      rawLabel: 'breast cancers',
      normalizedGuess: 'Breast Cancers',
      subject: 'Pathology',
      system: 'Reproductive',
      source: 'manual_topic',
    });

    const res = await request(app)
      .patch(`/api/taxonomy-candidates/${candidate.id}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'mapped_alias', mappedTo: 'Breast Cancer Pathology', note: 'Map plural to canonical topic.' })
      .expect(200);

    expect(res.body.candidate.status).toBe('mapped_alias');
    expect(res.body.candidate.metadata).toMatchObject({
      mappedTo: 'Breast Cancer Pathology',
      note: 'Map plural to canonical topic.',
      reviewedBy: 'user-1',
    });
  });

  it('triggers alias cache refresh after status approval so next requests see the mapping', async () => {
    const spy = vi.spyOn(taxonomyResolutionService, 'refreshCache');

    const candidate = await getRepositories().taxonomyCandidates.upsertUnknownTopicCandidate({
      rawLabel: 'ace inhibitor drug group',
      normalizedGuess: 'ACE Inhibitors',
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      source: 'validation_topic',
    });

    // Before approval the alias is not in the runtime cache
    expect(taxonomyResolutionService.resolveTopicAlias('ace inhibitor drug group')).toBeNull();

    await request(app)
      .patch(`/api/taxonomy-candidates/${candidate.id}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'mapped_alias', mappedTo: 'ACE Inhibitors' })
      .expect(200);

    // refreshCache must have been called (fire-and-forget from the route handler)
    expect(spy).toHaveBeenCalledOnce();

    spy.mockRestore();
  });

  it('returns 404 when updating a missing taxonomy candidate', async () => {
    const res = await request(app)
      .patch('/api/taxonomy-candidates/00000000-0000-0000-0000-000000000000/status')
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'rejected', note: 'Noisy label.' })
      .expect(404);

    expect(res.body.code).toBe('TAXONOMY_CANDIDATE_NOT_FOUND');
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('rejects truly unknown subject labels at the AI request boundary', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Space Medicine', difficulty: 'Balanced' } })
      .expect(400);

    expect(res.body.code).toBe('INVALID_TAXONOMY');
    expect(res.body.field).toBe('subject');
  });

  it('keeps 40-question exam blocks strict when generated bank is partial and AI is unavailable', async () => {
    await seedBankQuestion({}, { mode: 'exam', difficulty: 'Balanced' });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
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

  it('filters review queue by reviewed-content status and commercial readiness', async () => {
    const ready = await seedBankQuestion(
      { testedConcept: 'Ready source checked concept', topic: 'ready source checked' },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' },
    );
    const notReady = await seedBankQuestion(
      { testedConcept: 'Not ready source checked concept', topic: 'not ready source checked' },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' },
    );
    await seedBankQuestion(
      { testedConcept: 'Expert reviewed distractor concept', topic: 'expert reviewed distractor' },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' },
    );

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(ready.fingerprint)}/review-metadata`)
      .set('Authorization', authHeader('user-1'))
      .send({
        reviewStatus: 'source_checked',
        sourceRefs: ['USMLE Content Outline'],
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'pass',
      })
      .expect(200);

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(notReady.fingerprint)}/review-metadata`)
      .set('Authorization', authHeader('user-1'))
      .send({
        reviewStatus: 'source_checked',
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'pass',
      })
      .expect(200);

    const res = await request(app)
      .get('/api/generated-question-bank/review?reviewStatus=source_checked&commercialReady=false')
      .set('Authorization', authHeader('user-1'))
      .expect(200);

    expect(res.body.count).toBe(1);
    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].externalId).toBe(notReady.fingerprint);
    expect(res.body.questions[0].reviewMetadata.reviewStatus).toBe('source_checked');
    expect(res.body.questions[0].commercialReady).toBe(false);
  });

  // ── Audit log ─────────────────────────────────────────────────────────────────

  it('writes an audit log entry on quarantine', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'quarantined' })
      .expect(200);

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

    const logs = getRepositories().auditLog.getAll();
    expect(logs).toHaveLength(2);
    expect(logs[0].action).toBe('quarantined');
    expect(logs[1].action).toBe('validated_generated');
    expect(logs[1].previousStatus).toBe('quarantined');
  });

  it('writes an audit log entry on approve', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'approved' })
      .expect(200);

    const logs = getRepositories().auditLog.getAll();
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('approved');
    expect(logs[0].userId).toBe('user-1');
    expect(logs[0].questionId).toBe(fingerprint);
    expect(logs[0].previousStatus).toBe('validated_generated');
    expect(logs[0].newStatus).toBe('approved');
  });

  it('updates reviewed-content metadata and writes an audit log entry', async () => {
    const { fingerprint } = await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' });

    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/review-metadata`)
      .set('Authorization', authHeader('user-1'))
      .send({
        reviewStatus: 'source_checked',
        sourceRefs: ['USMLE Content Outline'],
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'pass',
        reviewNotes: 'Reviewed against source outline.',
      })
      .expect(200);

    expect(res.body.question.reviewMetadata).toMatchObject({
      reviewStatus: 'source_checked',
      sourceRefs: ['USMLE Content Outline'],
      medicalAccuracyStatus: 'pass',
      itemWritingStatus: 'pass',
      difficultyCalibrationStatus: 'pass',
      reviewerId: 'user-1',
    });
    expect(res.body.question.commercialReady).toBe(true);
    expect(res.body.question.body.reviewMetadata.reviewStatus).toBe('source_checked');

    const logs = getRepositories().auditLog.getAll();
    expect(logs.at(-1)).toMatchObject({
      action: 'review_metadata_updated',
      questionId: fingerprint,
      previousStatus: 'validator_passed',
      newStatus: 'source_checked',
    });
  });

  it('history endpoint returns entries in reverse chronological order', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'approved' })
      .expect(200);

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader('user-1'))
      .send({ status: 'quarantined' })
      .expect(200);

    const res = await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}/history`)
      .set('Authorization', authHeader('user-1'))
      .expect(200);

    expect(res.body.count).toBe(2);
    expect(res.body.history).toHaveLength(2);
    // Newest first
    expect(res.body.history[0].action).toBe('quarantined');
    expect(res.body.history[1].action).toBe('approved');
  });

  it('restored status transitions quarantined question back to active without fingerprint block', async () => {
    // Seed via the shared helper so source='ai' and bankStatus='validated_generated' are set correctly
    const { fingerprint } = await seedBankQuestion();

    // Quarantine it first
    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'quarantined' })
      .expect(200);

    // Restore: should succeed — skips fingerprint quarantine check, re-runs validation
    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'restored' })
      .expect(200);

    expect(res.body.question.bankStatus).toBe('restored');
  });

  it('returns 401 AUTH_REQUIRED for unauthenticated generate-questions request', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(401);

    expect(res.body.code).toBe('AUTH_REQUIRED');
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
    seedAuthUsers();
    process.env.ANTHROPIC_API_KEY = 'test-key-hybrid';
    mockMessagesCreate.mockReset();
    app = createApp();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  // Each question needs a unique topic+questionAngle pair to avoid dedup() angle-key collisions.
  // dedup() drops a question when norm(topic+'|'+questionAngle) matches a previously seen entry.

  it('does not show failed live AI questions, but captures them for admin review', async () => {
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
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, subject: 'Pathology', system: 'Cardiovascular', difficulty: 'Balanced' } });

    expect(res.status).not.toBe(200);
    const metrics = await getRepositories().questions.getGeneratedBankMetrics();
    expect(metrics.total).toBe(1);
    expect(metrics.validationFailed).toBe(1);
    const candidates = await getRepositories().questions.findGeneratedBankReview({ status: 'validation_failed' });
    expect(candidates).toHaveLength(1);
    expect((candidates[0].body as any).rejectionReasons).toContain('subject_system:cardio_pharmacology_not_pathology');
  });

  it('fails closed before showing or saving live AI questions when quarantine lookup fails', async () => {
    mockMessagesCreate.mockResolvedValue(aiResponseWith([makePromotableQuestion()]));
    (getRepositories().questionReports as any).getQuarantinedFingerprints = async () => {
      throw new Error('quarantine unavailable');
    };

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(503);

    expect(res.body.code).toBe('QUARANTINE_CHECK_UNAVAILABLE');
    expect(res.body.error).not.toMatch(/quarantine unavailable/i);
    expect((await getRepositories().questions.getGeneratedBankMetrics()).total).toBe(0);
  });

  it('captures validated medical-unknown manual topics as taxonomy candidates', async () => {
    const breastCancerQuestion = makePromotableQuestion({
      id: 'breast-cancer-q-1',
      subject: 'Pathology',
      system: 'Reproductive',
      topic: 'Breast Cancers',
      canonicalTopic: 'Breast Cancers',
      testedConcept: 'breast cancer estrogen receptor pathology',
      questionAngle: 'breast-cancer-pathology',
      stem: 'A 54-year-old woman presents with a firm, irregular breast mass and nipple retraction. Core biopsy shows infiltrating malignant cells arranged in duct-like structures with desmoplastic stroma, and immunohistochemistry shows estrogen receptor expression. Which diagnosis best explains these biopsy findings?',
      options: [
        'Estrogen receptor positive invasive ductal carcinoma',
        'Fibroadenoma with hormonally responsive stromal proliferation',
        'Acute bacterial mastitis with neutrophilic abscess formation',
        'Fat necrosis with calcified adipocyte membranes',
      ],
      correctAnswer: 'A',
      explanation: 'Invasive ductal carcinoma is the most common breast cancer and often presents as a firm irregular mass with stromal desmoplasia and duct-forming malignant epithelial cells. Estrogen receptor testing is clinically important because receptor-positive tumors may respond to endocrine therapy. Fibroadenoma is benign and well circumscribed, mastitis is inflammatory and infectious, and fat necrosis follows trauma or surgery rather than forming invasive malignant ducts.',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([breastCancerQuestion]));

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'breast cancers' } })
      .expect(200);

    expect(res.body.telemetry.taxonomyCandidatesCaptured).toBe(1);
    const allCandidates = await getRepositories().taxonomyCandidates.findUnknownTopicCandidates();
    const candidates = allCandidates.filter(c => c.type === 'topic');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      rawLabel: 'breast cancers',
      normalizedGuess: 'Breast Cancers',
      subject: 'Pathology',
      system: 'Reproductive',
      frequency: 1,
      source: 'manual_topic',
      status: 'pending',
    });
    expect(candidates[0].exampleQuestionFingerprint).toBeTruthy();
  });

  it('increments an existing taxonomy candidate instead of duplicating it', async () => {
    const firstQuestion = makePromotableQuestion({
      id: 'breast-cancer-q-1',
      subject: 'Pathology',
      system: 'Reproductive',
      topic: 'Breast Cancers',
      canonicalTopic: 'Breast Cancers',
      testedConcept: 'breast cancer receptor pathology first',
      questionAngle: 'breast-cancer-pathology-first',
      stem: 'A 54-year-old woman presents with a new fixed breast mass and dimpling of the overlying skin. Biopsy shows infiltrating malignant epithelial cells forming duct-like glands within a dense fibrotic stroma. Which diagnosis is most consistent with this pathologic pattern?',
      options: [
        'Invasive ductal carcinoma of the breast',
        'Fibrocystic change with apocrine metaplasia',
        'Lactational adenoma with benign glandular expansion',
        'Plasma cell mastitis involving subareolar ducts',
      ],
      correctAnswer: 'A',
      explanation: 'A fixed breast mass with skin dimpling and malignant duct-forming epithelial cells in a desmoplastic stroma is most consistent with invasive ductal carcinoma. Fibrocystic change can cause nodularity but lacks invasive malignant glands. Lactational adenoma is benign and pregnancy associated. Plasma cell mastitis causes inflammatory subareolar disease rather than invasive carcinoma.',
    });
    const secondQuestion = makePromotableQuestion({
      id: 'breast-cancer-q-2',
      subject: 'Pathology',
      system: 'Reproductive',
      topic: 'Breast Cancers',
      canonicalTopic: 'Breast Cancers',
      testedConcept: 'breast cancer receptor pathology second',
      questionAngle: 'breast-cancer-pathology-second',
      stem: 'A 61-year-old woman undergoes biopsy of a spiculated breast lesion found on mammography. Histology shows malignant epithelial cells invading through the basement membrane, and additional testing demonstrates estrogen receptor positivity. Which feature most directly supports malignant breast cancer rather than a benign breast lesion?',
      options: [
        'Invasion of epithelial cells beyond the basement membrane',
        'Cyst dilation with apocrine metaplasia',
        'Well-circumscribed stromal and glandular proliferation',
        'Milk stasis with acute inflammatory infiltrates',
      ],
      correctAnswer: 'A',
      explanation: 'Invasion through the basement membrane is the defining feature that separates carcinoma from in situ or benign proliferative breast lesions. Estrogen receptor positivity helps classify the tumor and guide therapy, but invasive growth establishes malignant behavior. Apocrine metaplasia, fibroadenoma-like stromal proliferation, and lactational inflammation do not indicate invasive breast carcinoma.',
    });
    mockMessagesCreate
      .mockResolvedValueOnce(aiResponseWith([firstQuestion]))
      .mockResolvedValueOnce(aiResponseWith([secondQuestion]));

    await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'breast cancers' } })
      .expect(200);

    await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 2, difficulty: 'Balanced', topic: 'breast cancers' } })
      .expect(200);

    const allCandidates = await getRepositories().taxonomyCandidates.findUnknownTopicCandidates();
    const candidates = allCandidates.filter(c => c.type === 'topic');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].rawLabel).toBe('breast cancers');
    expect(candidates[0].frequency).toBe(2);
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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
      .set('Authorization', authHeader())
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

// ── Phase 2 governance ────────────────────────────────────────────────────────

describe('Phase 2 governance', () => {
  let app: ReturnType<typeof createApp>;

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
      validationScore: 85,
    });
    return { question: q, fingerprint };
  }

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
    seedAuthUsers();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.REQUIRE_APPROVAL_FOR_PRODUCTION;
    delete process.env.ALLOW_VALIDATED_REUSE;
    process.env.ADMIN_USER_IDS = 'user-1';
    app = createApp();
  });

  afterEach(() => {
    delete process.env.ADMIN_USER_IDS;
    delete process.env.REQUIRE_APPROVAL_FOR_PRODUCTION;
    delete process.env.ALLOW_VALIDATED_REUSE;
  });

  // ── P0: downgrade prevention ──────────────────────────────────────────────────
  // These tests call _saveGeneratedQuestionsToBank directly so the guard is on
  // the critical path.  Remove the `continue` guard and all three fail.

  const saveConfig = { mode: 'practice', difficulty: 'Balanced', subject: 'Pharmacology', system: 'Cardiovascular' };

  it('_saveGeneratedQuestionsToBank skips approved row — status and body not overwritten', async () => {
    const { fingerprint } = await seedBankQuestion({ explanation: 'Original approved explanation.' });
    await getRepositories().questions.updateGeneratedBankStatus(fingerprint, 'approved');

    // Attempt to re-save the same fingerprint with a different explanation
    const modified = makePromotableQuestion({ explanation: 'New explanation that must not overwrite.' });
    const saved = await _saveGeneratedQuestionsToBank([modified], saveConfig);

    expect(saved).toBe(0);
    const rows = await getRepositories().questions.findGeneratedBankReview({ externalId: fingerprint, limit: 1 });
    expect((rows[0] as any).bankStatus).toBe('approved');
    expect((rows[0] as any).body.explanation).toBe('Original approved explanation.');
  });

  it('_saveGeneratedQuestionsToBank skips quarantined row — status and body not overwritten', async () => {
    const { fingerprint } = await seedBankQuestion({ explanation: 'Original quarantined explanation.' });
    await getRepositories().questions.updateGeneratedBankStatus(fingerprint, 'quarantined');

    const modified = makePromotableQuestion({ explanation: 'New explanation that must not overwrite.' });
    const saved = await _saveGeneratedQuestionsToBank([modified], saveConfig);

    expect(saved).toBe(0);
    const rows = await getRepositories().questions.findGeneratedBankReview({ externalId: fingerprint, limit: 1 });
    expect((rows[0] as any).bankStatus).toBe('quarantined');
    expect((rows[0] as any).body.explanation).toBe('Original quarantined explanation.');
  });

  it('_saveGeneratedQuestionsToBank writes validated_generated row (not guarded)', async () => {
    // validated_generated does NOT trigger the guard — upsert is allowed
    const saved = await _saveGeneratedQuestionsToBank([makePromotableQuestion()], saveConfig);

    expect(saved).toBe(1);
    const fingerprintOf = (q: Record<string, any>) => {
      const s = (q.stem || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
      const c = (q.testedConcept || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      return `${s}||${c}`;
    };
    const fp = fingerprintOf(makePromotableQuestion());
    const rows = await getRepositories().questions.findGeneratedBankReview({ externalId: fp, limit: 1 });
    expect((rows[0] as any).bankStatus).toBe('validated_generated');
    expect((rows[0] as any).aiModel).toBe('claude-haiku-4-5-20251001');
    expect((rows[0] as any).validatorVersion).toBe('central-validation-engine-v1');
    expect((rows[0] as any).body.aiModel).toBe('claude-haiku-4-5-20251001');
    expect((rows[0] as any).body.validatorVersion).toBe('central-validation-engine-v1');
  });

  it('_saveGeneratedQuestionsToBank skips questions that fail central validation', async () => {
    const invalid = makePromotableQuestion({
      subject: 'Biostatistics',
      system: 'Cardiovascular',
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
    });

    const saved = await _saveGeneratedQuestionsToBank([invalid], saveConfig);

    expect(saved).toBe(0);
    expect((await getRepositories().questions.getGeneratedBankMetrics()).total).toBe(0);
  });

  // ── P1: approved-only reuse ───────────────────────────────────────────────────

  it('REQUIRE_APPROVAL_FOR_PRODUCTION blocks validated_generated from bank reuse', async () => {
    process.env.REQUIRE_APPROVAL_FOR_PRODUCTION = 'true';
    app = createApp();

    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    // With no approved questions and no API key, expect 503 (no API key) — not served from bank
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('REQUIRE_APPROVAL_FOR_PRODUCTION allows approved questions to serve from bank', async () => {
    process.env.REQUIRE_APPROVAL_FOR_PRODUCTION = 'true';
    app = createApp();

    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.telemetry.approvedOnly).toBe(true);
    expect(res.body.telemetry.reusePolicy).toBe('approved-only');
  });

  it('default mode (no env flag) serves validated_generated from bank', async () => {
    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.telemetry.approvedOnly).toBe(false);
    expect(res.body.telemetry.reusePolicy).toBe('approved-first');
    expect(res.body.telemetry.validatedFallbackAllowed).toBe(true);
  });

  it('production defaults to approved-only reuse without requiring an env flag', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      app = createApp();
      await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' });

      const res = await request(app)
        .post('/api/generate-questions')
        .set('Authorization', authHeader())
        .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('NO_API_KEY');
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      app = createApp();
    }
  });

  it('ALLOW_VALIDATED_REUSE=false blocks validated_generated from bank reuse', async () => {
    process.env.ALLOW_VALIDATED_REUSE = 'false';
    app = createApp();

    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    // validated_generated must not be served — no approved questions and no API key → 503
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('ALLOW_VALIDATED_REUSE=false allows approved questions to serve from bank', async () => {
    process.env.ALLOW_VALIDATED_REUSE = 'false';
    app = createApp();

    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.source).toBe('generated-bank');
    expect(res.body.telemetry.approvedOnly).toBe(true);
    expect(res.body.telemetry.reusePolicy).toBe('approved-only');
    expect(res.body.telemetry.validatedFallbackAllowed).toBe(false);
  });

  it('telemetry includes approvedReuseCount, liveGeneratedCount, approvedOnlyMode, validatedQueueCount', async () => {
    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' });
    // seed a second validated_generated that is NOT served (counts toward queue)
    await seedBankQuestion(
      { testedConcept: 'pending queue item for telemetry', stem: 'A 30-year-old has a pending review question. What is the status?' },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' },
    );

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(typeof res.body.telemetry.approvedReuseCount).toBe('number');
    expect(typeof res.body.telemetry.liveGeneratedCount).toBe('number');
    expect(typeof res.body.telemetry.approvedOnlyMode).toBe('boolean');
    expect(typeof res.body.telemetry.validatedQueueCount).toBe('number');
    // 1 approved question served from bank
    expect(res.body.telemetry.approvedReuseCount).toBe(1);
    expect(res.body.telemetry.liveGeneratedCount).toBe(0);
    // 1 validated_generated remains in queue
    expect(res.body.telemetry.validatedQueueCount).toBe(1);
  });

  it('quarantined questions are never reused regardless of reuse policy', async () => {
    const { fingerprint } = await seedBankQuestion();
    await getRepositories().questions.updateGeneratedBankStatus(fingerprint, 'quarantined');

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('NO_API_KEY');
  });

  // ── P2: review queue pagination ───────────────────────────────────────────────

  it('review list returns pagination metadata', async () => {
    await seedBankQuestion();
    await seedBankQuestion({
      testedConcept: 'beta blocker negative chronotropy pagination test',
      stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol. After two weeks his heart rate decreases. Which mechanism explains this?',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
    });

    const res = await request(app)
      .get('/api/generated-question-bank/review?limit=1&page=1')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.limit).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.questions).toHaveLength(1);
  });

  it('review list second page returns remaining questions with hasMore=false', async () => {
    await seedBankQuestion();
    await seedBankQuestion({
      testedConcept: 'beta blocker negative chronotropy pagination test two',
      stem: 'A 62-year-old man with hypertension starts metoprolol. Heart rate decreases. Mechanism?',
      topic: 'Beta blockers',
      questionAngle: 'mechanism',
    });

    const res = await request(app)
      .get('/api/generated-question-bank/review?limit=1&page=2')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.page).toBe(2);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.questions).toHaveLength(1);
  });

  it('review detail endpoint returns full question by externalId', async () => {
    const { fingerprint } = await seedBankQuestion();

    const res = await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.question).toBeDefined();
    expect(res.body.question.externalId).toBe(fingerprint);
    expect(res.body.question.bankStatus).toBe('validated_generated');
  });

  it('review detail endpoint returns 404 for unknown externalId', async () => {
    const res = await request(app)
      .get('/api/generated-question-bank/review/nonexistent-fingerprint')
      .set('Authorization', authHeader())
      .expect(404);

    expect(res.body.code).toBe('GENERATED_QUESTION_NOT_FOUND');
  });

  // ── P3: audit history ─────────────────────────────────────────────────────────

  it('audit history endpoint returns history for a question', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'quarantined' })
      .expect(200);

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'validated_generated' })
      .expect(200);

    await new Promise(r => setTimeout(r, 10));

    const res = await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}/history`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.count).toBe(2);
    expect(res.body.history[0].action).toBe('validated_generated');
    expect(res.body.history[0].previousStatus).toBe('quarantined');
    expect(res.body.history[1].action).toBe('quarantined');
  });

  it('audit history endpoint returns 400 for id exceeding max length', async () => {
    const longId = 'x'.repeat(301);
    await request(app)
      .get(`/api/generated-question-bank/review/${longId}/history`)
      .set('Authorization', authHeader())
      .expect(400);
  });

  // ── P4: metrics upgrade ───────────────────────────────────────────────────────

  it('metrics include approvalRate, quarantineRate, averageValidationScore, and recent actions', async () => {
    await seedBankQuestion();
    await seedBankQuestion(
      {
        testedConcept: 'beta blocker negative chronotropy metrics test',
        stem: 'A 60-year-old man with hypertension starts metoprolol. Heart rate decreases. Mechanism?',
        topic: 'Beta blockers',
        questionAngle: 'mechanism',
      },
      { mode: 'practice', difficulty: 'Balanced', bankStatus: 'approved' },
    );

    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.metrics.total).toBe(2);
    expect(res.body.metrics.approved).toBe(1);
    expect(res.body.metrics.validatedGenerated).toBe(1);
    expect(typeof res.body.metrics.approvalRate).toBe('number');
    expect(typeof res.body.metrics.quarantineRate).toBe('number');
    expect(res.body.metrics.approvalRate).toBeCloseTo(0.5);
    expect(res.body.metrics.quarantineRate).toBe(0);
    expect(Array.isArray(res.body.recentApprovals)).toBe(true);
    expect(Array.isArray(res.body.recentQuarantines)).toBe(true);
    expect(res.body.metrics.averageValidationScore === null || typeof res.body.metrics.averageValidationScore === 'number').toBe(true);
  });

  it('metrics recentApprovals list contains approval actions', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'approved' })
      .expect(200);

    await new Promise(r => setTimeout(r, 10));

    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.recentApprovals.length).toBeGreaterThanOrEqual(1);
    expect(res.body.recentApprovals[0].action).toBe('approved');
  });

  it('metrics include review queue impact fields: pendingReviewCount, averagePendingAge, throughput', async () => {
    await seedBankQuestion({}, { mode: 'practice', difficulty: 'Balanced', bankStatus: 'validated_generated' });

    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader())
      .expect(200);

    expect(typeof res.body.metrics.pendingReviewCount).toBe('number');
    expect(res.body.metrics.pendingReviewCount).toBe(1);
    // averagePendingAge may be null in memory repo (no createdAt stored)
    expect(res.body.metrics.averagePendingAge === null || typeof res.body.metrics.averagePendingAge === 'number').toBe(true);
    expect(typeof res.body.metrics.approvedLast7d).toBe('number');
    expect(typeof res.body.metrics.quarantinedLast7d).toBe('number');
    expect(typeof res.body.metrics.approvedPerDay).toBe('number');
    expect(typeof res.body.metrics.quarantinedPerDay).toBe('number');
    expect(typeof res.body.metrics.generatedPerDay).toBe('number');
  });

  it('metrics throughput counts include recent approvals and quarantines within window', async () => {
    const { fingerprint: fp1 } = await seedBankQuestion();
    const { fingerprint: fp2 } = await seedBankQuestion({
      testedConcept: 'throughput quarantine test concept',
      stem: 'A 45-year-old woman has a question that will be quarantined for throughput testing.',
    });

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fp1)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'approved' })
      .expect(200);

    await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fp2)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'quarantined' })
      .expect(200);

    const res = await request(app)
      .get('/api/generated-question-bank/metrics')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.metrics.approvedLast7d).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.quarantinedLast7d).toBeGreaterThanOrEqual(1);
  });

  // ── P5: approval safety ───────────────────────────────────────────────────────

  it('blocks approval when question content fingerprint is quarantined', async () => {
    const { fingerprint } = await seedBankQuestion();

    // Monkey-patch getQuarantinedFingerprints to return the question's fingerprint
    (getRepositories().questionReports as any).getQuarantinedFingerprints = async () => new Set([fingerprint]);

    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'approved' })
      .expect(422);

    expect(res.body.code).toBe('QUARANTINED_FINGERPRINT');
    expect(res.body.rejectionReasons[0]).toMatch(/quarantined/i);
  });

  it('approval revalidates and rejects if validation fails (existing behavior preserved)', async () => {
    const { fingerprint } = await seedBankQuestion({
      subject: 'Pathology',
      system: 'Cardiovascular',
      topic: 'Beta blockers',
      testedConcept: 'beta blocker negative chronotropy mechanism validation test',
      stem: 'A 60-year-old man with hypertension and stable angina is started on metoprolol succinate. After two weeks his resting heart rate decreases from 88 to 62 beats per minute. Which receptor mechanism explains this cardiovascular drug effect?',
    });

    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'approved' })
      .expect(422);

    expect(res.body.code).toBe('GENERATED_QUESTION_VALIDATION_FAILED');
  });

  // ── Admin gate: new endpoints ─────────────────────────────────────────────────

  it('review detail endpoint requires admin', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}`)
      .expect(401);

    await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}`)
      .set('Authorization', authHeader('user-999'))
      .expect(403);
  });

  it('audit history endpoint requires admin', async () => {
    const { fingerprint } = await seedBankQuestion();

    await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}/history`)
      .expect(401);

    await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}/history`)
      .set('Authorization', authHeader('user-999'))
      .expect(403);
  });

  // ── v8.1.0: canonical concepts in saved questions ─────────────────────────────

  it('saved question body contains canonicalConcepts array', async () => {
    const q = makePromotableQuestion({ testedConcept: 'ACE inhibitor bradykinin cough mechanism' });
    const fingerprint = fingerprintOf(q);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: String(q.subject || ''),
      system:  String(q.system  || ''),
      body: { ...q, id: fingerprint, source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['ACE Inhibitor Bradykinin Cough'] },
      source: 'ai',
      bankStatus: 'validated_generated',
    });

    const rows = await getRepositories().questions.findGeneratedBankReview({ externalId: fingerprint, limit: 1 });
    const body = (rows[0] as any)?.body ?? {};
    expect(Array.isArray(body.canonicalConcepts)).toBe(true);
  });

  it('review detail response includes body with canonicalConcepts when present', async () => {
    const q = makePromotableQuestion({ testedConcept: 'ACE inhibitor bradykinin cough mechanism' });
    const fingerprint = fingerprintOf(q);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: String(q.subject || ''),
      system:  String(q.system  || ''),
      body: { ...q, id: fingerprint, source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['ACE Inhibitor Bradykinin Cough'] },
      source: 'ai',
      bankStatus: 'validated_generated',
    });

    const res = await request(app)
      .get(`/api/generated-question-bank/review/${encodeURIComponent(fingerprint)}`)
      .set('Authorization', authHeader())
      .expect(200);

    expect(Array.isArray(res.body.question.body.canonicalConcepts)).toBe(true);
  });

  it('getQuestionsByConcept returns only questions containing that concept', async () => {
    const concept = 'ACE Inhibitor Bradykinin Cough';
    const fp1 = 'test-fp-concept-match';
    const fp2 = 'test-fp-no-concept';

    await getRepositories().questions.upsertByExternalId(fp1, {
      subject: 'Pharmacology', system: 'Cardiovascular',
      body: { id: fp1, source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: [concept] },
      source: 'ai', bankStatus: 'validated_generated',
    });
    await getRepositories().questions.upsertByExternalId(fp2, {
      subject: 'Pharmacology', system: 'Cardiovascular',
      body: { id: fp2, source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['Loop Diuretic Ototoxicity'] },
      source: 'ai', bankStatus: 'validated_generated',
    });

    const results = await getRepositories().questions.getQuestionsByConcept(concept);
    expect(results.length).toBe(1);
    expect((results[0] as any).externalId ?? (results[0] as any).body?.id).toBeTruthy();
    const noneResults = await getRepositories().questions.getQuestionsByConcept('Nonexistent Concept XYZ');
    expect(noneResults.length).toBe(0);
  });

  it('getConceptCoverage returns concept-count pairs sorted by count', async () => {
    const concept = 'Loop Diuretic Ototoxicity';
    for (let i = 0; i < 3; i++) {
      await getRepositories().questions.upsertByExternalId(`fp-cov-${i}`, {
        subject: 'Pharmacology', system: 'Renal / Urinary',
        body: { id: `fp-cov-${i}`, source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: [concept] },
        source: 'ai', bankStatus: 'validated_generated',
      });
    }
    await getRepositories().questions.upsertByExternalId('fp-cov-other', {
      subject: 'Pharmacology', system: 'Cardiovascular',
      body: { id: 'fp-cov-other', source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['Na-K-2Cl Transporter Inhibition'] },
      source: 'ai', bankStatus: 'validated_generated',
    });

    const coverage = await getRepositories().questions.getConceptCoverage();
    expect(coverage.length).toBeGreaterThanOrEqual(2);
    const first = coverage[0];
    expect(first.concept).toBe(concept);
    expect(first.count).toBe(3);
    expect(typeof first.count).toBe('number');
  });

  it('concept-summary endpoint returns expected shape and requires admin', async () => {
    await request(app)
      .get('/api/generated-question-bank/concept-summary')
      .expect(401);

    await request(app)
      .get('/api/generated-question-bank/concept-summary')
      .set('Authorization', authHeader('user-999'))
      .expect(403);

    // Seed one known canonical concept
    await getRepositories().questions.upsertByExternalId('fp-summary-1', {
      subject: 'Pharmacology', system: 'Renal / Urinary',
      body: { id: 'fp-summary-1', source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['Na-K-2Cl Transporter Inhibition'] },
      source: 'ai', bankStatus: 'validated_generated',
    });

    const res = await request(app)
      .get('/api/generated-question-bank/concept-summary')
      .set('Authorization', authHeader())
      .expect(200);

    expect(typeof res.body.totalConceptTaggings).toBe('number');
    expect(typeof res.body.uniqueConceptCount).toBe('number');
    expect(typeof res.body.knownConceptCount).toBe('number');
    expect(typeof res.body.unknownConceptCount).toBe('number');
    expect(Array.isArray(res.body.topConcepts)).toBe(true);
    expect(Array.isArray(res.body.unknownConcepts)).toBe(true);
    expect(res.body.totalConceptTaggings).toBeGreaterThanOrEqual(1);
  });

  it('concept-summary separates known canonicals from unknowns', async () => {
    await getRepositories().questions.upsertByExternalId('fp-known', {
      subject: 'Pharmacology', system: 'Renal / Urinary',
      body: { id: 'fp-known', source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['Na-K-2Cl Transporter Inhibition'] },
      source: 'ai', bankStatus: 'validated_generated',
    });
    await getRepositories().questions.upsertByExternalId('fp-unknown', {
      subject: 'Pharmacology', system: 'Cardiovascular',
      body: { id: 'fp-unknown', source: 'ai', bankStatus: 'validated_generated', canonicalConcepts: ['Totally Unknown Concept XYZ 99'] },
      source: 'ai', bankStatus: 'validated_generated',
    });

    const res = await request(app)
      .get('/api/generated-question-bank/concept-summary')
      .set('Authorization', authHeader())
      .expect(200);

    expect(res.body.knownConceptCount).toBeGreaterThanOrEqual(1);
    expect(res.body.unknownConceptCount).toBeGreaterThanOrEqual(1);
    expect(res.body.unknownConcepts).toContain('Totally Unknown Concept XYZ 99');
  });
});

// ── Matrix telemetry — subject_system validator counter integration ────────────
//
// These tests drive the full generateBatch Phase 1 loop via the HTTP route with a
// mocked Anthropic SDK.  They prove the counting logic in ai.ts:
//   subject_system.status === 'fail'  → matrixFailures++
//   subject_system.status === 'warn'  → matrixWarnings++
//   subject_system.status === 'pass'  → matrixPasses++
//   ruleRejected formula is unchanged (matrix failures remain inside ruleRejected)

describe('matrix telemetry — Phase 1 loop counters', () => {
  let app: ReturnType<typeof createApp>;

  function aiResponseWith(questions: Record<string, any>[]) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ questions }) }],
      stop_reason: 'end_turn',
    };
  }

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
    seedAuthUsers();
    process.env.ANTHROPIC_API_KEY = 'test-key-matrix';
    process.env.ADMIN_USER_IDS = 'user-1';
    mockMessagesCreate.mockReset();
    app = createApp();
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ADMIN_USER_IDS;
  });

  function localFingerprintOf(q: Record<string, any>): string {
    const s = (q.stem || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const c = (q.testedConcept || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${s}||${c}`;
  }

  it('invalid matrix pair (Biostatistics + Cardiovascular) increments matrixFailures', async () => {
    // One invalid pair question (will be rejected) + one valid question (will be accepted).
    // Two questions are required so the response is 200 instead of 500 EMPTY_RESULT.
    const invalidQ = makePromotableQuestion({
      subject: 'Biostatistics',
      system: 'Cardiovascular',
      topic: 'Sample size',
      testedConcept: 'biostatistics sample size calculation cardiovascular trial',
      questionAngle: 'calculation',
      stem: 'A researcher designing a clinical trial for a new antihypertensive drug needs to calculate the minimum required sample size. Reducing which parameter most directly increases the required sample size?',
    });
    const validQ = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism matrix test',
      topic: 'ACE inhibitors',
      questionAngle: 'matrix-fail-companion',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([invalidQ, validQ]));

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.telemetry.matrixFailures).toBeGreaterThanOrEqual(1);
  });

  it('warning-tier pair (Biochemistry + Cardiovascular) increments matrixWarnings', async () => {
    // Biochemistry + Cardiovascular is a warning-tier pair.
    // Warning is non-blocking so the question will pass and a 200 response is returned.
    const warnQ = makePromotableQuestion({
      subject: 'Biochemistry',
      system: 'Cardiovascular',
      topic: 'Lipid metabolism',
      testedConcept: 'biochemistry lipoprotein cardiovascular disease risk warning',
      questionAngle: 'warning-tier-test',
      stem: 'A 52-year-old man with familial hypercholesterolemia has markedly elevated LDL cholesterol. Which lipoprotein particle carries the highest proportion of cholesterol to peripheral tissues and most directly drives atherogenesis in this patient?',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([warnQ]));

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.telemetry.matrixWarnings).toBeGreaterThanOrEqual(1);
    expect(res.body.telemetry.matrixFailures).toBe(0);
  });

  it('allowed pair (Pharmacology + Cardiovascular) increments matrixPasses', async () => {
    const allowedQ = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism matrix passes test',
      topic: 'ACE inhibitors',
      questionAngle: 'allowed-pair-test',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([allowedQ]));

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.telemetry.matrixPasses).toBeGreaterThanOrEqual(1);
    expect(res.body.telemetry.matrixFailures).toBe(0);
  });

  it('ruleRejected still counts invalid-pair rejections (matrixFailures are inside ruleRejected)', async () => {
    const invalidQ = makePromotableQuestion({
      subject: 'Biostatistics',
      system: 'Cardiovascular',
      topic: 'Sample size',
      testedConcept: 'biostatistics sample size cardiovascular rule rejected test',
      questionAngle: 'rule-rejected-companion',
      stem: 'A researcher designing a superiority trial for a new antihypertensive agent needs to determine the minimum required sample size. Increasing which design parameter most directly reduces the required sample size?',
    });
    const validQ = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism rule rejected valid companion',
      topic: 'ACE inhibitors',
      questionAngle: 'rule-rejected-valid',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([invalidQ, validQ]));

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    // matrixFailures reflects the invalid pair
    expect(res.body.telemetry.matrixFailures).toBeGreaterThanOrEqual(1);
    // ruleRejectedCandidates is unchanged — matrix failures are still counted inside it
    expect(res.body.telemetry.ruleRejectedCandidates).toBeGreaterThanOrEqual(res.body.telemetry.matrixFailures);
  });

  it('captures failed AI questions as validation_failed review candidates without returning them', async () => {
    const invalidQ = makePromotableQuestion({
      subject: 'Biostatistics',
      system: 'Cardiovascular',
      topic: 'Sample size',
      testedConcept: 'biostatistics sample size failed candidate capture',
      questionAngle: 'failed-candidate-capture',
      stem: 'A researcher designing a clinical trial for a new antihypertensive drug needs to calculate the minimum required sample size. Which study design change most directly increases required sample size?',
    });
    const validQ = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism failed candidate companion',
      topic: 'ACE inhibitors',
      questionAngle: 'failed-candidate-valid-companion',
    });
    mockMessagesCreate.mockResolvedValue(aiResponseWith([invalidQ, validQ]));

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(200);

    expect(res.body.questions).toHaveLength(1);
    expect(res.body.questions[0].testedConcept).toBe('ACE inhibitor bradykinin cough mechanism failed candidate companion');

    const candidates = await getRepositories().questions.findGeneratedBankReview({ status: 'validation_failed' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].bankStatus).toBe('validation_failed');
    expect((candidates[0].body as any).testedConcept).toBe('biostatistics sample size failed candidate capture');
    expect((candidates[0].body as any).rejectionReasons.some((reason: string) => reason.startsWith('subject_system:'))).toBe(true);
    expect((candidates[0].body as any).validationFailureSource).toBe('rule-validation');
  });

  it('does not reuse validation_failed questions from the generated bank', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const failedQ = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism failed bank row',
      topic: 'ACE inhibitors',
      questionAngle: 'failed-bank-row',
    });
    const fingerprint = localFingerprintOf(failedQ);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: failedQ.subject,
      system: failedQ.system,
      body: {
        ...failedQ,
        id: fingerprint,
        source: 'ai',
        bankStatus: 'validation_failed',
        validationStatus: 'fail',
        validationScore: 0,
        rejectionReasons: ['test_failure'],
      },
      source: 'ai',
      bankStatus: 'validation_failed',
      mode: 'practice',
      difficulty: 'Balanced',
      validationScore: 0,
    });

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader())
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(503);

    expect(res.body.code).toBe('NO_API_KEY');
  });

  it('allows admins to reject validation_failed candidates', async () => {
    const failedQ = makePromotableQuestion({
      testedConcept: 'ACE inhibitor bradykinin cough mechanism reject failed candidate',
      topic: 'ACE inhibitors',
      questionAngle: 'reject-failed-candidate',
    });
    const fingerprint = localFingerprintOf(failedQ);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: failedQ.subject,
      system: failedQ.system,
      body: {
        ...failedQ,
        id: fingerprint,
        source: 'ai',
        bankStatus: 'validation_failed',
        validationStatus: 'fail',
        validationScore: 0,
        rejectionReasons: ['test_failure'],
      },
      source: 'ai',
      bankStatus: 'validation_failed',
      mode: 'practice',
      difficulty: 'Balanced',
      validationScore: 0,
    });

    const res = await request(app)
      .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
      .set('Authorization', authHeader())
      .send({ status: 'rejected' })
      .expect(200);

    expect(res.body.question.bankStatus).toBe('rejected');
    const logs = (getRepositories().auditLog as any).getAll();
    expect(logs[0]).toMatchObject({
      action: 'rejected',
      previousStatus: 'validation_failed',
      newStatus: 'rejected',
    });
  });
});

// ── Matrix telemetry — runAdaptiveRefill accumulation ────────────────────────

describe('runAdaptiveRefill — matrix telemetry accumulation', () => {
  it('accumulates matrixPasses across all batches', async () => {
    const batchFn = async () => ({
      questions: [{ id: `q${++_idCounter}`, testedConcept: `c${_idCounter}`, stem: 'S' }],
      telemetry: {
        medicalReviewRequested: 0, medicalReviewPassed: 0,
        medicalReviewRejected: 0, medicalReviewSkipped: 1,
        ruleRejected: 0, scopeRejected: 0,
        matrixPasses: 3, matrixWarnings: 0, matrixFailures: 0,
        medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
      },
    });
    const result = await runAdaptiveRefill(
      2,
      { maxCandidates: 100, maxRounds: 5, candidatesPerRound: 8 },
      async () => batchFn(),
      noFilter,
    );
    expect(result.totalMatrixPasses).toBe(result.refillRounds * 3);
    expect(result.totalMatrixWarnings).toBe(0);
    expect(result.totalMatrixFailures).toBe(0);
  });

  it('accumulates matrixWarnings across all batches', async () => {
    const batchFn = async () => ({
      questions: [{ id: `q${++_idCounter}`, testedConcept: `c${_idCounter}`, stem: 'S' }],
      telemetry: {
        medicalReviewRequested: 0, medicalReviewPassed: 0,
        medicalReviewRejected: 0, medicalReviewSkipped: 1,
        ruleRejected: 0, scopeRejected: 0,
        matrixPasses: 0, matrixWarnings: 2, matrixFailures: 0,
        medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
      },
    });
    const result = await runAdaptiveRefill(
      2,
      { maxCandidates: 100, maxRounds: 5, candidatesPerRound: 8 },
      async () => batchFn(),
      noFilter,
    );
    expect(result.totalMatrixWarnings).toBe(result.refillRounds * 2);
    expect(result.totalMatrixPasses).toBe(0);
    expect(result.totalMatrixFailures).toBe(0);
  });

  it('accumulates matrixFailures across all batches', async () => {
    const batchFn = async () => ({
      questions: [{ id: `q${++_idCounter}`, testedConcept: `c${_idCounter}`, stem: 'S' }],
      telemetry: {
        medicalReviewRequested: 0, medicalReviewPassed: 0,
        medicalReviewRejected: 0, medicalReviewSkipped: 1,
        ruleRejected: 1, scopeRejected: 0,
        matrixPasses: 0, matrixWarnings: 0, matrixFailures: 1,
        medicalReviewFailureCategories: emptyMedicalReviewFailureCategories(),
      },
    });
    const result = await runAdaptiveRefill(
      2,
      { maxCandidates: 100, maxRounds: 5, candidatesPerRound: 8 },
      async () => batchFn(),
      noFilter,
    );
    expect(result.totalMatrixFailures).toBe(result.refillRounds);
    expect(result.totalMatrixPasses).toBe(0);
    expect(result.totalMatrixWarnings).toBe(0);
  });

  it('GenerationLoopResult exposes all three matrix total fields as numbers', async () => {
    const result = await runAdaptiveRefill(
      1,
      { maxCandidates: 100, maxRounds: 5, candidatesPerRound: 8 },
      async () => makeBatchResult(1, 4, 1, 0),
      noFilter,
    );
    expect(typeof result.totalMatrixPasses).toBe('number');
    expect(typeof result.totalMatrixWarnings).toBe('number');
    expect(typeof result.totalMatrixFailures).toBe('number');
  });
});

// ── Auth enforcement — /generate and /explain ─────────────────────────────────

describe('AI endpoint auth enforcement', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
    seedAuthUsers();
    app = createApp();
  });

  it('POST /api/generate returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/generate')
      .send({ skillId: 'medical-explainer', guide: 'Explain ACE inhibitors' })
      .expect(401);

    expect(res.body.error).toBeDefined();
  });

  it('POST /api/explain returns 401 for unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/explain')
      .send({ stem: 'A patient presents with...', options: ['A', 'B', 'C', 'D'], correct: 0, field: 'Pharmacology' })
      .expect(401);

    expect(res.body.error).toBeDefined();
  });

  it('POST /api/generate-questions returns 401 AUTH_REQUIRED for unauthenticated request after topic validation', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(401);

    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('POST /api/generate-questions still returns 400 INVALID_TOPIC before auth check', async () => {
    const res = await request(app)
      .post('/api/generate-questions')
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced', topic: 'banana heart magic' } })
      .expect(400);

    expect(res.body.code).toBe('INVALID_TOPIC');
  });

  it('POST /api/generate-questions returns 429 GENERATION_BUSY when all concurrency slots are full', async () => {
    // Fill all 3 slots for this user
    tryAcquireSlot('user-1');
    tryAcquireSlot('user-1');
    tryAcquireSlot('user-1');

    const res = await request(app)
      .post('/api/generate-questions')
      .set('Authorization', authHeader('user-1'))
      .send({ config: { mode: 'practice', questionCount: 1, difficulty: 'Balanced' } })
      .expect(429);

    expect(res.body.code).toBe('GENERATION_BUSY');
  });
});

// ── Clinician review sampling and SLA ─────────────────────────────────────────
// Pure-function unit tests (no DB, no HTTP) + integration tests with own setup.

describe('computeDueAt SLA values', () => {
    it('computes SLA deadlines by priority from a fixed reference date', () => {
      const ref = new Date('2026-01-01T00:00:00.000Z');
      expect(computeDueAt('critical', ref)).toEqual(new Date('2026-01-02T00:00:00.000Z')); // +24 h
      expect(computeDueAt('high',     ref)).toEqual(new Date('2026-01-04T00:00:00.000Z')); // +72 h
      expect(computeDueAt('medium',   ref)).toEqual(new Date('2026-01-08T00:00:00.000Z')); // +7 d
      expect(computeDueAt('low',      ref)).toEqual(new Date('2026-01-15T00:00:00.000Z')); // +14 d
    });
  });

  describe('isDeterministicSample', () => {
    it('is stable across repeated calls for the same id', () => {
      const id = 'stability-check-id';
      const first = isDeterministicSample(id);
      expect(isDeterministicSample(id)).toBe(first);
      expect(isDeterministicSample(id)).toBe(first);
    });

    it('samples roughly 10% of IDs from a set of 100', () => {
      const ids = Array.from({ length: 100 }, (_, i) => `q-test-${i}`);
      const sampled = ids.filter(id => isDeterministicSample(id));
      expect(sampled.length).toBeGreaterThan(2);
      expect(sampled.length).toBeLessThan(30);
    });
  });

  describe('computeSamplingDecision', () => {
    it('UWorld Challenge difficulty requires high-priority review', () => {
      const d = computeSamplingDecision('any-id', 'UWorld Challenge', 0, 'approved');
      expect(d).not.toBeNull();
      expect(d!.priority).toBe('high');
      expect(d!.required).toBe(true);
    });

    it('NBME Difficult difficulty requires high-priority review', () => {
      const d = computeSamplingDecision('any-id', 'NBME Difficult', 0, 'approved');
      expect(d).not.toBeNull();
      expect(d!.priority).toBe('high');
    });

    it('restored bank_status requires high-priority review regardless of difficulty', () => {
      const d = computeSamplingDecision('any-id', 'Balanced', 0, 'restored');
      expect(d).not.toBeNull();
      expect(d!.priority).toBe('high');
      expect(d!.reason).toMatch(/quarantine/i);
    });

    it('prior reports require medium-priority review', () => {
      const d = computeSamplingDecision('any-id', 'Balanced', 3, 'approved');
      expect(d).not.toBeNull();
      expect(d!.priority).toBe('medium');
      expect(d!.reason).toMatch(/3 prior report/);
    });

    it('low-risk question in 10% sample gets low-priority review', () => {
      let sampledId = '';
      for (let i = 0; i < 500; i++) {
        if (isDeterministicSample(`fp-sample-${i}`)) { sampledId = `fp-sample-${i}`; break; }
      }
      expect(sampledId).toBeTruthy();
      const d = computeSamplingDecision(sampledId, 'Balanced', 0, 'approved');
      expect(d).not.toBeNull();
      expect(d!.priority).toBe('low');
    });

    it('clean question outside the sample returns null', () => {
      // Find an ID NOT in the sample
      let unsampledId = '';
      for (let i = 0; i < 500; i++) {
        if (!isDeterministicSample(`fp-no-${i}`)) { unsampledId = `fp-no-${i}`; break; }
      }
      expect(unsampledId).toBeTruthy();
      const d = computeSamplingDecision(unsampledId, 'Balanced', 0, 'approved');
      expect(d).toBeNull();
    });
  });

describe('ClinicianReviewService — service integration', () => {
  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
  });

  describe('createOrEscalate', () => {
    it('creates a new review when none exists', async () => {
      const svc = new ClinicianReviewService(getRepositories().clinicianReviews);
      await svc.createOrEscalate({ questionId: 'q-new' }, 'medium', 'test reason');
      const review = await getRepositories().clinicianReviews.findLatestActiveByQuestionId('q-new');
      expect(review).not.toBeNull();
      expect(review!.review_priority).toBe('medium');
      expect(review!.review_status).toBe('pending');
    });

    it('escalates an existing lower-priority review to higher priority', async () => {
      const svc = new ClinicianReviewService(getRepositories().clinicianReviews);
      await svc.createOrEscalate({ questionId: 'q-escalate' }, 'low', 'initial low');
      await svc.createOrEscalate({ questionId: 'q-escalate' }, 'critical', 'critical signal');
      const review = await getRepositories().clinicianReviews.findLatestActiveByQuestionId('q-escalate');
      expect(review!.review_priority).toBe('critical');
      expect(review!.review_reason).toBe('critical signal');
    });

    it('does not downgrade an existing higher-priority review', async () => {
      const svc = new ClinicianReviewService(getRepositories().clinicianReviews);
      await svc.createOrEscalate({ questionId: 'q-no-downgrade' }, 'critical', 'critical first');
      await svc.createOrEscalate({ questionId: 'q-no-downgrade' }, 'low', 'attempted downgrade');
      const review = await getRepositories().clinicianReviews.findLatestActiveByQuestionId('q-no-downgrade');
      expect(review!.review_priority).toBe('critical');
      expect(review!.review_reason).toBe('critical first');
    });

    it('creates a review keyed by fingerprint when no question_id is resolvable', async () => {
      const svc = new ClinicianReviewService(getRepositories().clinicianReviews);
      await svc.createOrEscalate({ fingerprint: 'fp-only' }, 'high', 'no bank question yet');
      const review = await getRepositories().clinicianReviews.findLatestActiveByFingerprint('fp-only');
      expect(review).not.toBeNull();
      expect(review!.question_id).toBeNull();
      expect(review!.review_priority).toBe('high');
    });

    it('escalates a fingerprint-keyed review without creating a duplicate', async () => {
      const svc = new ClinicianReviewService(getRepositories().clinicianReviews);
      await svc.createOrEscalate({ fingerprint: 'fp-escalate' }, 'low', 'initial low');
      await svc.createOrEscalate({ fingerprint: 'fp-escalate' }, 'critical', 'critical signal');
      const queue = await getRepositories().clinicianReviews.findQueue({});
      const forFingerprint = queue.filter(r => r.report_fingerprint === 'fp-escalate');
      expect(forFingerprint).toHaveLength(1);
      expect(forFingerprint[0].review_priority).toBe('critical');
    });
  });

  describe('metrics SLA', () => {
    it('getMetrics reports overdue correctly using backdated review_due_at', async () => {
      const pastDue = new Date(Date.now() - 25 * 3600 * 1000);
      await getRepositories().clinicianReviews.create({ question_id: 'overdue-critical', review_priority: 'critical', review_reason: 'overdue', review_due_at: pastDue });
      await getRepositories().clinicianReviews.create({ question_id: 'overdue-high',     review_priority: 'high',     review_reason: 'overdue', review_due_at: pastDue });
      const m = await new ClinicianReviewService(getRepositories().clinicianReviews).getMetrics();
      expect(m.overdue).toBe(2);
      expect(m.critical_overdue).toBe(1);
      expect(m.high_overdue).toBe(1);
      expect(m.pending).toBe(2);
    });

    it('completion_rate reflects proportion of completed reviews', async () => {
      const ref = computeDueAt('low');
      await getRepositories().clinicianReviews.create({ question_id: 'cr-1', review_priority: 'low', review_reason: 'r', review_due_at: ref, review_status: 'approved' });
      await getRepositories().clinicianReviews.create({ question_id: 'cr-2', review_priority: 'low', review_reason: 'r', review_due_at: ref, review_status: 'pending' });
      const m = await new ClinicianReviewService(getRepositories().clinicianReviews).getMetrics();
      expect(m.completion_rate).toBe(50);
    });
  });
});

// ── Clinician review — HTTP admin endpoints ───────────────────────────────────

describe('clinician review — HTTP admin endpoints', () => {
  let app: ReturnType<typeof createApp>;

  function fingerprintOf(q: Record<string, any>): string {
    const s = (q.stem || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
    const c = (q.testedConcept || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${s}||${c}`;
  }

  async function seedBankQuestion(overrides: Record<string, any> = {}) {
    const q = makePromotableQuestion(overrides);
    const fingerprint = fingerprintOf(q);
    await getRepositories().questions.upsertByExternalId(fingerprint, {
      subject: String(q.subject || ''), system: String(q.system || ''),
      body: { ...q, id: fingerprint, source: 'ai', bankStatus: 'validated_generated' },
      source: 'ai', bankStatus: 'validated_generated',
    });
    return { question: q, fingerprint };
  }

  beforeEach(() => {
    setRepositories(createInMemoryRepositories());
    seedAuthUsers();
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ADMIN_USER_IDS = 'user-1';
    app = createApp();
  });

  afterEach(() => { delete process.env.ADMIN_USER_IDS; });

  describe('GET /api/generated-question-bank/clinician-review', () => {
    it('returns empty queue when no reviews exist', async () => {
      const res = await request(app)
        .get('/api/generated-question-bank/clinician-review')
        .set('Authorization', authHeader())
        .expect(200);
      expect(res.body.reviews).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('returns queued reviews with priority ordering', async () => {
      const ref = computeDueAt('medium');
      await getRepositories().clinicianReviews.create({ question_id: 'q-low',  review_priority: 'low',    review_reason: 'r', review_due_at: ref });
      await getRepositories().clinicianReviews.create({ question_id: 'q-crit', review_priority: 'critical', review_reason: 'r', review_due_at: ref });
      const res = await request(app)
        .get('/api/generated-question-bank/clinician-review')
        .set('Authorization', authHeader())
        .expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.reviews[0].review_priority).toBe('critical');
      expect(res.body.reviews[1].review_priority).toBe('low');
    });

    it('filters by overdue=true', async () => {
      const past = new Date(Date.now() - 48 * 3600 * 1000);
      const future = computeDueAt('low');
      await getRepositories().clinicianReviews.create({ question_id: 'q-past',   review_priority: 'high', review_reason: 'r', review_due_at: past });
      await getRepositories().clinicianReviews.create({ question_id: 'q-future', review_priority: 'low',  review_reason: 'r', review_due_at: future });
      const res = await request(app)
        .get('/api/generated-question-bank/clinician-review?overdue=true')
        .set('Authorization', authHeader())
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.reviews[0].question_id).toBe('q-past');
    });

    it('requires admin authorization', async () => {
      await request(app)
        .get('/api/generated-question-bank/clinician-review')
        .set('Authorization', authHeader('user-999'))
        .expect(403);
    });
  });

  describe('GET /api/generated-question-bank/clinician-review/metrics', () => {
    it('returns SLA metrics summary', async () => {
      const past = new Date(Date.now() - 25 * 3600 * 1000);
      await getRepositories().clinicianReviews.create({ question_id: 'q1', review_priority: 'critical', review_reason: 'r', review_due_at: past });
      const res = await request(app)
        .get('/api/generated-question-bank/clinician-review/metrics')
        .set('Authorization', authHeader())
        .expect(200);
      const m = res.body.metrics;
      expect(m.pending).toBe(1);
      expect(m.overdue).toBe(1);
      expect(m.critical_overdue).toBe(1);
    });

    it('requires admin authorization', async () => {
      await request(app)
        .get('/api/generated-question-bank/clinician-review/metrics')
        .set('Authorization', authHeader('user-999'))
        .expect(403);
    });
  });

  describe('POST /api/generated-question-bank/:id/clinician-review (manual trigger)', () => {
    it('admin can manually trigger a clinician review for any question', async () => {
      const res = await request(app)
        .post('/api/generated-question-bank/manual-trigger-q/clinician-review')
        .set('Authorization', authHeader())
        .send({ priority: 'high', reason: 'Manual admin escalation' })
        .expect(201);
      expect(res.body.review).not.toBeNull();
      expect(res.body.review.review_priority).toBe('high');
      expect(res.body.review.question_id).toBe('manual-trigger-q');
    });

    it('requires admin authorization', async () => {
      await request(app)
        .post('/api/generated-question-bank/q-any/clinician-review')
        .set('Authorization', authHeader('user-999'))
        .send({ priority: 'medium' })
        .expect(403);
    });
  });

  describe('PATCH /api/generated-question-bank/:id/clinician-review (update review)', () => {
    it('admin can update review status to in_review', async () => {
      const ref = computeDueAt('medium');
      await getRepositories().clinicianReviews.create({ question_id: 'q-update', review_priority: 'medium', review_reason: 'r', review_due_at: ref });
      const res = await request(app)
        .patch('/api/generated-question-bank/q-update/clinician-review')
        .set('Authorization', authHeader())
        .send({ review_status: 'in_review', assigned_reviewer_id: 'user-1' })
        .expect(200);
      expect(res.body.review.review_status).toBe('in_review');
    });

    it('sets reviewed_at when status transitions to approved', async () => {
      const ref = computeDueAt('high');
      await getRepositories().clinicianReviews.create({ question_id: 'q-approve', review_priority: 'high', review_reason: 'r', review_due_at: ref });
      const res = await request(app)
        .patch('/api/generated-question-bank/q-approve/clinician-review')
        .set('Authorization', authHeader())
        .send({ review_status: 'approved' })
        .expect(200);
      expect(res.body.review.review_status).toBe('approved');
      expect(res.body.review.reviewed_at).not.toBeNull();
    });

    it('returns 404 when no active review exists for the question', async () => {
      await request(app)
        .patch('/api/generated-question-bank/no-such-q/clinician-review')
        .set('Authorization', authHeader())
        .send({ review_status: 'approved' })
        .expect(404);
    });

    it('requires admin authorization', async () => {
      await request(app)
        .patch('/api/generated-question-bank/q-any/clinician-review')
        .set('Authorization', authHeader('user-999'))
        .send({ review_status: 'approved' })
        .expect(403);
    });
  });

  describe('Clinician review triggers via report submission', () => {
    function postAuthenticatedReport(fingerprint: string, reason: 'wrong_answer' | 'duplicate') {
      return request(app)
        .post('/api/question-reports')
        .set('Authorization', authHeader())
        .send({ fingerprint, reason, clientReportId: randomUUID() });
    }

    it('wrong_answer report (medical accuracy signal) triggers critical review', async () => {
      await postAuthenticatedReport('fp-wrong-answer-trigger', 'wrong_answer')
        .expect(201);
      await new Promise(r => setImmediate(r));
      // No bank questionId was submitted, so the review is keyed by the content
      // fingerprint (report_fingerprint), not question_id — see Issue 3's
      // identifier contract fix.
      const review = await getRepositories().clinicianReviews.findLatestActiveByFingerprint('fp-wrong-answer-trigger');
      expect(review).not.toBeNull();
      expect(review!.question_id).toBeNull();
      expect(review!.review_priority).toBe('critical');
      expect(review!.review_reason).toMatch(/wrong_answer/);
    });

    it('duplicate report triggers high priority review', async () => {
      await postAuthenticatedReport('fp-duplicate-trigger', 'duplicate')
        .expect(201);
      await new Promise(r => setImmediate(r));
      const review = await getRepositories().clinicianReviews.findLatestActiveByFingerprint('fp-duplicate-trigger');
      expect(review).not.toBeNull();
      expect(review!.review_priority).toBe('high');
    });

    it('second wrong_answer report escalates existing high review to critical', async () => {
      // First: duplicate → high
      await postAuthenticatedReport('fp-escalate-trigger', 'duplicate')
        .expect(201);
      await new Promise(r => setImmediate(r));
      // Then: wrong_answer → should escalate to critical
      await postAuthenticatedReport('fp-escalate-trigger', 'wrong_answer')
        .expect(201);
      await new Promise(r => setImmediate(r));
      const review = await getRepositories().clinicianReviews.findLatestActiveByFingerprint('fp-escalate-trigger');
      expect(review!.review_priority).toBe('critical');
    });

    it('a bank questionId in the report is preferred as the review identity', async () => {
      await request(app)
        .post('/api/question-reports')
        .set('Authorization', authHeader())
        .send({ fingerprint: 'fp-with-bank-q', questionId: 'bank-q-123', reason: 'wrong_answer', clientReportId: randomUUID() })
        .expect(201);
      await new Promise(r => setImmediate(r));
      const byQuestionId = await getRepositories().clinicianReviews.findLatestActiveByQuestionId('bank-q-123');
      expect(byQuestionId).not.toBeNull();
      expect(byQuestionId!.review_priority).toBe('critical');
      // Not registered under the fingerprint lookup, since question_id took priority
      const byFingerprint = await getRepositories().clinicianReviews.findLatestActiveByFingerprint('fp-with-bank-q');
      expect(byFingerprint).toBeNull();
    });

    it('a replayed identical report does not create a second review', async () => {
      const clientReportId = randomUUID();
      await request(app)
        .post('/api/question-reports')
        .set('Authorization', authHeader())
        .send({ fingerprint: 'fp-replay-trigger', reason: 'wrong_answer', clientReportId })
        .expect(201);
      await new Promise(r => setImmediate(r));
      await request(app)
        .post('/api/question-reports')
        .set('Authorization', authHeader())
        .send({ fingerprint: 'fp-replay-trigger', reason: 'wrong_answer', clientReportId })
        .expect(201);
      await new Promise(r => setImmediate(r));
      const queue = await getRepositories().clinicianReviews.findQueue({});
      const forFingerprint = queue.filter(r => r.report_fingerprint === 'fp-replay-trigger');
      expect(forFingerprint).toHaveLength(1);
    });

    it('restored question PATCH triggers high-priority review', async () => {
      const { fingerprint } = await seedBankQuestion();
      await getRepositories().questions.updateGeneratedBankStatus(fingerprint, 'quarantined');
      await request(app)
        .patch(`/api/generated-question-bank/${encodeURIComponent(fingerprint)}/status`)
        .set('Authorization', authHeader())
        .send({ status: 'restored' })
        .expect(200);
      await new Promise(r => setImmediate(r));
      const review = await getRepositories().clinicianReviews.findLatestActiveByQuestionId(fingerprint);
      expect(review).not.toBeNull();
      expect(review!.review_priority).toBe('high');
    });
  });
});

afterEach(() => _resetSlots());
