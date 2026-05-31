import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveFlashcardService } from './AdaptiveFlashcardService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';

const USER = 'fc-user';
const MIN  = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedConcept(
  concepts: InMemoryConceptsRepository,
  slug: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, {
    name,
    subject: 'Pharmacology',
    system:  'Cardiovascular',
    parent_concept_id: parentId,
  });
  return c.id;
}

async function seedMastery(
  masteryRepo: InMemoryUserConceptMasteryRepository,
  userId: string,
  conceptId: string,
  attempted: number,
  correct: number,
): Promise<void> {
  await masteryRepo.upsertMany([{ userId, conceptId, attempted, correct }]);
}

async function seedFillers(
  concepts:    InMemoryConceptsRepository,
  masteryRepo: InMemoryUserConceptMasteryRepository,
  userId:      string,
  count:       number,
  startIdx     = 0,
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const id  = await seedConcept(concepts, `filler-fc-${idx}`, `Filler FC ${idx}`);
    await seedMastery(masteryRepo, userId, id, 10, 9); // mastery 0.9 — strong
  }
}

function makeService(
  masteryRepo: InMemoryUserConceptMasteryRepository,
  concepts:    InMemoryConceptsRepository,
): AdaptiveFlashcardService {
  return new AdaptiveFlashcardService(masteryRepo, concepts);
}

// ── Random strategy ───────────────────────────────────────────────────────────

describe('AdaptiveFlashcardService — random strategy', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns random when user has no mastery records', async () => {
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.strategy).toBe('random');
    expect(plan.enabled).toBe(false);
    expect(plan.weakConcepts).toHaveLength(0);
    expect(plan.targetConcepts).toHaveLength(0);
    expect(plan.recommendedCardCount).toBe(0);
    expect(plan.promptFocusText).toBe('');
  });

  it(`returns random when user has ${MIN - 1} records`, async () => {
    await seedFillers(concepts, masteryRepo, USER, MIN - 1);
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.strategy).toBe('random');
    expect(plan.enabled).toBe(false);
    expect(plan.reason).toMatch(/Only 19/);
  });
});

// ── Adaptive strategy ─────────────────────────────────────────────────────────

describe('AdaptiveFlashcardService — adaptive strategy', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it(`activates at exactly ${MIN} records`, async () => {
    await seedFillers(concepts, masteryRepo, USER, MIN);
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.strategy).toBe('adaptive');
    expect(plan.enabled).toBe(true);
  });

  it('puts mastery_score < 0.65 concepts into weakConcepts', async () => {
    const c1 = await seedConcept(concepts, 'weak-fc', 'ACE Inhibitor Cough');
    await seedMastery(masteryRepo, USER, c1, 2, 0); // mastery 0.0
    await seedFillers(concepts, masteryRepo, USER, MIN - 1, 100);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.weakConcepts).toContain('ACE Inhibitor Cough');
  });

  it('sorts weakConcepts ASC by mastery_score (weakest first)', async () => {
    const c1 = await seedConcept(concepts, 'very-weak-fc',   'Very Weak');
    const c2 = await seedConcept(concepts, 'mid-weak-fc',    'Mid Weak');
    const c3 = await seedConcept(concepts, 'barely-weak-fc', 'Barely Weak');
    await seedMastery(masteryRepo, USER, c1, 2, 0); // 0.00
    await seedMastery(masteryRepo, USER, c2, 4, 1); // 0.25
    await seedMastery(masteryRepo, USER, c3, 4, 2); // 0.50
    await seedFillers(concepts, masteryRepo, USER, MIN - 3, 200);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    const idx = (name: string) => plan.weakConcepts.indexOf(name);
    expect(idx('Very Weak')).toBeLessThan(idx('Mid Weak'));
    expect(idx('Mid Weak')).toBeLessThan(idx('Barely Weak'));
  });

  it('uses recent_incorrect_count as tiebreaker for equal mastery_score', async () => {
    const cHigh = await seedConcept(concepts, 'high-err-fc', 'High Error FC');
    const cLow  = await seedConcept(concepts, 'low-err-fc',  'Low Error FC');
    await seedMastery(masteryRepo, USER, cHigh, 4, 2); // mastery 0.5, incorrect 2
    await seedMastery(masteryRepo, USER, cLow,  2, 1); // mastery 0.5, incorrect 1
    await seedFillers(concepts, masteryRepo, USER, MIN - 2, 300);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    const idxH = plan.weakConcepts.indexOf('High Error FC');
    const idxL = plan.weakConcepts.indexOf('Low Error FC');
    expect(idxH).toBeGreaterThanOrEqual(0);
    expect(idxL).toBeGreaterThanOrEqual(0);
    expect(idxH).toBeLessThan(idxL);
  });

  it('caps targetConcepts at MAX_TARGET_CONCEPTS (10)', async () => {
    for (let i = 0; i < 15; i++) {
      const id = await seedConcept(concepts, `many-weak-${i}`, `Many Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);
    }
    await seedFillers(concepts, masteryRepo, USER, MIN - 15, 400);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.targetConcepts.length).toBeLessThanOrEqual(10);
    expect(plan.weakConcepts.length).toBe(15); // all 15 weak concepts reported
  });

  it('recommendedCardCount is targetConcepts.length * 2, max 20', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `rec-weak-${i}`, `Rec Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);
    }
    await seedFillers(concepts, masteryRepo, USER, MIN - 5, 500);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.recommendedCardCount).toBe(plan.targetConcepts.length * 2);
    expect(plan.recommendedCardCount).toBeLessThanOrEqual(20);
  });

  it('recommendedCardCount is 0 when no weak concepts exist', async () => {
    // All 20 records are strong (mastery 1.0)
    await seedFillers(concepts, masteryRepo, USER, MIN);
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.strategy).toBe('adaptive');
    expect(plan.weakConcepts).toHaveLength(0);
    expect(plan.recommendedCardCount).toBe(0);
  });

  it('generates non-empty promptFocusText containing concept names', async () => {
    const c1 = await seedConcept(concepts, 'pt-fc-1', 'Nephritic Syndrome FC');
    await seedMastery(masteryRepo, USER, c1, 2, 0);
    await seedFillers(concepts, masteryRepo, USER, MIN - 1, 600);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.promptFocusText.length).toBeGreaterThan(0);
    expect(plan.promptFocusText).toContain('Nephritic Syndrome FC');
    expect(plan.promptFocusText).toContain('60');
  });

  it('excludes parent concepts that have no direct mastery row', async () => {
    const parentId = await seedConcept(concepts, 'parent-fc', 'Parent Concept FC');
    const childId  = await seedConcept(concepts, 'child-fc',  'Child Concept FC', parentId);
    await seedMastery(masteryRepo, USER, childId, 2, 0); // only child has mastery
    await seedFillers(concepts, masteryRepo, USER, MIN - 1, 700);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.weakConcepts).toContain('Child Concept FC');
    expect(plan.weakConcepts).not.toContain('Parent Concept FC');
    expect(plan.targetConcepts).not.toContain('Parent Concept FC');
  });
});

// ── P2: Medium-tier fill when weak bucket is small ────────────────────────────

describe('AdaptiveFlashcardService — medium-tier fill (P2)', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('fills remaining capacity with medium concepts when weak < 10', async () => {
    // 3 weak + 7 medium + 10 strong = 20 total
    for (let i = 0; i < 3; i++) {
      const id = await seedConcept(concepts, `p2-w-${i}`, `P2 Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);         // mastery 0 → weak
    }
    for (let i = 0; i < 7; i++) {
      const id = await seedConcept(concepts, `p2-m-${i}`, `P2 Medium ${i}`);
      await seedMastery(masteryRepo, USER, id, 20, 13);       // mastery 0.65 → medium
    }
    await seedFillers(concepts, masteryRepo, USER, 10, 800);  // strong fillers

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    const weakInTarget   = plan.targetConcepts.filter(n => n.startsWith('P2 Weak'));
    const mediumInTarget = plan.targetConcepts.filter(n => n.startsWith('P2 Medium'));
    expect(weakInTarget).toHaveLength(3);    // all 3 weak included
    expect(mediumInTarget).toHaveLength(7);  // 7 medium fill remaining slots (3+7=10)
    expect(plan.targetConcepts).toHaveLength(10);
  });

  it('does not include medium when weak fills all 10 slots', async () => {
    for (let i = 0; i < 12; i++) {
      const id = await seedConcept(concepts, `p2-full-w-${i}`, `Full Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);         // mastery 0 → weak
    }
    for (let i = 0; i < 8; i++) {
      const id = await seedConcept(concepts, `p2-full-m-${i}`, `Full Medium ${i}`);
      await seedMastery(masteryRepo, USER, id, 20, 13);       // medium
    }

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    const mediumInTarget = plan.targetConcepts.filter(n => n.startsWith('Full Medium'));
    expect(mediumInTarget).toHaveLength(0);  // no room — weak fills all 10 slots
    expect(plan.targetConcepts).toHaveLength(10);
  });

  it('weakConcepts list still reflects ALL weak concepts regardless of fill', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `p2-all-w-${i}`, `All Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);
    }
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `p2-all-m-${i}`, `All Med ${i}`);
      await seedMastery(masteryRepo, USER, id, 20, 13);
    }
    await seedFillers(concepts, masteryRepo, USER, 10, 900);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.weakConcepts).toHaveLength(5);   // all 5 weak reported
    expect(plan.targetConcepts).toHaveLength(10); // 5 weak + 5 medium
  });

  it('medium targets appear in promptFocusText', async () => {
    const wId = await seedConcept(concepts, 'p2-fc-w', 'Renal Tubular Acidosis');
    const mId = await seedConcept(concepts, 'p2-fc-m', 'Nephritic Syndrome');
    await seedMastery(masteryRepo, USER, wId, 2, 0);    // weak
    await seedMastery(masteryRepo, USER, mId, 20, 13);  // medium
    await seedFillers(concepts, masteryRepo, USER, 18, 1000);

    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER);
    expect(plan.promptFocusText).toContain('Renal Tubular Acidosis');
    expect(plan.promptFocusText).toContain('Nephritic Syndrome');
  });
});

// ── P1: Readiness-aware medium fill ──────────────────────────────────────────

describe('AdaptiveFlashcardService — readiness-aware medium fill (P1)', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  async function seedMixed(weakCount: number, mediumCount: number, fillStart = 0): Promise<void> {
    for (let i = 0; i < weakCount; i++) {
      const id = await seedConcept(concepts, `rda-w-${i}`, `RDA Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);
    }
    for (let i = 0; i < mediumCount; i++) {
      const id = await seedConcept(concepts, `rda-m-${i}`, `RDA Med ${i}`);
      await seedMastery(masteryRepo, USER, id, 20, 13);
    }
    const remaining = MIN - weakCount - mediumCount;
    if (remaining > 0) await seedFillers(concepts, masteryRepo, USER, remaining, fillStart);
  }

  it('suppresses medium fill for Needs Intensive Review', async () => {
    await seedMixed(5, 10, 2000);
    const score = { overallReadiness: 30, status: 'Needs Intensive Review' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 5, focus: 0, reinforced: 0, ontrack: 0 } };
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER, score);
    const mediumInTarget = plan.targetConcepts.filter(n => n.startsWith('RDA Med'));
    expect(mediumInTarget).toHaveLength(0);  // no medium — focus on weak only
    expect(plan.targetConcepts).toHaveLength(5); // all 5 weak
  });

  it('allows medium fill for Developing status', async () => {
    await seedMixed(3, 7, 3000);
    const score = { overallReadiness: 60, status: 'Developing' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 3, focus: 7, reinforced: 0, ontrack: 0 } };
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER, score);
    const mediumInTarget = plan.targetConcepts.filter(n => n.startsWith('RDA Med'));
    expect(mediumInTarget.length).toBeGreaterThan(0); // medium fill enabled
  });

  it('allows medium fill for Exam Ready status', async () => {
    await seedMixed(2, 8, 4000);
    const score = { overallReadiness: 90, status: 'Exam Ready' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 0, reinforced: 2, ontrack: 8 } };
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER, score);
    const mediumInTarget = plan.targetConcepts.filter(n => n.startsWith('RDA Med'));
    expect(mediumInTarget.length).toBeGreaterThan(0); // medium fill enabled
    expect(plan.targetConcepts.length).toBeLessThanOrEqual(10);
  });

  it('never reduces weak targets below what weak bucket provides', async () => {
    // 8 weak concepts — Needs Intensive Review should still get all 8
    await seedMixed(8, 5, 5000);
    const score = { overallReadiness: 20, status: 'Needs Intensive Review' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 8, focus: 0, reinforced: 0, ontrack: 0 } };
    const plan = await makeService(masteryRepo, concepts).buildAdaptiveFlashcardPlan(USER, score);
    const weakInTarget = plan.targetConcepts.filter(n => n.startsWith('RDA Weak'));
    expect(weakInTarget).toHaveLength(8); // all 8 weak retained
  });
});
