import { describe, it, expect, beforeEach } from 'vitest';
import { StudyPrescriptionService } from './StudyPrescriptionService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';

const USER = 'rx-user';
const MIN  = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedConcept(
  concepts: InMemoryConceptsRepository,
  slug: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, {
    name, subject: 'Pharmacology', system: 'Cardiovascular', parent_concept_id: parentId,
  });
  return c.id;
}

async function seedMastery(
  repo: InMemoryUserConceptMasteryRepository,
  userId: string,
  conceptId: string,
  attempted: number,
  correct: number,
): Promise<void> {
  await repo.upsertMany([{ userId, conceptId, attempted, correct }]);
}

async function seedFillers(
  concepts: InMemoryConceptsRepository,
  mastery:  InMemoryUserConceptMasteryRepository,
  userId:   string,
  count:    number,
  startIdx  = 0,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const id = await seedConcept(concepts, `filler-rx-${startIdx + i}`, `Filler RX ${startIdx + i}`);
    await seedMastery(mastery, userId, id, 10, 9); // mastery 0.9 → on-track (excluded)
  }
}

function makeService(
  mastery:  InMemoryUserConceptMasteryRepository,
  concepts: InMemoryConceptsRepository,
): StudyPrescriptionService {
  return new StudyPrescriptionService(mastery, concepts);
}

// ── Random (insufficient data) ────────────────────────────────────────────────

describe('StudyPrescriptionService — disabled (insufficient data)', () => {
  let mastery:  InMemoryUserConceptMasteryRepository;
  let concepts: InMemoryConceptsRepository;
  beforeEach(() => { mastery = new InMemoryUserConceptMasteryRepository(); concepts = new InMemoryConceptsRepository(); });

  it('returns disabled random prescription when no mastery data', async () => {
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.strategy).toBe('random');
    expect(rx.enabled).toBe(false);
    expect(rx.priority).toHaveLength(0);
    expect(rx.estimatedStudyTime).toBe(0);
  });

  it(`returns disabled when fewer than ${MIN} records`, async () => {
    await seedFillers(concepts, mastery, USER, MIN - 1);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.enabled).toBe(false);
    expect(rx.reason).toMatch(/Only 19/);
  });
});

// ── Adaptive (sufficient data) ────────────────────────────────────────────────

describe('StudyPrescriptionService — enabled (20+ records)', () => {
  let mastery:  InMemoryUserConceptMasteryRepository;
  let concepts: InMemoryConceptsRepository;
  beforeEach(() => { mastery = new InMemoryUserConceptMasteryRepository(); concepts = new InMemoryConceptsRepository(); });

  it(`enables at exactly ${MIN} records`, async () => {
    await seedFillers(concepts, mastery, USER, MIN);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.strategy).toBe('adaptive');
    expect(rx.enabled).toBe(true);
  });

  it('buckets mastery_score < 0.65 into priority', async () => {
    const c = await seedConcept(concepts, 'weak-rx', 'Weak RX');
    await seedMastery(mastery, USER, c, 2, 0); // 0.0 → priority
    await seedFillers(concepts, mastery, USER, MIN - 1, 100);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.priority.some(p => p.name === 'Weak RX')).toBe(true);
  });

  it('buckets 0.65 ≤ mastery_score < 0.75 into focus', async () => {
    const c = await seedConcept(concepts, 'focus-rx', 'Focus RX');
    await seedMastery(mastery, USER, c, 20, 13); // 0.65 exactly → focus
    await seedFillers(concepts, mastery, USER, MIN - 1, 200);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.focus.some(f => f.name === 'Focus RX')).toBe(true);
    expect(rx.priority.some(p => p.name === 'Focus RX')).toBe(false);
  });

  it('buckets 0.75 ≤ mastery_score < 0.85 into reinforced', async () => {
    const c = await seedConcept(concepts, 'reinf-rx', 'Reinforced RX');
    await seedMastery(mastery, USER, c, 20, 15); // 0.75 exactly → reinforced
    await seedFillers(concepts, mastery, USER, MIN - 1, 300);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.reinforced.some(r => r.name === 'Reinforced RX')).toBe(true);
  });

  it('excludes mastery_score >= 0.85 (on-track) from all tiers', async () => {
    const c1 = await seedConcept(concepts, 'ontrack-85', 'On Track 85');
    const c2 = await seedConcept(concepts, 'ontrack-92', 'On Track 92');
    await seedMastery(mastery, USER, c1, 20, 17); // 0.85 → excluded
    await seedMastery(mastery, USER, c2, 10, 10); // 1.0  → excluded
    await seedFillers(concepts, mastery, USER, MIN - 2, 400);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    const allNames = [...rx.priority, ...rx.focus, ...rx.reinforced].map(c => c.name);
    expect(allNames).not.toContain('On Track 85');
    expect(allNames).not.toContain('On Track 92');
  });

  it('recommendation differs by recentIncorrect for priority tier', async () => {
    const c1 = await seedConcept(concepts, 'high-err-rx', 'High Error');
    const c2 = await seedConcept(concepts, 'low-err-rx',  'Low Error');
    // 4 attempts, 0 correct: recentIncorrect=4 (>= 3) → "Repeated errors…"
    await seedMastery(mastery, USER, c1, 4, 0);
    // 2 attempts, 1 correct: recentIncorrect=1 → default message
    await seedMastery(mastery, USER, c2, 2, 1);
    await seedFillers(concepts, mastery, USER, MIN - 2, 500);
    const rx   = await makeService(mastery, concepts).getPrescription(USER);
    const highErr = rx.priority.find(p => p.name === 'High Error');
    const lowErr  = rx.priority.find(p => p.name === 'Low Error');
    expect(highErr?.recommendation).toMatch(/Repeated errors/);
    expect(lowErr?.recommendation).not.toMatch(/Repeated errors/);
  });

  it('estimatedStudyTime = priority×5 + focus×3 + reinforced×2', async () => {
    // 1 priority + 1 focus + 1 reinforced → 5+3+2 = 10
    const c1 = await seedConcept(concepts, 'est-p', 'Est P');
    const c2 = await seedConcept(concepts, 'est-f', 'Est F');
    const c3 = await seedConcept(concepts, 'est-r', 'Est R');
    await seedMastery(mastery, USER, c1, 2, 0);    // 0.0  → priority
    await seedMastery(mastery, USER, c2, 20, 13);   // 0.65 → focus
    await seedMastery(mastery, USER, c3, 20, 15);   // 0.75 → reinforced
    await seedFillers(concepts, mastery, USER, MIN - 3, 600);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    const p = rx.priority.filter(x => x.name === 'Est P').length;
    const f = rx.focus.filter(x => x.name === 'Est F').length;
    const r = rx.reinforced.filter(x => x.name === 'Est R').length;
    expect(rx.estimatedStudyTime).toBe(p * 5 + f * 3 + r * 2 +
      (rx.priority.length - p) * 5 + (rx.focus.length - f) * 3 + (rx.reinforced.length - r) * 2);
  });

  it('recommendedQuestions is capped at 40', async () => {
    // 8 priority + 6 focus = 8*5 + 6*3 = 58 → capped at 40
    for (let i = 0; i < 8; i++) {
      const id = await seedConcept(concepts, `cap-p-${i}`, `Cap P ${i}`);
      await seedMastery(mastery, USER, id, 2, 0);
    }
    for (let i = 0; i < 6; i++) {
      const id = await seedConcept(concepts, `cap-f-${i}`, `Cap F ${i}`);
      await seedMastery(mastery, USER, id, 20, 13);
    }
    await seedFillers(concepts, mastery, USER, MIN - 14, 700);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.recommendedQuestions).toBeLessThanOrEqual(40);
  });

  it('recommendedFlashcards is capped at 30', async () => {
    for (let i = 0; i < 8; i++) {
      const id = await seedConcept(concepts, `capfc-p-${i}`, `Cap FC P ${i}`);
      await seedMastery(mastery, USER, id, 2, 0);
    }
    for (let i = 0; i < 6; i++) {
      const id = await seedConcept(concepts, `capfc-f-${i}`, `Cap FC F ${i}`);
      await seedMastery(mastery, USER, id, 20, 13);
    }
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `capfc-r-${i}`, `Cap FC R ${i}`);
      await seedMastery(mastery, USER, id, 20, 15);
    }
    await seedFillers(concepts, mastery, USER, MIN - 19, 800);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.recommendedFlashcards).toBeLessThanOrEqual(30);
  });

  it('excludes parent concepts that have no direct mastery row', async () => {
    const parentId = await seedConcept(concepts, 'parent-rx', 'Parent RX');
    const childId  = await seedConcept(concepts, 'child-rx',  'Child RX', parentId);
    await seedMastery(mastery, USER, childId, 2, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 900);
    const rx   = await makeService(mastery, concepts).getPrescription(USER);
    const all  = [...rx.priority, ...rx.focus, ...rx.reinforced].map(c => c.name);
    expect(all).toContain('Child RX');
    expect(all).not.toContain('Parent RX');
  });

  it('each PrescriptionConcept includes all required fields', async () => {
    const c = await seedConcept(concepts, 'fields-rx', 'Fields RX');
    await seedMastery(mastery, USER, c, 3, 1);
    await seedFillers(concepts, mastery, USER, MIN - 1, 1000);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    const item = [...rx.priority, ...rx.focus, ...rx.reinforced][0];
    if (item) {
      expect(typeof item.name).toBe('string');
      expect(typeof item.masteryScore).toBe('number');
      expect(typeof item.confidence).toBe('number');
      expect(typeof item.attempts).toBe('number');
      expect(typeof item.recentIncorrect).toBe('number');
      expect(typeof item.recommendation).toBe('string');
    }
  });
});
