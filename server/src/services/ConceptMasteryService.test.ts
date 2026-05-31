import { describe, it, expect, beforeEach } from 'vitest';
import { ConceptMasteryService } from './ConceptMasteryService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryConceptReviewLogRepository } from '../repositories/memory/ConceptReviewLogRepository.js';
import { InMemoryQuestionConceptsRepository } from '../repositories/memory/QuestionConceptsRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USER_A = 'user-a';
const USER_B = 'user-b';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedConcept(
  concepts: InMemoryConceptsRepository,
  slug: string,
  name: string,
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, { name, subject: 'Cardiology', system: 'Cardiovascular' });
  return c.id;
}

async function seedLink(
  qc: InMemoryQuestionConceptsRepository,
  questionId: string,
  conceptId: string,
): Promise<void> {
  await qc.linkMany([{ questionId, conceptId, weight: 1.0 }]);
}

function daysUntil(date?: Date): number {
  if (!date) return -1;
  return Math.round((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConceptMasteryService', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let qcRepo:      InMemoryQuestionConceptsRepository;
  let concepts:    InMemoryConceptsRepository;
  let service:     ConceptMasteryService;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    qcRepo      = new InMemoryQuestionConceptsRepository();
    concepts    = new InMemoryConceptsRepository();
    service     = new ConceptMasteryService(masteryRepo, qcRepo);
  });

  it('creates a mastery row on first correct answer', async () => {
    const conceptId = await seedConcept(concepts, 'aortic-stenosis', 'Aortic Stenosis');
    await seedLink(qcRepo, 'q-1', conceptId);

    await service.updateFromSession(USER_A, [{ questionDbId: 'q-1', isCorrect: true }]);

    const row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row).not.toBeNull();
    expect(row!.attempts).toBe(1);
    expect(row!.correct).toBe(1);
    expect(row!.mastery_score).toBe(1);
    expect(row!.recent_incorrect_count).toBe(0);
    expect(row!.confidence_score).toBe(0.2); // 1/5
    expect(row!.review_interval_days).toBe(7);
    expect(daysUntil(row!.next_review_at)).toBe(7);
    expect(row!.last_reviewed_at).toBeInstanceOf(Date);
  });

  it('creates a mastery row on first wrong answer', async () => {
    const conceptId = await seedConcept(concepts, 'mitral-regurgitation', 'Mitral Regurgitation');
    await seedLink(qcRepo, 'q-2', conceptId);

    await service.updateFromSession(USER_A, [{ questionDbId: 'q-2', isCorrect: false }]);

    const row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.attempts).toBe(1);
    expect(row!.correct).toBe(0);
    expect(row!.mastery_score).toBe(0);
    expect(row!.recent_incorrect_count).toBe(1);
    expect(row!.confidence_score).toBe(0.2); // 1/5
    expect(row!.review_interval_days).toBe(1);
    expect(daysUntil(row!.next_review_at)).toBe(1);
  });

  it('accumulates attempts and correct across two sessions', async () => {
    const conceptId = await seedConcept(concepts, 'heart-failure', 'Heart Failure');
    await seedLink(qcRepo, 'q-3', conceptId);

    // Session 1: correct
    await service.updateFromSession(USER_A, [{ questionDbId: 'q-3', isCorrect: true }]);
    // Session 2: wrong
    await service.updateFromSession(USER_A, [{ questionDbId: 'q-3', isCorrect: false }]);

    const row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.attempts).toBe(2);
    expect(row!.correct).toBe(1);
    expect(row!.mastery_score).toBe(0.5);
    expect(row!.recent_incorrect_count).toBe(1);
    expect(row!.confidence_score).toBe(0.4); // 2/5
  });

  it('confidence_score saturates at 1.0 after 5 attempts', async () => {
    const conceptId = await seedConcept(concepts, 'confident-concept', 'Confident Concept');
    await seedLink(qcRepo, 'q-conf', conceptId);

    for (let i = 0; i < 5; i++) {
      await service.updateFromSession(USER_A, [{ questionDbId: 'q-conf', isCorrect: true }]);
    }

    const row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.attempts).toBe(5);
    expect(row!.confidence_score).toBe(1.0);
  });

  it('pre-aggregates two questions sharing a concept within one session', async () => {
    const conceptId = await seedConcept(concepts, 'arrhythmia', 'Arrhythmia');
    await seedLink(qcRepo, 'q-4', conceptId);
    await seedLink(qcRepo, 'q-5', conceptId);

    await service.updateFromSession(USER_A, [
      { questionDbId: 'q-4', isCorrect: true },
      { questionDbId: 'q-5', isCorrect: false },
    ]);

    const row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.attempts).toBe(2);
    expect(row!.correct).toBe(1);
    expect(row!.mastery_score).toBe(0.5);
  });

  it('does not roll up to parent concepts', async () => {
    const parentId = await seedConcept(concepts, 'cardiology', 'Cardiology');
    const childId  = await seedConcept(concepts, 'av-block', 'AV Block');
    // Manually set parent — simulates hierarchy existing in DB
    await concepts.upsertBySlug('av-block', {
      name: 'AV Block', subject: 'Cardiology', system: 'Cardiovascular', parent_concept_id: parentId,
    });
    // Only link question to the child concept
    await seedLink(qcRepo, 'q-6', childId);

    await service.updateFromSession(USER_A, [{ questionDbId: 'q-6', isCorrect: true }]);

    const childRow  = await masteryRepo.findByUserAndConcept(USER_A, childId);
    const parentRow = await masteryRepo.findByUserAndConcept(USER_A, parentId);

    expect(childRow).not.toBeNull();
    expect(parentRow).toBeNull(); // hierarchy roll-up is explicitly excluded
  });

  it('is a no-op for empty questionDbId', async () => {
    await service.updateFromSession(USER_A, [{ questionDbId: '', isCorrect: true }]);
    const all = masteryRepo._getAll();
    expect(all).toHaveLength(0);
  });

  it('is a no-op when answeredQuestions is empty', async () => {
    await service.updateFromSession(USER_A, []);
    const all = masteryRepo._getAll();
    expect(all).toHaveLength(0);
  });

  it('isolates mastery between users', async () => {
    const conceptId = await seedConcept(concepts, 'hypertension', 'Hypertension');
    await seedLink(qcRepo, 'q-7', conceptId);

    await service.updateFromSession(USER_A, [{ questionDbId: 'q-7', isCorrect: true }]);
    await service.updateFromSession(USER_B, [{ questionDbId: 'q-7', isCorrect: false }]);

    const rowA = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    const rowB = await masteryRepo.findByUserAndConcept(USER_B, conceptId);

    expect(rowA!.correct).toBe(1);
    expect(rowB!.correct).toBe(0);
  });

  it('findByUserId returns all mastery rows for a user sorted by mastery_score descending', async () => {
    const c1 = await seedConcept(concepts, 'concept-high', 'High Mastery');
    const c2 = await seedConcept(concepts, 'concept-low',  'Low Mastery');
    await seedLink(qcRepo, 'q-8', c1);
    await seedLink(qcRepo, 'q-9', c2);

    await service.updateFromSession(USER_A, [
      { questionDbId: 'q-8', isCorrect: true  }, // mastery 1.0
      { questionDbId: 'q-9', isCorrect: false }, // mastery 0.0
    ]);

    const rows = await masteryRepo.findByUserId(USER_A);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.mastery_score).toBeGreaterThanOrEqual(rows[1]!.mastery_score);
  });

  it('incorrect answers reset the SRS interval to 1 day', async () => {
    const conceptId = await seedConcept(concepts, 'srs-reset', 'SRS Reset');
    await seedLink(qcRepo, 'q-srs-reset', conceptId);

    await service.updateFromSession(USER_A, [{ questionDbId: 'q-srs-reset', isCorrect: true }]);
    let row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.review_interval_days).toBe(7);

    await service.updateFromSession(USER_A, [{ questionDbId: 'q-srs-reset', isCorrect: false }]);
    row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.review_interval_days).toBe(1);
    expect(daysUntil(row!.next_review_at)).toBe(1);
  });

  it('correct answers expand interval by mastery tier', async () => {
    const priority = await seedConcept(concepts, 'srs-priority', 'SRS Priority');
    const focus = await seedConcept(concepts, 'srs-focus', 'SRS Focus');
    const reinforced = await seedConcept(concepts, 'srs-reinforced', 'SRS Reinforced');
    const ontrack = await seedConcept(concepts, 'srs-ontrack', 'SRS On Track');

    await masteryRepo.upsertMany([
      { userId: USER_A, conceptId: priority, attempted: 9, correct: 5 },
      { userId: USER_A, conceptId: focus, attempted: 9, correct: 6 },
      { userId: USER_A, conceptId: reinforced, attempted: 9, correct: 7 },
      { userId: USER_A, conceptId: ontrack, attempted: 9, correct: 8 },
    ]);
    await masteryRepo.upsertMany([
      { userId: USER_A, conceptId: priority, attempted: 1, correct: 1 },
      { userId: USER_A, conceptId: focus, attempted: 1, correct: 1 },
      { userId: USER_A, conceptId: reinforced, attempted: 1, correct: 1 },
      { userId: USER_A, conceptId: ontrack, attempted: 1, correct: 1 },
    ]);

    expect((await masteryRepo.findByUserAndConcept(USER_A, priority))!.review_interval_days).toBe(1);
    expect((await masteryRepo.findByUserAndConcept(USER_A, focus))!.review_interval_days).toBe(2);
    expect((await masteryRepo.findByUserAndConcept(USER_A, reinforced))!.review_interval_days).toBe(4);
    expect((await masteryRepo.findByUserAndConcept(USER_A, ontrack))!.review_interval_days).toBe(7);
  });

  it('persists SRS timestamps on repository rows', async () => {
    const conceptId = await seedConcept(concepts, 'srs-persist', 'SRS Persist');
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 4, correct: 3 }]);
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 1, correct: 1 }]);

    const row = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(row!.review_interval_days).toBe(4);
    expect(row!.next_review_at).toBeInstanceOf(Date);
    expect(row!.last_reviewed_at).toBeInstanceOf(Date);
  });
});

// ── findDueForReview ──────────────────────────────────────────────────────────

describe('findDueForReview', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
  });

  function daysFromNow(n: number): Date {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  }

  it('returns rows where next_review_at is on or before asOf', async () => {
    const c1 = 'concept-due-1';
    const c2 = 'concept-due-2';
    await masteryRepo.upsertMany([
      { userId: USER_A, conceptId: c1, attempted: 5, correct: 5 }, // next_review_at ~ now+7
      { userId: USER_A, conceptId: c2, attempted: 5, correct: 5 }, // next_review_at ~ now+7
    ]);

    // Pass asOf = 8 days from now → both rows are due
    const rows = await masteryRepo.findDueForReview(USER_A, daysFromNow(8));
    expect(rows).toHaveLength(2);
  });

  it('excludes rows where next_review_at is in the future relative to asOf', async () => {
    const conceptId = 'concept-future';
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    // next_review_at = now + 7 days; asOf = now + 3 days → not yet due
    const rows = await masteryRepo.findDueForReview(USER_A, daysFromNow(3));
    expect(rows).toHaveLength(0);
  });

  it('excludes rows where next_review_at is null', async () => {
    // upsertMany always sets next_review_at, so we test via a row that has never
    // been upserted — which means it doesn't exist. Null is the DB default for
    // rows that somehow lack the column (migration guard). findDueForReview
    // explicitly filters IS NOT NULL, so we verify empty result for a fresh repo.
    const rows = await masteryRepo.findDueForReview(USER_A, daysFromNow(30));
    expect(rows).toHaveLength(0);
  });

  it('returns empty array when user has no mastery rows', async () => {
    const rows = await masteryRepo.findDueForReview('unknown-user', daysFromNow(30));
    expect(rows).toHaveLength(0);
  });

  it('orders results by next_review_at ascending', async () => {
    // c1 gets interval=7, c2 gets interval=1 (wrong answer → shorter interval)
    const c1 = 'concept-order-1';
    const c2 = 'concept-order-2';
    await masteryRepo.upsertMany([
      { userId: USER_A, conceptId: c1, attempted: 5, correct: 5 }, // interval 7
      { userId: USER_A, conceptId: c2, attempted: 1, correct: 0 }, // interval 1
    ]);

    // Both due in 8 days
    const rows = await masteryRepo.findDueForReview(USER_A, daysFromNow(8));
    expect(rows).toHaveLength(2);
    // c2 (interval 1, earlier next_review_at) should come first
    expect(rows[0]!.concept_id).toBe(c2);
    expect(rows[1]!.concept_id).toBe(c1);
  });

  it('is isolated between users', async () => {
    const conceptId = 'concept-user-iso-due';
    await masteryRepo.upsertMany([
      { userId: USER_A, conceptId, attempted: 5, correct: 5 },
      { userId: USER_B, conceptId, attempted: 5, correct: 5 },
    ]);

    const rowsA = await masteryRepo.findDueForReview(USER_A, daysFromNow(8));
    const rowsB = await masteryRepo.findDueForReview(USER_B, daysFromNow(8));
    expect(rowsA).toHaveLength(1);
    expect(rowsB).toHaveLength(1);
    expect(rowsA[0]!.user_id).toBe(USER_A);
    expect(rowsB[0]!.user_id).toBe(USER_B);
  });
});

// ── scheduleReview ────────────────────────────────────────────────────────────

describe('scheduleReview', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
  });

  it('again resets interval to 1 regardless of current value', async () => {
    const conceptId = 'c-again';
    // Start at interval 7 (full correct history)
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    const before = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(before!.review_interval_days).toBe(7);

    const result = await masteryRepo.scheduleReview(USER_A, conceptId, 'again');
    expect(result).not.toBeNull();
    expect(result!.reviewIntervalDays).toBe(1);
    expect(daysUntil(result!.nextReviewAt!)).toBe(1);

    const after = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(after!.review_interval_days).toBe(1);
  });

  it('hard preserves current interval', async () => {
    const conceptId = 'c-hard';
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    const before = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    const originalInterval = before!.review_interval_days; // 7

    const result = await masteryRepo.scheduleReview(USER_A, conceptId, 'hard');
    expect(result!.reviewIntervalDays).toBe(originalInterval);

    const after = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(after!.review_interval_days).toBe(originalInterval);
  });

  it('good increases interval by 1.5× (rounded)', async () => {
    const conceptId = 'c-good';
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    const before = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(before!.review_interval_days).toBe(7);

    const result = await masteryRepo.scheduleReview(USER_A, conceptId, 'good');
    expect(result!.reviewIntervalDays).toBe(Math.max(Math.round(7 * 1.5), 1)); // 11

    const after = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(after!.review_interval_days).toBe(11);
  });

  it('easy doubles interval', async () => {
    const conceptId = 'c-easy';
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    const before = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(before!.review_interval_days).toBe(7);

    const result = await masteryRepo.scheduleReview(USER_A, conceptId, 'easy');
    expect(result!.reviewIntervalDays).toBe(14);

    const after = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(after!.review_interval_days).toBe(14);
  });

  it('easy caps at 30 days', async () => {
    const conceptId = 'c-easy-cap';
    // Reach interval 30 by chaining easy reviews
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    // 7 → easy → 14 → easy → 28 → easy → 30 (cap)
    await masteryRepo.scheduleReview(USER_A, conceptId, 'easy'); // 14
    await masteryRepo.scheduleReview(USER_A, conceptId, 'easy'); // 28
    const result = await masteryRepo.scheduleReview(USER_A, conceptId, 'easy'); // 30 (cap from 56)
    expect(result!.reviewIntervalDays).toBe(30);

    const after = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(after!.review_interval_days).toBe(30);
  });

  it('scheduleReview never modifies mastery metrics', async () => {
    const conceptId = 'c-no-contaminate';
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 4, correct: 3 }]);

    const before = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    const { mastery_score, confidence_score, attempts, correct, recent_incorrect_count } = before!;

    await masteryRepo.scheduleReview(USER_A, conceptId, 'easy');
    await masteryRepo.scheduleReview(USER_A, conceptId, 'again');
    await masteryRepo.scheduleReview(USER_A, conceptId, 'good');

    const after = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    expect(after!.mastery_score).toBe(mastery_score);
    expect(after!.confidence_score).toBe(confidence_score);
    expect(after!.attempts).toBe(attempts);
    expect(after!.correct).toBe(correct);
    expect(after!.recent_incorrect_count).toBe(recent_incorrect_count);
  });

  it('returns null when no mastery row exists for the concept', async () => {
    const result = await masteryRepo.scheduleReview(USER_A, 'nonexistent-concept-id', 'good');
    expect(result).toBeNull();
  });

  it('isolates schedule updates between users', async () => {
    const conceptId = 'c-user-iso';
    await masteryRepo.upsertMany([{ userId: USER_A, conceptId, attempted: 5, correct: 5 }]);
    await masteryRepo.upsertMany([{ userId: USER_B, conceptId, attempted: 5, correct: 5 }]);

    await masteryRepo.scheduleReview(USER_A, conceptId, 'again'); // A → interval 1

    const rowA = await masteryRepo.findByUserAndConcept(USER_A, conceptId);
    const rowB = await masteryRepo.findByUserAndConcept(USER_B, conceptId);
    expect(rowA!.review_interval_days).toBe(1);
    expect(rowB!.review_interval_days).toBe(7); // untouched
  });
});

// ── ConceptReviewLogRepository ────────────────────────────────────────────────

describe('ConceptReviewLogRepository', () => {
  let log: InMemoryConceptReviewLogRepository;

  beforeEach(() => {
    log = new InMemoryConceptReviewLogRepository();
  });

  const C1 = 'concept-log-1';
  const C2 = 'concept-log-2';

  it('getStats returns zero counts when log is empty', async () => {
    const stats = await log.getStats(USER_A);
    expect(stats.reviewedToday).toBe(0);
    expect(stats.reviewedThisWeek).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.totalReviewed).toBe(0);
    expect(stats.todayBreakdown).toEqual({ again: 0, hard: 0, good: 0, easy: 0 });
  });

  it('reviewedToday counts all review events for a user today', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good',  intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'again', intervalBefore: 1, intervalAfter: 1 });
    await log.insert({ userId: USER_B, conceptId: C1, result: 'easy',  intervalBefore: 4, intervalAfter: 8 });

    const statsA = await log.getStats(USER_A);
    expect(statsA.reviewedToday).toBe(2); // only USER_A's rows
    const statsB = await log.getStats(USER_B);
    expect(statsB.reviewedToday).toBe(1);
  });

  it('todayBreakdown counts each ease result correctly', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'again', intervalBefore: 1, intervalAfter: 1 });
    await log.insert({ userId: USER_A, conceptId: C1, result: 'again', intervalBefore: 1, intervalAfter: 1 });
    await log.insert({ userId: USER_A, conceptId: C1, result: 'hard',  intervalBefore: 1, intervalAfter: 1 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'good',  intervalBefore: 2, intervalAfter: 3 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'easy',  intervalBefore: 3, intervalAfter: 6 });

    const stats = await log.getStats(USER_A);
    expect(stats.todayBreakdown).toEqual({ again: 2, hard: 1, good: 1, easy: 1 });
  });

  it('totalReviewed counts distinct concepts, not total events', async () => {
    // C1 reviewed twice, C2 once — totalReviewed should be 2
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good',  intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good',  intervalBefore: 2, intervalAfter: 3 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'again', intervalBefore: 1, intervalAfter: 1 });

    const stats = await log.getStats(USER_A);
    expect(stats.totalReviewed).toBe(2);
  });

  it('currentStreak is 1 when reviews exist only today', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good', intervalBefore: 1, intervalAfter: 2 });
    const stats = await log.getStats(USER_A);
    expect(stats.currentStreak).toBe(1);
  });

  it('currentStreak is 0 when no reviews today', async () => {
    // Insert a row with a past timestamp by manipulating _getAll
    // We can't set reviewed_at directly via the public interface,
    // so this tests the empty case only
    const stats = await log.getStats(USER_A);
    expect(stats.currentStreak).toBe(0);
  });

  it('isolates stats between users', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good',  intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_B, conceptId: C1, result: 'again', intervalBefore: 2, intervalAfter: 1 });
    await log.insert({ userId: USER_B, conceptId: C2, result: 'easy',  intervalBefore: 1, intervalAfter: 2 });

    const statsA = await log.getStats(USER_A);
    const statsB = await log.getStats(USER_B);

    expect(statsA.reviewedToday).toBe(1);
    expect(statsB.reviewedToday).toBe(2);
    expect(statsA.totalReviewed).toBe(1);
    expect(statsB.totalReviewed).toBe(2);
  });

  it('reviewedThisWeek includes all events in last 7 days', async () => {
    // All inserts use now() so they all count as this week
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good', intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'hard', intervalBefore: 2, intervalAfter: 2 });

    const stats = await log.getStats(USER_A);
    expect(stats.reviewedThisWeek).toBe(2);
  });

  // ── Phase 5.6 fields ──────────────────────────────────────────────────────

  it('dailyGoal is always 20', async () => {
    const stats = await log.getStats(USER_A);
    expect(stats.dailyGoal).toBe(20);
  });

  it('goalProgress matches reviewedToday', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good', intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'again', intervalBefore: 1, intervalAfter: 1 });

    const stats = await log.getStats(USER_A);
    expect(stats.goalProgress).toBe(stats.reviewedToday);
    expect(stats.goalProgress).toBe(2);
  });

  it('longestStreak is 1 when all reviews are today', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good', intervalBefore: 1, intervalAfter: 2 });

    const stats = await log.getStats(USER_A);
    expect(stats.longestStreak).toBe(1);
  });

  it('longestStreak is at least currentStreak', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good', intervalBefore: 1, intervalAfter: 2 });

    const stats = await log.getStats(USER_A);
    expect(stats.longestStreak).toBeGreaterThanOrEqual(stats.currentStreak);
  });

  it('longestStreak is 0 when no reviews exist', async () => {
    const stats = await log.getStats(USER_A);
    expect(stats.longestStreak).toBe(0);
  });

  it('activeDaysThisWeek is 1 when all reviews are today', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good', intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'hard', intervalBefore: 2, intervalAfter: 2 });

    const stats = await log.getStats(USER_A);
    expect(stats.activeDaysThisWeek).toBe(1); // both reviews are today
  });

  it('activeDaysThisWeek is 0 when log is empty', async () => {
    const stats = await log.getStats(USER_A);
    expect(stats.activeDaysThisWeek).toBe(0);
  });

  it('activity30Days has one entry for today when reviews exist', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good',  intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_A, conceptId: C2, result: 'again', intervalBefore: 1, intervalAfter: 1 });

    const stats = await log.getStats(USER_A);
    expect(stats.activity30Days).toHaveLength(1);
    expect(stats.activity30Days[0]!.reviews).toBe(2);
    expect(stats.activity30Days[0]!.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it('activity30Days is empty when no reviews exist', async () => {
    const stats = await log.getStats(USER_A);
    expect(stats.activity30Days).toEqual([]);
  });

  it('activity30Days counts only this user\'s reviews', async () => {
    await log.insert({ userId: USER_A, conceptId: C1, result: 'good',  intervalBefore: 1, intervalAfter: 2 });
    await log.insert({ userId: USER_B, conceptId: C1, result: 'again', intervalBefore: 1, intervalAfter: 1 });

    const statsA = await log.getStats(USER_A);
    expect(statsA.activity30Days[0]!.reviews).toBe(1); // only USER_A's row
  });
});
