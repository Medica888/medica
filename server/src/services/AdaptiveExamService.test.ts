import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveExamService } from './AdaptiveExamService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';

const USER = 'adaptive-user';
const MIN = 20; // must match AdaptiveExamService constant

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

/**
 * Seed N filler concepts and mastery rows.
 * Returns an array of the seeded concept IDs.
 */
async function seedFillers(
  concepts: InMemoryConceptsRepository,
  mastery:  InMemoryUserConceptMasteryRepository,
  userId:   string,
  count:    number,
  startIdx  = 0,
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = startIdx + i;
    const id = await seedConcept(concepts, `filler-${idx}`, `Filler Concept ${idx}`);
    // Mastery 0.9 — strong, not selected as weak/medium targets
    await seedMastery(mastery, userId, id, 10, 9);
    ids.push(id);
  }
  return ids;
}

function makeService(
  mastery:  InMemoryUserConceptMasteryRepository,
  concepts: InMemoryConceptsRepository,
): AdaptiveExamService {
  return new AdaptiveExamService(mastery, concepts);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdaptiveExamService — random strategy (insufficient data)', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns random when user has no mastery records', async () => {
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.strategy).toBe('random');
    expect(bp.enabled).toBe(false);
    expect(bp.weakConcepts).toHaveLength(0);
    expect(bp.targetConcepts).toHaveLength(0);
    expect(bp.promptFocusText).toBe('');
  });

  it(`returns random when user has ${MIN - 1} records (below threshold)`, async () => {
    await seedFillers(concepts, masteryRepo, USER, MIN - 1);
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.strategy).toBe('random');
    expect(bp.enabled).toBe(false);
    expect(bp.reason).toMatch(/Only 19/);
  });

  it('includes reason string for insufficient data', async () => {
    await seedFillers(concepts, masteryRepo, USER, 5);
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(typeof bp.reason).toBe('string');
    expect(bp.reason!.length).toBeGreaterThan(0);
  });
});

describe('AdaptiveExamService — adaptive strategy (≥20 records)', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it(`returns adaptive when user has exactly ${MIN} records`, async () => {
    await seedFillers(concepts, masteryRepo, USER, MIN);
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.strategy).toBe('adaptive');
    expect(bp.enabled).toBe(true);
    expect(bp.reason).toBeUndefined();
  });

  it('buckets weak concepts correctly (mastery_score < 0.65)', async () => {
    // 2 weak concepts
    const c1 = await seedConcept(concepts, 'weak-1', 'ACE Inhibitor Adverse Effects');
    const c2 = await seedConcept(concepts, 'weak-2', 'Beta-Blocker Overdose');
    await seedMastery(masteryRepo, USER, c1, 2, 0);  // mastery 0.0 → weak
    await seedMastery(masteryRepo, USER, c2, 2, 1);  // mastery 0.5 → weak
    await seedFillers(concepts, masteryRepo, USER, 18, 100); // 18 strong fillers

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.weakConcepts).toContain('ACE Inhibitor Adverse Effects');
    expect(bp.weakConcepts).toContain('Beta-Blocker Overdose');
    expect(bp.weakConcepts).not.toContain('Filler Concept 100');
  });

  it('buckets medium concepts correctly (0.65 ≤ mastery_score < 0.75)', async () => {
    // 13/20 = 0.65 exactly → focus tier
    const cMed = await seedConcept(concepts, 'medium-1', 'Digoxin Mechanism');
    await seedMastery(masteryRepo, USER, cMed, 20, 13);
    await seedFillers(concepts, masteryRepo, USER, 19, 200);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.mediumConcepts).toContain('Digoxin Mechanism');
  });

  it('buckets strong concepts correctly (mastery_score ≥ 0.75)', async () => {
    const cStr = await seedConcept(concepts, 'strong-1', 'Basic Pharmacokinetics');
    await seedMastery(masteryRepo, USER, cStr, 10, 10); // mastery 1.0
    await seedFillers(concepts, masteryRepo, USER, 19, 300);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.strongConcepts).toContain('Basic Pharmacokinetics');
    expect(bp.weakConcepts).not.toContain('Basic Pharmacokinetics');
    expect(bp.mediumConcepts).not.toContain('Basic Pharmacokinetics');
  });

  it('sorts weak concepts by mastery_score ASC (lowest first)', async () => {
    const cLow  = await seedConcept(concepts, 'very-weak',   'Very Weak Concept');
    const cMid  = await seedConcept(concepts, 'mid-weak',    'Mid Weak Concept');
    const cHigh = await seedConcept(concepts, 'barely-weak', 'Barely Weak Concept');
    await seedMastery(masteryRepo, USER, cLow,  2, 0); // 0.00 — weakest
    await seedMastery(masteryRepo, USER, cMid,  4, 1); // 0.25
    await seedMastery(masteryRepo, USER, cHigh, 4, 2); // 0.50
    await seedFillers(concepts, masteryRepo, USER, 17, 400);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    const idx = (name: string) => bp.weakConcepts.indexOf(name);
    expect(idx('Very Weak Concept')).toBeLessThan(idx('Mid Weak Concept'));
    expect(idx('Mid Weak Concept')).toBeLessThan(idx('Barely Weak Concept'));
  });

  it('uses recent_incorrect_count as tiebreaker when mastery_score is equal', async () => {
    // Both mastery 0.5, but different incorrect counts
    const cHighErr = await seedConcept(concepts, 'high-errors',  'High Error Concept');
    const cLowErr  = await seedConcept(concepts, 'low-errors',   'Low Error Concept');
    await seedMastery(masteryRepo, USER, cHighErr, 4, 2); // mastery 0.5, incorrect 2
    await seedMastery(masteryRepo, USER, cLowErr,  2, 1); // mastery 0.5, incorrect 1
    await seedFillers(concepts, masteryRepo, USER, 18, 500);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    const idxHigh = bp.weakConcepts.indexOf('High Error Concept');
    const idxLow  = bp.weakConcepts.indexOf('Low Error Concept');
    expect(idxHigh).toBeGreaterThanOrEqual(0);
    expect(idxLow).toBeGreaterThanOrEqual(0);
    // Higher incorrect count → ranked before lower
    expect(idxHigh).toBeLessThan(idxLow);
  });

  it('allocates targetConcepts as 50% weak + 30% medium of questionCount', async () => {
    // 5 weak, 5 medium, 10 strong
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `w-${i}`, `Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0); // mastery 0
    }
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `m-${i}`, `Medium ${i}`);
      await seedMastery(masteryRepo, USER, id, 20, 13); // mastery 0.65
    }
    await seedFillers(concepts, masteryRepo, USER, 10, 600);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    // 10 * 0.5 = 5 weak slots, 10 * 0.3 = 3 medium slots
    const weakInTarget   = bp.targetConcepts.filter(n => n.startsWith('Weak'));
    const mediumInTarget = bp.targetConcepts.filter(n => n.startsWith('Medium'));
    expect(weakInTarget).toHaveLength(5);   // floor(10 * 0.50)
    expect(mediumInTarget).toHaveLength(3); // floor(10 * 0.30)
    expect(bp.targetConcepts).toHaveLength(8);
  });

  it('generates non-empty promptFocusText when adaptive', async () => {
    const c1 = await seedConcept(concepts, 'pt-1', 'Prompt Concept A');
    await seedMastery(masteryRepo, USER, c1, 2, 0);
    await seedFillers(concepts, masteryRepo, USER, 19, 700);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    expect(bp.promptFocusText.length).toBeGreaterThan(0);
    expect(bp.promptFocusText).toContain('Prompt Concept A');
    expect(bp.promptFocusText).toContain('50');
  });

  it('does not include parent concepts that have no direct mastery row', async () => {
    // Parent concept with NO mastery row
    const parentId = await seedConcept(concepts, 'pharmacology', 'Pharmacology');
    // Child concept with mastery row (child is the weak one)
    const childId  = await seedConcept(concepts, 'ace-inh', 'ACE Inhibitors', parentId);
    await seedMastery(masteryRepo, USER, childId, 2, 0); // only child has mastery
    await seedFillers(concepts, masteryRepo, USER, 19, 800);

    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);

    expect(bp.weakConcepts).toContain('ACE Inhibitors');
    expect(bp.weakConcepts).not.toContain('Pharmacology');
    expect(bp.mediumConcepts).not.toContain('Pharmacology');
    expect(bp.strongConcepts).not.toContain('Pharmacology');
    expect(bp.targetConcepts).not.toContain('Pharmacology');
  });

  it('buildAdaptivePreview uses 10-question allocation', async () => {
    const c1 = await seedConcept(concepts, 'pv-1', 'Preview Weak');
    await seedMastery(masteryRepo, USER, c1, 2, 0);
    await seedFillers(concepts, masteryRepo, USER, 19, 900);

    const bp = await makeService(masteryRepo, concepts).buildAdaptivePreview(USER);
    // 10 * 0.5 = 5 weak slots max
    expect(bp.targetConcepts.length).toBeLessThanOrEqual(8); // 5 weak + 3 medium max
    expect(bp.strategy).toBe('adaptive');
  });
});

// ── Readiness-aware allocation (P1) ───────────────────────────────────────────

describe('AdaptiveExamService — readiness-aware allocation', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  async function seedMixed(weakCount: number, mediumCount: number, strongCount: number): Promise<void> {
    for (let i = 0; i < weakCount; i++) {
      const id = await seedConcept(concepts, `rdw-${i}`, `RD Weak ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0); // mastery 0 → weak
    }
    for (let i = 0; i < mediumCount; i++) {
      const id = await seedConcept(concepts, `rdm-${i}`, `RD Medium ${i}`);
      await seedMastery(masteryRepo, USER, id, 20, 13); // mastery 0.65 → medium
    }
    for (let i = 0; i < strongCount; i++) {
      const id = await seedConcept(concepts, `rds-${i}`, `RD Strong ${i}`);
      await seedMastery(masteryRepo, USER, id, 10, 9); // mastery 0.9 → strong
    }
  }

  it('uses 60/25 split for Needs Intensive Review', async () => {
    await seedMixed(10, 10, 0);
    const score = { overallReadiness: 30, status: 'Needs Intensive Review' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 10, focus: 0, reinforced: 0, ontrack: 0 } };
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10, score);
    const weakInTarget   = bp.targetConcepts.filter(n => n.startsWith('RD Weak'));
    const mediumInTarget = bp.targetConcepts.filter(n => n.startsWith('RD Medium'));
    expect(weakInTarget).toHaveLength(6);   // floor(10 * 0.60)
    expect(mediumInTarget).toHaveLength(2); // floor(10 * 0.25)
  });

  it('uses 50/30 split for Developing (unchanged default)', async () => {
    await seedMixed(10, 10, 0);
    const score = { overallReadiness: 55, status: 'Developing' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 10, reinforced: 0, ontrack: 0 } };
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10, score);
    const weakInTarget   = bp.targetConcepts.filter(n => n.startsWith('RD Weak'));
    const mediumInTarget = bp.targetConcepts.filter(n => n.startsWith('RD Medium'));
    expect(weakInTarget).toHaveLength(5);   // floor(10 * 0.50)
    expect(mediumInTarget).toHaveLength(3); // floor(10 * 0.30)
  });

  it('uses 40/35 split for Approaching Readiness', async () => {
    await seedMixed(10, 10, 0);
    const score = { overallReadiness: 75, status: 'Approaching Readiness' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 5, reinforced: 5, ontrack: 0 } };
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10, score);
    const weakInTarget   = bp.targetConcepts.filter(n => n.startsWith('RD Weak'));
    const mediumInTarget = bp.targetConcepts.filter(n => n.startsWith('RD Medium'));
    expect(weakInTarget).toHaveLength(4);   // floor(10 * 0.40)
    expect(mediumInTarget).toHaveLength(3); // floor(10 * 0.35)
  });

  it('uses 30/40 split for Exam Ready', async () => {
    await seedMixed(10, 10, 0);
    const score = { overallReadiness: 90, status: 'Exam Ready' as const, components: { mastery: 0, confidence: 0, trend: 0, consistency: 0 }, distribution: { priority: 0, focus: 0, reinforced: 5, ontrack: 5 } };
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10, score);
    const weakInTarget   = bp.targetConcepts.filter(n => n.startsWith('RD Weak'));
    const mediumInTarget = bp.targetConcepts.filter(n => n.startsWith('RD Medium'));
    expect(weakInTarget).toHaveLength(3);   // floor(10 * 0.30)
    expect(mediumInTarget).toHaveLength(4); // floor(10 * 0.40)
  });

  it('falls back to Developing fractions when no readinessScore provided', async () => {
    await seedMixed(10, 10, 0);
    const bp = await makeService(masteryRepo, concepts).buildAdaptiveBlueprint(USER, 10);
    const weakInTarget   = bp.targetConcepts.filter(n => n.startsWith('RD Weak'));
    const mediumInTarget = bp.targetConcepts.filter(n => n.startsWith('RD Medium'));
    expect(weakInTarget).toHaveLength(5);
    expect(mediumInTarget).toHaveLength(3);
  });

  it('pre-fetched rows skip the internal findByUserId call', async () => {
    await seedMixed(5, 5, 10);
    // Fetch rows externally and pass them — service must use them, not re-fetch
    const { InMemoryUserConceptMasteryRepository: R } = await import('../repositories/memory/UserConceptMasteryRepository.js');
    const emptyRepo = new R(); // no rows — would return random if queried
    const preRows = await masteryRepo.findByUserId(USER);
    const bp = await new (await import('./AdaptiveExamService.js')).AdaptiveExamService(emptyRepo, concepts)
      .buildAdaptiveBlueprint(USER, 10, undefined, preRows);
    expect(bp.strategy).toBe('adaptive'); // used preRows, not emptyRepo
  });
});
