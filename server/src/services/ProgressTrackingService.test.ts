import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressTrackingService, readinessStatus } from './ProgressTrackingService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryMasterySnapshotsRepository } from '../repositories/memory/MasterySnapshotsRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';

const USER = 'prog-user';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedMastery(
  masteryRepo: InMemoryUserConceptMasteryRepository,
  userId:      string,
  conceptId:   string,
  attempted:   number,
  correct:     number,
): Promise<void> {
  await masteryRepo.upsertMany([{ userId, conceptId, attempted, correct }]);
}

async function seedConcept(
  concepts: InMemoryConceptsRepository,
  slug: string,
  source: 'legacy' | 'canonical' = 'legacy',
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, { name: slug, subject: 'S', system: 'S', source });
  return c.id;
}

function makeService(
  mastery:   InMemoryUserConceptMasteryRepository,
  snapshots: InMemoryMasterySnapshotsRepository,
): ProgressTrackingService {
  return new ProgressTrackingService(mastery, snapshots);
}

// ── takeSnapshot ──────────────────────────────────────────────────────────────

describe('ProgressTrackingService.takeSnapshot', () => {
  it('inserts one snapshot row per mastery record', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();

    const c1 = await seedConcept(concepts, 'c1');
    const c2 = await seedConcept(concepts, 'c2');
    await seedMastery(mastery, USER, c1, 2, 1);
    await seedMastery(mastery, USER, c2, 3, 3);

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'session-001');

    const rows = snapshots._getAll().filter((r) => r.user_id === USER);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.session_id === 'session-001')).toBe(true);
  });

  it('is a no-op when user has no mastery rows', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const svc = makeService(mastery, snapshots);
    await expect(svc.takeSnapshot(USER, 'session-empty')).resolves.toBeUndefined();
    expect(snapshots._getAll()).toHaveLength(0);
  });
});

// ── getProgress ───────────────────────────────────────────────────────────────

describe('ProgressTrackingService.getProgress', () => {
  it('returns zeros with null previous when no snapshots exist', async () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    const p = await svc.getProgress(USER);
    expect(p.currentMastery).toBe(0);
    expect(p.previousMastery).toBeNull();
    expect(p.improvement).toBeNull();
    expect(p.sessionCount).toBe(0);
    expect(p.priorityConcepts.previous).toBeNull();
    expect(p.weakConcepts.previous).toBeNull();
  });

  it('returns current with null previous when only one batch exists', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'solo');
    await seedMastery(mastery, USER, c1, 4, 2); // mastery 0.5

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-1');

    const p = await svc.getProgress(USER);
    expect(p.currentMastery).toBe(0.5);
    expect(p.previousMastery).toBeNull();
    expect(p.improvement).toBeNull();
    expect(p.sessionCount).toBe(1);
  });

  it('returns correct delta between two batches', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'improving');

    // Batch 1: mastery 0.25
    await seedMastery(mastery, USER, c1, 4, 1);
    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-A');

    // Batch 2: mastery 0.75 (add more correct answers)
    const mastery2 = new InMemoryUserConceptMasteryRepository();
    await seedMastery(mastery2, USER, c1, 4, 3);
    const svc2 = makeService(mastery2, snapshots);
    await svc2.takeSnapshot(USER, 'sess-B');

    const p = await makeService(mastery, snapshots).getProgress(USER);
    expect(p.currentMastery).toBe(0.75);
    expect(p.previousMastery).toBe(0.25);
    expect(p.improvement).toBe(0.5);
    expect(p.sessionCount).toBe(2);
  });

  it('priorityConcepts counts mastery_score < 0.50', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'pc1');
    const c2 = await seedConcept(concepts, 'pc2');
    await seedMastery(mastery, USER, c1, 2, 0); // 0.0 → priority
    await seedMastery(mastery, USER, c2, 2, 2); // 1.0 → ontrack

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-pc');
    const p = await svc.getProgress(USER);
    expect(p.priorityConcepts.current).toBe(1);
  });

  it('weakConcepts counts mastery_score < 0.70 (P1 + P2)', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'wc1'); // priority
    const c2 = await seedConcept(concepts, 'wc2'); // focus
    const c3 = await seedConcept(concepts, 'wc3'); // ontrack
    await seedMastery(mastery, USER, c1, 2, 0);    // 0.0  → priority
    await seedMastery(mastery, USER, c2, 20, 13);  // 0.65 -> focus
    await seedMastery(mastery, USER, c3, 2, 2);    // 1.0  → ontrack

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-wc');
    const p = await svc.getProgress(USER);
    expect(p.priorityConcepts.current).toBe(1);  // only 0.0
    expect(p.weakConcepts.current).toBe(2);       // 0.0 + 0.65
  });
});

// ── getMasteryTrend ───────────────────────────────────────────────────────────

describe('ProgressTrackingService.getMasteryTrend', () => {
  it('returns empty array when no snapshots', async () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    expect(await svc.getMasteryTrend(USER)).toEqual([]);
  });

  it('returns one trend point per session, chronological', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'trend1');
    await seedMastery(mastery, USER, c1, 2, 0);

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-t1');
    await svc.takeSnapshot(USER, 'sess-t2');

    const trend = await svc.getMasteryTrend(USER);
    expect(trend).toHaveLength(2);
    expect(trend[0]!.sessionId).toBe('sess-t1');
    expect(trend[1]!.sessionId).toBe('sess-t2');
  });

  it('groups all concepts from the same session into one trend point', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'mg-c1');
    const c2 = await seedConcept(concepts, 'mg-c2');
    await seedMastery(mastery, USER, c1, 2, 2); // mastery 1.0
    await seedMastery(mastery, USER, c2, 2, 0); // mastery 0.0

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-mg1');

    const trend = await svc.getMasteryTrend(USER);
    expect(trend).toHaveLength(1);
    expect(trend[0]!.totalConcepts).toBe(2);
    expect(trend[0]!.avgMastery).toBe(0.5); // (1.0 + 0.0) / 2
  });

  it('preserves chronological ordering across multiple sessions', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'ord-c1');
    await seedMastery(mastery, USER, c1, 2, 1);

    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-ord-a');
    await svc.takeSnapshot(USER, 'sess-ord-b');
    await svc.takeSnapshot(USER, 'sess-ord-c');

    const trend = await svc.getMasteryTrend(USER);
    expect(trend.map((t) => t.sessionId)).toEqual(['sess-ord-a', 'sess-ord-b', 'sess-ord-c']);
  });
});

// ── getImprovementRate / getLearningVelocity ──────────────────────────────────

describe('ProgressTrackingService derived metrics', () => {
  it('getImprovementRate returns 0 for <2 points', () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    expect(svc.getImprovementRate([])).toBe(0);
    expect(svc.getImprovementRate([
      { sessionId: 's', date: '', avgMastery: 0.5, totalConcepts: 1,
        priorityCount: 1, focusCount: 0, reinforcedCount: 0, ontrkCount: 0 },
    ])).toBe(0);
  });

  it('getImprovementRate returns positive for improving trend', () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    const trend = [
      { sessionId: 's1', date: '', avgMastery: 0.4, totalConcepts: 1, priorityCount: 1, focusCount: 0, reinforcedCount: 0, ontrkCount: 0 },
      { sessionId: 's2', date: '', avgMastery: 0.6, totalConcepts: 1, priorityCount: 0, focusCount: 1, reinforcedCount: 0, ontrkCount: 0 },
      { sessionId: 's3', date: '', avgMastery: 0.8, totalConcepts: 1, priorityCount: 0, focusCount: 0, reinforcedCount: 1, ontrkCount: 0 },
    ];
    expect(svc.getImprovementRate(trend)).toBe(0.2); // (0.8-0.4)/2
  });

  it('getLearningVelocity returns negative when priority count drops (improving)', () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    const trend = [
      { sessionId: 's1', date: '', avgMastery: 0.3, totalConcepts: 3, priorityCount: 3, focusCount: 0, reinforcedCount: 0, ontrkCount: 0 },
      { sessionId: 's2', date: '', avgMastery: 0.5, totalConcepts: 3, priorityCount: 1, focusCount: 2, reinforcedCount: 0, ontrkCount: 0 },
    ];
    expect(svc.getLearningVelocity(trend)).toBe(-2); // (1-3)/1
  });
});

// ── readinessStatus ───────────────────────────────────────────────────────────

describe('readinessStatus', () => {
  it('maps 0–49 to Needs Intensive Review', () => {
    expect(readinessStatus(0)).toBe('Needs Intensive Review');
    expect(readinessStatus(49)).toBe('Needs Intensive Review');
  });
  it('maps 50–69 to Developing', () => {
    expect(readinessStatus(50)).toBe('Developing');
    expect(readinessStatus(69)).toBe('Developing');
  });
  it('maps 70–84 to Approaching Readiness', () => {
    expect(readinessStatus(70)).toBe('Approaching Readiness');
    expect(readinessStatus(84)).toBe('Approaching Readiness');
  });
  it('maps 85–100 to Exam Ready', () => {
    expect(readinessStatus(85)).toBe('Exam Ready');
    expect(readinessStatus(100)).toBe('Exam Ready');
  });
});

// ── getReadiness ──────────────────────────────────────────────────────────────

describe('ProgressTrackingService.getReadiness', () => {
  it('returns 0 and Needs Intensive Review when no mastery data', async () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    const r = await svc.getReadiness(USER);
    expect(r.overallReadiness).toBe(0);
    expect(r.status).toBe('Needs Intensive Review');
  });

  it('never returns NaN or out-of-bounds with zero snapshots', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'no-snap');
    await seedMastery(mastery, USER, c1, 2, 1);
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    expect(Number.isNaN(r.overallReadiness)).toBe(false);
    expect(r.overallReadiness).toBeGreaterThanOrEqual(0);
    expect(r.overallReadiness).toBeLessThanOrEqual(100);
  });

  it('never returns NaN with a single snapshot batch', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'one-snap');
    await seedMastery(mastery, USER, c1, 2, 1);
    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'sess-only');
    const r = await svc.getReadiness(USER);
    expect(Number.isNaN(r.overallReadiness)).toBe(false);
    expect(r.overallReadiness).toBeGreaterThanOrEqual(0);
  });

  it('returns Exam Ready for strong all-correct mastery with adequate concept coverage', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    for (let i = 0; i < 20; i++) {
      const id = await seedConcept(concepts, `strong-${i}`);
      await seedMastery(mastery, USER, id, 5, 5); // mastery 1.0, confidence 1.0
    }
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    expect(r.status).toBe('Exam Ready');
    expect(r.overallReadiness).toBeGreaterThanOrEqual(85);
  });

  it('caps status at Developing when fewer than 20 concepts are tracked — even with perfect mastery', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `early-${i}`);
      await seedMastery(mastery, USER, id, 5, 5); // mastery 1.0
    }
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    // Concept Readiness penalizes low coverage even when early mastery is perfect.
    expect(r.overallReadiness).toBeLessThan(85);
    expect(r.components.coverage).toBeLessThan(20);
    expect(r.status).not.toBe('Exam Ready');
    expect(r.status).not.toBe('Approaching Readiness');
    expect(r.status).toBe('Developing');
  });

  it('caps status at Developing at the boundary of 19 concepts', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    for (let i = 0; i < 19; i++) {
      const id = await seedConcept(concepts, `boundary-${i}`);
      await seedMastery(mastery, USER, id, 5, 5);
    }
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    expect(r.status).toBe('Developing');
  });

  it('allows normal status at exactly 20 concepts', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    for (let i = 0; i < 20; i++) {
      const id = await seedConcept(concepts, `min-${i}`);
      await seedMastery(mastery, USER, id, 5, 5);
    }
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    // 20 concepts — cap no longer applies; strong mastery should reach Exam Ready
    expect(r.status).toBe('Exam Ready');
  });

  it('does not cap Needs Intensive Review — low mastery stays low regardless of count', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `low-${i}`);
      await seedMastery(mastery, USER, id, 2, 0); // mastery 0
    }
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    expect(r.status).toBe('Needs Intensive Review');
  });

  it('uses canonical concepts only when computing public Concept Readiness', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const canonicalId = await seedConcept(concepts, 'canonical-readiness', 'canonical');
    const legacyId    = await seedConcept(concepts, 'legacy-readiness');
    await seedMastery(mastery, USER, canonicalId, 10, 10);
    await seedMastery(mastery, USER, legacyId, 10, 0);

    const r = await new ProgressTrackingService(mastery, snapshots, concepts).getReadiness(USER);

    expect(r.components.mastery).toBe(45);
    expect(r.components.recentPerformance).toBe(20);
    expect(r.components.coverage).toBe(1);
    expect(r.legacyInternal?.components.mastery).toBe(25);
  });

  it('returns Needs Intensive Review for all-zero mastery', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `zero-${i}`);
      await seedMastery(mastery, USER, id, 2, 0); // mastery 0
    }
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    expect(r.status).toBe('Needs Intensive Review');
    expect(r.overallReadiness).toBeLessThan(50);
  });

  it('keeps legacy trend-sensitive readiness internal for backward compatibility', async () => {
    const concepts = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'trend-cmp');

    // User A: improving trend
    const masteryA   = new InMemoryUserConceptMasteryRepository();
    const snapshotsA = new InMemoryMasterySnapshotsRepository();
    await seedMastery(masteryA, USER, c1, 4, 2); // mastery 0.5
    const svcA = makeService(masteryA, snapshotsA);
    await snapshotsA.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'A1', masteryScore: 0.3, confidence: 0.4, attemptCount: 2 }]);
    await snapshotsA.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'A2', masteryScore: 0.5, confidence: 0.4, attemptCount: 4 }]);
    const rA = await svcA.getReadiness(USER);

    // User B: declining trend
    const masteryB   = new InMemoryUserConceptMasteryRepository();
    const snapshotsB = new InMemoryMasterySnapshotsRepository();
    await seedMastery(masteryB, USER, c1, 4, 2); // same mastery 0.5
    const svcB = makeService(masteryB, snapshotsB);
    await snapshotsB.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'B1', masteryScore: 0.7, confidence: 0.4, attemptCount: 4 }]);
    await snapshotsB.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'B2', masteryScore: 0.5, confidence: 0.4, attemptCount: 4 }]);
    const rB = await svcB.getReadiness(USER);

    expect(rA.overallReadiness).toBe(rB.overallReadiness);
    expect(rA.legacyInternal?.overallReadiness).toBeGreaterThan(rB.legacyInternal?.overallReadiness ?? 0);
  });

  it('distribution sums to total concept count', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const ids = [
      await seedConcept(concepts, 'dist-p'), // priority
      await seedConcept(concepts, 'dist-f'), // focus
      await seedConcept(concepts, 'dist-r'), // reinforced
      await seedConcept(concepts, 'dist-o'), // ontrack
    ];
    await seedMastery(mastery, USER, ids[0]!, 2, 0);    // 0.0
    await seedMastery(mastery, USER, ids[1]!, 20, 13);  // 0.65
    await seedMastery(mastery, USER, ids[2]!, 20, 15);  // 0.75
    await seedMastery(mastery, USER, ids[3]!, 10, 10);  // 1.0
    const r = await makeService(mastery, snapshots).getReadiness(USER);
    const { priority, focus, reinforced, ontrack } = r.distribution;
    expect(priority + focus + reinforced + ontrack).toBe(4);
    expect(priority).toBe(1);
    expect(focus).toBe(1);
    expect(reinforced).toBe(1);
    expect(ontrack).toBe(1);
  });
});

// ── getTopicReadiness ─────────────────────────────────────────────────────────

describe('ProgressTrackingService.getTopicReadiness', () => {
  it('returns null for a concept the user has never seen', async () => {
    const svc = makeService(
      new InMemoryUserConceptMasteryRepository(),
      new InMemoryMasterySnapshotsRepository(),
    );
    const r = await svc.getTopicReadiness(USER, '00000000-0000-0000-0000-000000000000');
    expect(r).toBeNull();
  });

  it('returns stable trend when only one snapshot batch exists', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'topic-stable');
    await seedMastery(mastery, USER, c1, 2, 1);
    const svc = makeService(mastery, snapshots);
    await svc.takeSnapshot(USER, 'single-batch');
    const r = await svc.getTopicReadiness(USER, c1);
    expect(r?.trend).toBe('stable');
  });

  it('returns up when mastery improved between batches', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'topic-up');
    await seedMastery(mastery, USER, c1, 4, 3); // current 0.75
    const svc = makeService(mastery, snapshots);
    // Batch 1: lower mastery
    await snapshots.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'up-1', masteryScore: 0.4, confidence: 0.4, attemptCount: 2 }]);
    // Batch 2: higher mastery
    await snapshots.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'up-2', masteryScore: 0.75, confidence: 0.6, attemptCount: 4 }]);
    const r = await svc.getTopicReadiness(USER, c1);
    expect(r?.trend).toBe('up');
  });

  it('returns down when mastery declined between batches', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'topic-down');
    await seedMastery(mastery, USER, c1, 4, 1); // current 0.25
    const svc = makeService(mastery, snapshots);
    await snapshots.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'down-1', masteryScore: 0.7, confidence: 0.6, attemptCount: 4 }]);
    await snapshots.insertBatch([{ userId: USER, conceptId: c1, sessionId: 'down-2', masteryScore: 0.25, confidence: 0.4, attemptCount: 4 }]);
    const r = await svc.getTopicReadiness(USER, c1);
    expect(r?.trend).toBe('down');
  });

  it('readiness is bounded 0–100', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'topic-bound');
    await seedMastery(mastery, USER, c1, 5, 5); // mastery 1.0, confidence 1.0
    const r = await makeService(mastery, snapshots).getTopicReadiness(USER, c1);
    expect(r!.readiness).toBeGreaterThanOrEqual(0);
    expect(r!.readiness).toBeLessThanOrEqual(100);
  });

  it('includes a non-empty recommendation string', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'topic-rec');
    await seedMastery(mastery, USER, c1, 3, 1);
    const r = await makeService(mastery, snapshots).getTopicReadiness(USER, c1);
    expect(typeof r!.recommendation).toBe('string');
    expect(r!.recommendation.length).toBeGreaterThan(0);
  });
});

// ── MasterySnapshotsRepository — findByUserId limit ──────────────────────────

describe('InMemoryMasterySnapshotsRepository.findByUserId — limit', () => {
  it('returns all rows when total is below the limit', async () => {
    const snapshots = new InMemoryMasterySnapshotsRepository();
    await snapshots.insertBatch([
      { userId: USER, conceptId: 'c1', sessionId: 's1', masteryScore: 0.5, confidence: 0.5, attemptCount: 2 },
      { userId: USER, conceptId: 'c2', sessionId: 's1', masteryScore: 0.6, confidence: 0.6, attemptCount: 3 },
    ]);
    const rows = await snapshots.findByUserId(USER, 100);
    expect(rows).toHaveLength(2);
  });

  it('returns the most recent rows when limit is smaller than total', async () => {
    const snapshots = new InMemoryMasterySnapshotsRepository();
    // Insert 3 batches of 2 concepts each = 6 rows total
    await snapshots.insertBatch([
      { userId: USER, conceptId: 'c1', sessionId: 's-old-1', masteryScore: 0.3, confidence: 0.3, attemptCount: 1 },
      { userId: USER, conceptId: 'c2', sessionId: 's-old-1', masteryScore: 0.4, confidence: 0.4, attemptCount: 1 },
    ]);
    await snapshots.insertBatch([
      { userId: USER, conceptId: 'c1', sessionId: 's-old-2', masteryScore: 0.5, confidence: 0.5, attemptCount: 2 },
      { userId: USER, conceptId: 'c2', sessionId: 's-old-2', masteryScore: 0.6, confidence: 0.6, attemptCount: 2 },
    ]);
    await snapshots.insertBatch([
      { userId: USER, conceptId: 'c1', sessionId: 's-new', masteryScore: 0.7, confidence: 0.7, attemptCount: 3 },
      { userId: USER, conceptId: 'c2', sessionId: 's-new', masteryScore: 0.8, confidence: 0.8, attemptCount: 3 },
    ]);
    // Limit to 3 most recent rows
    const rows = await snapshots.findByUserId(USER, 3);
    expect(rows).toHaveLength(3);
    // Result is ASC ordered — oldest of the returned window is first
    const sessionIds = rows.map((r) => r.session_id);
    // The newest batch (s-new) must be included; the oldest (s-old-1) may be truncated
    expect(sessionIds).toContain('s-new');
    expect(sessionIds).not.toContain('s-old-1');
  });

  it('returns results in created_at ASC order', async () => {
    const snapshots = new InMemoryMasterySnapshotsRepository();
    await snapshots.insertBatch([
      { userId: USER, conceptId: 'c1', sessionId: 'first', masteryScore: 0.3, confidence: 0.3, attemptCount: 1 },
    ]);
    await snapshots.insertBatch([
      { userId: USER, conceptId: 'c1', sessionId: 'last', masteryScore: 0.8, confidence: 0.8, attemptCount: 3 },
    ]);
    const rows = await snapshots.findByUserId(USER, 5000);
    expect(rows[0]!.session_id).toBe('first');
    expect(rows[rows.length - 1]!.session_id).toBe('last');
  });

  it('default limit of 5000 does not truncate a normal-sized dataset', async () => {
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const batch = Array.from({ length: 50 }, (_, i) => ({
      userId: USER, conceptId: `c${i}`, sessionId: 'big-session',
      masteryScore: 0.5, confidence: 0.5, attemptCount: 1,
    }));
    await snapshots.insertBatch(batch);
    const rows = await snapshots.findByUserId(USER); // no limit arg — uses default 5000
    expect(rows).toHaveLength(50);
  });
});
