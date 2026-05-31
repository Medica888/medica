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
  subject = 'Pharmacology',
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, {
    name, subject, system: 'Cardiovascular', parent_concept_id: parentId,
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

describe('StudyPrescriptionService - daily study plan', () => {
  let mastery:  InMemoryUserConceptMasteryRepository;
  let concepts: InMemoryConceptsRepository;
  const score = {
    overallReadiness: 62,
    status: 'Developing' as const,
    components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 },
    distribution: { priority: 0, focus: 0, reinforced: 0, ontrack: 0 },
  };

  beforeEach(() => {
    mastery = new InMemoryUserConceptMasteryRepository();
    concepts = new InMemoryConceptsRepository();
  });

  it('returns an empty concept review plan when there is no mastery data', async () => {
    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(plan.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plan.readinessStatus).toBe('Developing');
    expect(plan.conceptReviews).toHaveLength(0);
    expect(plan.focusSubjects).toHaveLength(0);
    expect(plan.summary).toMatch(/No urgent concept reviews/);
  });

  it('ranks priority concepts before focus and reinforced concepts', async () => {
    const focusId = await seedConcept(concepts, 'daily-focus', 'Daily Focus');
    const priorityId = await seedConcept(concepts, 'daily-priority', 'Daily Priority');
    const reinforcedId = await seedConcept(concepts, 'daily-reinforced', 'Daily Reinforced');
    await seedMastery(mastery, USER, focusId, 20, 13);
    await seedMastery(mastery, USER, priorityId, 5, 1);
    await seedMastery(mastery, USER, reinforcedId, 20, 15);
    await seedFillers(concepts, mastery, USER, MIN - 3, 1200);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(plan.conceptReviews[0]?.conceptId).toBe(priorityId);
    expect(plan.conceptReviews[0]?.priority).toBe('priority');
  });

  it('uses mastery, confidence, and recent incorrects to break ranking ties', async () => {
    const c1 = await seedConcept(concepts, 'daily-tie-high-conf', 'High Confidence Tie');
    const c2 = await seedConcept(concepts, 'daily-tie-low-conf', 'Low Confidence Tie');
    const c3 = await seedConcept(concepts, 'daily-tie-more-wrong', 'More Wrong Tie');
    await seedMastery(mastery, USER, c1, 10, 5);
    await seedMastery(mastery, USER, c2, 2, 1);
    await seedMastery(mastery, USER, c3, 10, 5);
    await seedFillers(concepts, mastery, USER, MIN - 3, 1300);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const ids = plan.conceptReviews.map((r) => r.conceptId);
    expect(ids.indexOf(c2)).toBeLessThan(ids.indexOf(c1));
    expect(ids).toContain(c3);
  });

  it('caps concept reviews at 5', async () => {
    for (let i = 0; i < 8; i++) {
      const id = await seedConcept(concepts, `daily-cap-${i}`, `Daily Cap ${i}`);
      await seedMastery(mastery, USER, id, 5, 0);
    }
    await seedFillers(concepts, mastery, USER, MIN - 8, 1400);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(plan.conceptReviews).toHaveLength(5);
  });

  it('estimates time from questions, flashcards, and concept reviews', async () => {
    const c1 = await seedConcept(concepts, 'daily-est-p', 'Daily Est P');
    const c2 = await seedConcept(concepts, 'daily-est-f', 'Daily Est F');
    await seedMastery(mastery, USER, c1, 2, 0);
    await seedMastery(mastery, USER, c2, 20, 13);
    await seedFillers(concepts, mastery, USER, MIN - 2, 1500);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(plan.estimatedMinutes).toBe(
      plan.recommendedQuestions * 2 + plan.recommendedFlashcards + plan.conceptReviews.length * 3,
    );
  });

  it('derives focus subjects from selected concept reviews', async () => {
    const c1 = await seedConcept(concepts, 'daily-subject-pharm', 'Daily Pharm', undefined, 'Pharmacology');
    const c2 = await seedConcept(concepts, 'daily-subject-renal', 'Daily Renal', undefined, 'Nephrology');
    await seedMastery(mastery, USER, c1, 2, 0);
    await seedMastery(mastery, USER, c2, 3, 0);
    await seedFillers(concepts, mastery, USER, MIN - 2, 1600);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(plan.focusSubjects).toContain('Pharmacology');
    expect(plan.focusSubjects).toContain('Nephrology');
    expect(plan.summary).toMatch(/concepts/);
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

// ── Readiness-aware caps (P1) ─────────────────────────────────────────────────

describe('StudyPrescriptionService — readiness-aware caps (P1)', () => {
  let mastery:  InMemoryUserConceptMasteryRepository;
  let concepts: InMemoryConceptsRepository;
  beforeEach(() => { mastery = new InMemoryUserConceptMasteryRepository(); concepts = new InMemoryConceptsRepository(); });

  async function seedTierConcepts(priorityN: number, focusN: number, reinforcedN: number, offset = 0): Promise<void> {
    for (let i = 0; i < priorityN; i++) {
      const id = await seedConcept(concepts, `cap-p-${offset + i}`, `Cap P ${offset + i}`);
      await seedMastery(mastery, USER, id, 2, 0);      // mastery 0 → priority
    }
    for (let i = 0; i < focusN; i++) {
      const id = await seedConcept(concepts, `cap-f-${offset + i}`, `Cap F ${offset + i}`);
      await seedMastery(mastery, USER, id, 20, 13);    // mastery 0.65 → focus
    }
    for (let i = 0; i < reinforcedN; i++) {
      const id = await seedConcept(concepts, `cap-r-${offset + i}`, `Cap R ${offset + i}`);
      await seedMastery(mastery, USER, id, 20, 15);    // mastery 0.75 → reinforced
    }
    const filled = priorityN + focusN + reinforcedN;
    if (filled < MIN) await seedFillers(concepts, mastery, USER, MIN - filled, offset + 100);
  }

  it('uses default caps (8/6/5) when no readinessScore provided', async () => {
    await seedTierConcepts(10, 8, 6, 200);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    expect(rx.priority.length).toBeLessThanOrEqual(8);
    expect(rx.focus.length).toBeLessThanOrEqual(6);
    expect(rx.reinforced.length).toBeLessThanOrEqual(5);
  });

  it('Needs Intensive Review raises priority cap to 10, lowers reinforced to 2', async () => {
    await seedTierConcepts(10, 6, 4, 300);
    const score = { overallReadiness: 25, status: 'Needs Intensive Review' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 10, focus: 0, reinforced: 0, ontrack: 0 } };
    const rx = await makeService(mastery, concepts).getPrescription(USER, score);
    expect(rx.priority.length).toBe(10);      // raised cap
    expect(rx.reinforced.length).toBeLessThanOrEqual(2);  // lowered cap
  });

  it('Approaching Readiness raises focus cap to 8, lowers priority cap to 6', async () => {
    await seedTierConcepts(8, 10, 6, 400);
    const score = { overallReadiness: 75, status: 'Approaching Readiness' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 8, reinforced: 4, ontrack: 0 } };
    const rx = await makeService(mastery, concepts).getPrescription(USER, score);
    expect(rx.priority.length).toBeLessThanOrEqual(6);  // lowered cap
    expect(rx.focus.length).toBeLessThanOrEqual(8);     // raised cap
  });

  it('Exam Ready caps priority at 4 and raises reinforced cap to 8', async () => {
    await seedTierConcepts(6, 8, 8, 500);
    const score = { overallReadiness: 88, status: 'Exam Ready' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 0, reinforced: 6, ontrack: 8 } };
    const rx = await makeService(mastery, concepts).getPrescription(USER, score);
    expect(rx.priority.length).toBeLessThanOrEqual(4);  // strict cap at 4
    expect(rx.reinforced.length).toBeLessThanOrEqual(8);
  });

  it('per-concept multipliers are unchanged regardless of readiness', async () => {
    // 1 priority + 1 focus + 1 reinforced → time must still be 5+3+2 = 10
    await seedTierConcepts(1, 1, 1, 600);
    const score = { overallReadiness: 90, status: 'Exam Ready' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 0, reinforced: 1, ontrack: 1 } };
    const rx = await makeService(mastery, concepts).getPrescription(USER, score);
    expect(rx.estimatedStudyTime).toBe(
      rx.priority.length * 5 + rx.focus.length * 3 + rx.reinforced.length * 2,
    );
  });

  it('pre-fetched rows skip internal findByUserId', async () => {
    await seedTierConcepts(2, 2, 2, 700);
    const preRows = await mastery.findByUserId(USER);
    const { InMemoryUserConceptMasteryRepository: R } = await import('../repositories/memory/UserConceptMasteryRepository.js');
    const emptyRepo = new R();
    const rx = await new StudyPrescriptionService(emptyRepo, concepts).getPrescription(USER, undefined, preRows);
    expect(rx.strategy).toBe('adaptive'); // used preRows, not emptyRepo
  });
});
