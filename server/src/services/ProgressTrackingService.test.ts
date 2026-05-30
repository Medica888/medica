import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressTrackingService } from './ProgressTrackingService.js';
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

async function seedConcept(concepts: InMemoryConceptsRepository, slug: string): Promise<string> {
  const c = await concepts.upsertBySlug(slug, { name: slug, subject: 'S', system: 'S' });
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

  it('priorityConcepts counts mastery_score < 0.65', async () => {
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

  it('weakConcepts counts mastery_score < 0.75 (priority + focus)', async () => {
    const mastery   = new InMemoryUserConceptMasteryRepository();
    const snapshots = new InMemoryMasterySnapshotsRepository();
    const concepts  = new InMemoryConceptsRepository();
    const c1 = await seedConcept(concepts, 'wc1'); // priority
    const c2 = await seedConcept(concepts, 'wc2'); // focus
    const c3 = await seedConcept(concepts, 'wc3'); // ontrack
    await seedMastery(mastery, USER, c1, 2, 0);    // 0.0  → priority
    await seedMastery(mastery, USER, c2, 20, 13);  // 0.65 → focus
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
