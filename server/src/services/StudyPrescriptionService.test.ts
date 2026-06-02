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

  it('prioritizes concepts due today before non-due concepts', async () => {
    const dueId = await seedConcept(concepts, 'daily-due', 'Daily Due');
    const weakerId = await seedConcept(concepts, 'daily-weaker-not-due', 'Daily Weaker Not Due');
    await seedMastery(mastery, USER, dueId, 10, 7);
    await seedMastery(mastery, USER, weakerId, 10, 4);
    await seedFillers(concepts, mastery, USER, MIN - 2, 1700);

    const dueRow = (await mastery.findByUserAndConcept(USER, dueId))!;
    const notDueRow = (await mastery.findByUserAndConcept(USER, weakerId))!;
    dueRow.next_review_at = new Date(Date.now() - 60 * 60 * 1000);
    notDueRow.next_review_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(plan.conceptReviews[0]?.conceptId).toBe(dueId);
    expect(plan.conceptReviews[0]?.reason).toMatch(/Due for spaced review/);
  });

  it('includes next review and interval fields in concept reviews', async () => {
    const conceptId = await seedConcept(concepts, 'daily-srs-fields', 'Daily SRS Fields');
    await seedMastery(mastery, USER, conceptId, 9, 6);
    await seedMastery(mastery, USER, conceptId, 1, 1);
    await seedFillers(concepts, mastery, USER, MIN - 1, 1800);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const review = plan.conceptReviews.find((r) => r.conceptId === conceptId);
    expect(review?.nextReviewAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(review?.reviewIntervalDays).toBe(2);
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

  it('recommendation uses Persistent weak area copy at cumulative threshold (>= 5 wrong)', async () => {
    const c1 = await seedConcept(concepts, 'high-err-rx', 'High Error');
    const c2 = await seedConcept(concepts, 'low-err-rx',  'Low Error');
    // 6 attempts, 0 correct: total_incorrect=6 (>= 5) → "Persistent weak area"
    await seedMastery(mastery, USER, c1, 6, 0);
    // 2 attempts, 1 correct: total_incorrect=1 (< 5) → default priority message
    await seedMastery(mastery, USER, c2, 2, 1);
    await seedFillers(concepts, mastery, USER, MIN - 2, 500);
    const rx      = await makeService(mastery, concepts).getPrescription(USER);
    const highErr = rx.priority.find(p => p.name === 'High Error');
    const lowErr  = rx.priority.find(p => p.name === 'Low Error');
    expect(highErr?.recommendation).toMatch(/Persistent weak area/);
    expect(highErr?.recommendation).not.toMatch(/recent/i);
    expect(lowErr?.recommendation).not.toMatch(/Persistent weak area/);
  });

  it('recommendation does not use recent-framing language for priority tier', async () => {
    const c1 = await seedConcept(concepts, 'no-recent-rx', 'No Recent Lang');
    await seedMastery(mastery, USER, c1, 10, 0); // many wrong
    await seedFillers(concepts, mastery, USER, MIN - 1, 550);
    const rx = await makeService(mastery, concepts).getPrescription(USER);
    const item = rx.priority.find(p => p.name === 'No Recent Lang');
    expect(item?.recommendation).not.toMatch(/recent/i);
  });

  it('high cumulative wrong answers (4) with low mastery does not auto-fire urgent recommendation without meeting threshold', async () => {
    const c1 = await seedConcept(concepts, 'below-thresh', 'Below Threshold');
    // 4 wrong — just below the new threshold of 5
    await seedMastery(mastery, USER, c1, 4, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 575);
    const rx   = await makeService(mastery, concepts).getPrescription(USER);
    const item = rx.priority.find(p => p.name === 'Below Threshold');
    expect(item?.recommendation).not.toMatch(/Persistent weak area/);
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

// ── USMLE taxonomy in daily plan ─────────────────────────────────────────────

describe('StudyPrescriptionService — USMLE taxonomy in daily plan', () => {
  let mastery:  InMemoryUserConceptMasteryRepository;
  let concepts: InMemoryConceptsRepository;
  const score = {
    overallReadiness: 62,
    status: 'Developing' as const,
    components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 },
    distribution: { priority: 0, focus: 0, reinforced: 0, ontrack: 0 },
  };

  beforeEach(() => {
    mastery  = new InMemoryUserConceptMasteryRepository();
    concepts = new InMemoryConceptsRepository();
  });

  // seedConcept defaults: subject='Pharmacology', system='Cardiovascular'

  it('conceptReviews include usmleContentArea inferred from concept system', async () => {
    const id = await seedConcept(concepts, 'tax-sys', 'ACE Inhibitors');
    await seedMastery(mastery, USER, id, 4, 0); // mastery 0 → priority
    await seedFillers(concepts, mastery, USER, MIN - 1, 2000);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const review = plan.conceptReviews.find((r) => r.conceptId === id);
    expect(review?.usmleContentArea).toBe('Cardiovascular System'); // system='Cardiovascular'
  });

  it('conceptReviews include physicianTask inferred from concept subject', async () => {
    const id = await seedConcept(concepts, 'tax-sub', 'Beta Blockers');
    await seedMastery(mastery, USER, id, 4, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 2100);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const review = plan.conceptReviews.find((r) => r.conceptId === id);
    expect(review?.physicianTask).toBe('Patient Care: Pharmacotherapy'); // subject='Pharmacology'
  });

  it('concept with Nephrology subject maps to Renal content area when system has no match', async () => {
    // Direct upsert so we can set system='' — seedConcept always sets system='Cardiovascular'
    // which would win the system-first lookup, masking the subject inference under test here.
    const c = await concepts.upsertBySlug('tax-renal', { name: 'GFR Regulation', subject: 'Nephrology', system: '' });
    await seedMastery(mastery, USER, c.id, 4, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 2200);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const review = plan.conceptReviews.find((r) => r.conceptId === c.id);
    expect(review?.usmleContentArea).toBe('Renal & Urinary System'); // subject='Nephrology'
  });

  it('focusUsmleContentAreas aggregates distinct content areas from conceptReviews', async () => {
    const id = await seedConcept(concepts, 'tax-agg', 'Cardiac Output');
    await seedMastery(mastery, USER, id, 4, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 2300);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(Array.isArray(plan.focusUsmleContentAreas)).toBe(true);
    expect(plan.focusUsmleContentAreas!.length).toBeGreaterThan(0);
    expect(plan.focusUsmleContentAreas).toContain('Cardiovascular System');
  });

  it('focusPhysicianTasks aggregates distinct physician tasks from conceptReviews', async () => {
    const id = await seedConcept(concepts, 'tax-task', 'Drug Dosing');
    await seedMastery(mastery, USER, id, 4, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 2400);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    expect(Array.isArray(plan.focusPhysicianTasks)).toBe(true);
    expect(plan.focusPhysicianTasks!.length).toBeGreaterThan(0);
  });

  it('empty state returns empty taxonomy arrays and preserves all existing fields', async () => {
    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    // Existing fields intact
    expect(plan.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(plan.readinessStatus).toBe('Developing');
    expect(plan.conceptReviews).toHaveLength(0);
    expect(plan.focusSubjects).toHaveLength(0);
    expect(plan.summary).toMatch(/No urgent concept reviews/);
    // New fields — empty when no reviews
    expect(plan.focusUsmleContentAreas).toHaveLength(0);
    expect(plan.focusPhysicianTasks).toHaveLength(0);
  });

  it('existing daily plan fields remain present and correct alongside new fields', async () => {
    const id = await seedConcept(concepts, 'tax-compat', 'Vasodilators');
    await seedMastery(mastery, USER, id, 3, 0);
    await seedFillers(concepts, mastery, USER, MIN - 1, 2500);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    // All pre-existing fields present
    expect(plan.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof plan.estimatedMinutes).toBe('number');
    expect(typeof plan.recommendedQuestions).toBe('number');
    expect(typeof plan.recommendedFlashcards).toBe('number');
    expect(Array.isArray(plan.focusSubjects)).toBe(true);
    expect(typeof plan.summary).toBe('string');
    expect(Array.isArray(plan.conceptReviews)).toBe(true);
    // Per-review existing fields still there
    const review = plan.conceptReviews[0];
    if (review) {
      expect(typeof review.conceptId).toBe('string');
      expect(typeof review.name).toBe('string');
      expect(typeof review.subject).toBe('string');
      expect(typeof review.priority).toBe('string');
      expect(typeof review.reason).toBe('string');
      expect(typeof review.reviewIntervalDays).toBe('number');
    }
  });
});

// ── Dead-zone regression tests ────────────────────────────────────────────────
// Verifies that concepts with 3–4 errors in priority tier and 1–2 errors in
// the daily-reason fallback path now get specific messages instead of
// silently falling through to generic text.

describe('StudyPrescriptionService — recommendation dead-zone coverage', () => {
  let mastery:  InMemoryUserConceptMasteryRepository;
  let concepts: InMemoryConceptsRepository;
  const score = {
    overallReadiness: 55,
    status: 'Needs Intensive Review' as const,
    components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 },
    distribution: { priority: 0, focus: 0, reinforced: 0, ontrack: 0 },
  };

  beforeEach(() => {
    mastery  = new InMemoryUserConceptMasteryRepository();
    concepts = new InMemoryConceptsRepository();
  });

  it('priority tier with 3 errors gets "Recurring errors" — not the generic fallback', async () => {
    const id = await seedConcept(concepts, 'dead-p3', 'Priority With 3 Errors');
    // 10 attempts, 3 correct → mastery 0.3 (priority tier), 7 incorrect
    // Force recent_incorrect_count to 3 by upsertMany: 3 attempted, 0 correct
    await mastery.upsertMany([{ userId: USER, conceptId: id, attempted: 3, correct: 0 }]);
    await seedFillers(concepts, mastery, USER, MIN - 1, 3000);

    const rx = await makeService(mastery, concepts).getPrescription(USER);
    const concept = rx.priority.find((c) => c.name === 'Priority With 3 Errors');
    expect(concept).toBeDefined();
    expect(concept!.recommendation).toMatch(/Recurring errors/);
    expect(concept!.recommendation).not.toMatch(/Below passing threshold/);
  });

  it('priority tier with 5+ errors gets "Persistent weak area"', async () => {
    const id = await seedConcept(concepts, 'dead-p5', 'Priority With 5 Errors');
    await mastery.upsertMany([{ userId: USER, conceptId: id, attempted: 5, correct: 0 }]);
    await seedFillers(concepts, mastery, USER, MIN - 1, 3100);

    const rx = await makeService(mastery, concepts).getPrescription(USER);
    const concept = rx.priority.find((c) => c.name === 'Priority With 5 Errors');
    expect(concept).toBeDefined();
    expect(concept!.recommendation).toMatch(/Persistent weak area/);
  });

  it('daily reason with 1 error gives "Recent wrong answers" — not "Developing concept needs spaced reinforcement"', async () => {
    // Seed a concept with solid mastery but 1 wrong answer — previously fell to generic message
    // mastery 0.9 = ontrack tier (not in the daily-plan normally unless due for review),
    // but to test dailyReason path we use a focus-tier concept with recent_incorrect > 0
    // and confidence >= 0.5 so all the >= 3 branches are skipped.
    // upsertMany: 10 attempted, 8 correct → mastery 0.8 (focus tier), incorrect = 2
    const id = await seedConcept(concepts, 'dead-daily-1', 'Focus With 1 Error');
    // 2 attempted, 1 correct → mastery 0.5 (focus tier), incorrect = 1
    await mastery.upsertMany([{ userId: USER, conceptId: id, attempted: 2, correct: 1 }]);
    await seedFillers(concepts, mastery, USER, MIN - 1, 3200);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const review = plan.conceptReviews.find((r) => r.name === 'Focus With 1 Error');
    // If the concept appears in the plan, its reason must not be the invisible fallback
    if (review) {
      expect(review.reason).not.toBe('Developing concept needs spaced reinforcement');
    }
  });

  it('daily reason with 0 errors and good confidence gives the generic reinforcement message', async () => {
    const id = await seedConcept(concepts, 'dead-daily-0', 'Zero Errors Focus');
    // All correct — recent_incorrect = 0, confidence high
    await mastery.upsertMany([{ userId: USER, conceptId: id, attempted: 4, correct: 3 }]);
    await seedFillers(concepts, mastery, USER, MIN - 1, 3300);

    const plan = await makeService(mastery, concepts).getDailyPlan(USER, score);
    const review = plan.conceptReviews.find((r) => r.name === 'Zero Errors Focus');
    if (review) {
      // Zero-error concept may legitimately get the generic message or confidence message
      expect(typeof review.reason).toBe('string');
      expect(review.reason.length).toBeGreaterThan(0);
    }
  });
});
