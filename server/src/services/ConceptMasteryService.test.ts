import { describe, it, expect, beforeEach } from 'vitest';
import { ConceptMasteryService } from './ConceptMasteryService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
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
});
