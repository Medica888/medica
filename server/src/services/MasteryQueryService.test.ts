import { describe, it, expect, beforeEach } from 'vitest';
import { MasteryQueryService, masteryTier } from './MasteryQueryService.js';
import { ConceptHierarchyService } from './ConceptHierarchyService.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';

const USER = 'user-001';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function seedConcept(
  concepts: InMemoryConceptsRepository,
  slug: string,
  name: string,
  parentId?: string,
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, {
    name,
    subject: 'Cardiology',
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

function makeService(
  masteryRepo: InMemoryUserConceptMasteryRepository,
  concepts:    InMemoryConceptsRepository,
): MasteryQueryService {
  return new MasteryQueryService(masteryRepo, concepts, new ConceptHierarchyService(concepts));
}

// ── masteryTier — exact boundary ──────────────────────────────────────────────

describe('masteryTier', () => {
  it('returns priority for score < 0.65', () => {
    expect(masteryTier(0.00)).toBe('priority');
    expect(masteryTier(0.64)).toBe('priority');
  });

  it('returns focus at exactly 0.65 and up to < 0.75', () => {
    expect(masteryTier(0.65)).toBe('focus');
    expect(masteryTier(0.74)).toBe('focus');
  });

  it('returns reinforced at exactly 0.75 and up to < 0.85', () => {
    expect(masteryTier(0.75)).toBe('reinforced');
    expect(masteryTier(0.84)).toBe('reinforced');
  });

  it('returns ontrack at exactly 0.85 and above', () => {
    expect(masteryTier(0.85)).toBe('ontrack');
    expect(masteryTier(1.00)).toBe('ontrack');
  });
});

// ── getOverview ───────────────────────────────────────────────────────────────

describe('MasteryQueryService.getOverview', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns zero-state when user has no mastery rows', async () => {
    const svc = makeService(masteryRepo, concepts);
    const ov  = await svc.getOverview(USER);
    expect(ov.total_concepts).toBe(0);
    expect(ov.avg_mastery_score).toBe(0);
    expect(ov.avg_confidence).toBe(0);
    expect(ov.confident_concepts).toBe(0);
    expect(ov.distribution).toEqual({ priority: 0, focus: 0, reinforced: 0, ontrack: 0 });
  });

  it('counts tier distribution correctly', async () => {
    // priority  (mastery 0/4  = 0.00)
    const c1 = await seedConcept(concepts, 'c1', 'C1');
    await seedMastery(masteryRepo, USER, c1, 4, 0);

    // focus     (mastery 13/20 = 0.65 — exactly at boundary)
    const c2 = await seedConcept(concepts, 'c2', 'C2');
    await seedMastery(masteryRepo, USER, c2, 20, 13);

    // reinforced (mastery 15/20 = 0.75 — exactly at boundary)
    const c3 = await seedConcept(concepts, 'c3', 'C3');
    await seedMastery(masteryRepo, USER, c3, 20, 15);

    // ontrack   (mastery 17/20 = 0.85 — exactly at boundary)
    const c4 = await seedConcept(concepts, 'c4', 'C4');
    await seedMastery(masteryRepo, USER, c4, 20, 17);

    const ov = await makeService(masteryRepo, concepts).getOverview(USER);
    expect(ov.total_concepts).toBe(4);
    expect(ov.distribution).toEqual({ priority: 1, focus: 1, reinforced: 1, ontrack: 1 });
  });

  it('counts confident_concepts (attempts >= 5)', async () => {
    const c1 = await seedConcept(concepts, 'd1', 'D1');
    const c2 = await seedConcept(concepts, 'd2', 'D2');
    const c3 = await seedConcept(concepts, 'd3', 'D3');
    await seedMastery(masteryRepo, USER, c1, 4, 4); // not confident
    await seedMastery(masteryRepo, USER, c2, 5, 5); // exactly 5 → confident
    await seedMastery(masteryRepo, USER, c3, 8, 8); // confident

    const ov = await makeService(masteryRepo, concepts).getOverview(USER);
    expect(ov.confident_concepts).toBe(2);
  });

  it('computes avg_mastery_score correctly', async () => {
    const c1 = await seedConcept(concepts, 'e1', 'E1');
    const c2 = await seedConcept(concepts, 'e2', 'E2');
    await seedMastery(masteryRepo, USER, c1, 1, 1); // mastery 1.0
    await seedMastery(masteryRepo, USER, c2, 1, 0); // mastery 0.0

    const ov = await makeService(masteryRepo, concepts).getOverview(USER);
    expect(ov.avg_mastery_score).toBe(0.5);
  });
});

// ── getWeakest ────────────────────────────────────────────────────────────────

describe('MasteryQueryService.getWeakest', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns concepts sorted ASC by mastery_score', async () => {
    const c1 = await seedConcept(concepts, 'w1', 'Weak');
    const c2 = await seedConcept(concepts, 'w2', 'Medium');
    const c3 = await seedConcept(concepts, 'w3', 'Strong');
    await seedMastery(masteryRepo, USER, c1, 2, 0);   // 0.0
    await seedMastery(masteryRepo, USER, c2, 2, 1);   // 0.5
    await seedMastery(masteryRepo, USER, c3, 2, 2);   // 1.0

    const svc    = makeService(masteryRepo, concepts);
    const result = await svc.getWeakest(USER, 10, 1);
    expect(result).toHaveLength(3);
    expect(result[0]!.mastery.mastery_score).toBeLessThanOrEqual(result[1]!.mastery.mastery_score);
    expect(result[1]!.mastery.mastery_score).toBeLessThanOrEqual(result[2]!.mastery.mastery_score);
  });

  it('filters out concepts below min_attempts', async () => {
    const c1 = await seedConcept(concepts, 'f1', 'Filtered');
    const c2 = await seedConcept(concepts, 'f2', 'Kept');
    await seedMastery(masteryRepo, USER, c1, 1, 0); // below min
    await seedMastery(masteryRepo, USER, c2, 2, 0); // at min

    const result = await makeService(masteryRepo, concepts).getWeakest(USER, 10, 2);
    expect(result).toHaveLength(1);
    expect(result[0]!.concept.id).toBe(c2);
  });

  it('respects the limit', async () => {
    for (let i = 0; i < 5; i++) {
      const id = await seedConcept(concepts, `lim-${i}`, `Lim ${i}`);
      await seedMastery(masteryRepo, USER, id, 2, 0);
    }
    const result = await makeService(masteryRepo, concepts).getWeakest(USER, 3, 1);
    expect(result).toHaveLength(3);
  });

  it('returns empty array when no concepts meet min_attempts', async () => {
    const c1 = await seedConcept(concepts, 'no1', 'No');
    await seedMastery(masteryRepo, USER, c1, 1, 0);
    const result = await makeService(masteryRepo, concepts).getWeakest(USER, 10, 5);
    expect(result).toHaveLength(0);
  });

  it('attaches correct tier to each result', async () => {
    const c1 = await seedConcept(concepts, 'tier1', 'Tier1');
    await seedMastery(masteryRepo, USER, c1, 2, 0); // mastery 0 → priority
    const result = await makeService(masteryRepo, concepts).getWeakest(USER, 10, 1);
    expect(result[0]!.tier).toBe('priority');
  });
});

// ── getStrongest ──────────────────────────────────────────────────────────────

describe('MasteryQueryService.getStrongest', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns concepts sorted DESC by mastery_score', async () => {
    const c1 = await seedConcept(concepts, 's1', 'Low');
    const c2 = await seedConcept(concepts, 's2', 'Mid');
    const c3 = await seedConcept(concepts, 's3', 'High');
    await seedMastery(masteryRepo, USER, c1, 2, 0);
    await seedMastery(masteryRepo, USER, c2, 2, 1);
    await seedMastery(masteryRepo, USER, c3, 2, 2);

    const result = await makeService(masteryRepo, concepts).getStrongest(USER, 10, 1);
    expect(result).toHaveLength(3);
    expect(result[0]!.mastery.mastery_score).toBeGreaterThanOrEqual(result[1]!.mastery.mastery_score);
    expect(result[1]!.mastery.mastery_score).toBeGreaterThanOrEqual(result[2]!.mastery.mastery_score);
  });

  it('filters by min_attempts and respects limit', async () => {
    const c1 = await seedConcept(concepts, 'sg1', 'SG1');
    const c2 = await seedConcept(concepts, 'sg2', 'SG2');
    const c3 = await seedConcept(concepts, 'sg3', 'SG3');
    await seedMastery(masteryRepo, USER, c1, 1, 1); // filtered (below min)
    await seedMastery(masteryRepo, USER, c2, 2, 2);
    await seedMastery(masteryRepo, USER, c3, 3, 3);

    const result = await makeService(masteryRepo, concepts).getStrongest(USER, 1, 2);
    expect(result).toHaveLength(1);
  });
});

// ── getConceptDetail ──────────────────────────────────────────────────────────

describe('MasteryQueryService.getConceptDetail', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns null when concept does not exist', async () => {
    const svc    = makeService(masteryRepo, concepts);
    const result = await svc.getConceptDetail(USER, '00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });

  it('returns mastery=null and tier=null when user has not seen the concept', async () => {
    const id  = await seedConcept(concepts, 'unseen', 'Unseen Concept');
    const svc = makeService(masteryRepo, concepts);
    const r   = await svc.getConceptDetail(USER, id);
    expect(r).not.toBeNull();
    expect(r!.mastery).toBeNull();
    expect(r!.tier).toBeNull();
    expect(r!.concept.slug).toBe('unseen');
  });

  it('returns mastery row and correct tier when user has attempted the concept', async () => {
    const id = await seedConcept(concepts, 'known', 'Known Concept');
    await seedMastery(masteryRepo, USER, id, 2, 2); // mastery 1.0 → ontrack

    const r = await makeService(masteryRepo, concepts).getConceptDetail(USER, id);
    expect(r!.mastery).not.toBeNull();
    expect(r!.mastery!.mastery_score).toBe(1);
    expect(r!.tier).toBe('ontrack');
  });

  it('includes the concept itself in ancestor_path when it has no parents', async () => {
    const id = await seedConcept(concepts, 'root-concept', 'Root Concept');
    const r  = await makeService(masteryRepo, concepts).getConceptDetail(USER, id);
    expect(r!.ancestor_path).toEqual(['root-concept']);
  });

  it('returns root-first ancestor_path for a child concept', async () => {
    const rootId   = await seedConcept(concepts, 'pharmacology', 'Pharmacology');
    const midId    = await seedConcept(concepts, 'cardiac-drugs', 'Cardiac Drugs', rootId);
    const leafId   = await seedConcept(concepts, 'beta-blockers', 'Beta Blockers', midId);

    const r = await makeService(masteryRepo, concepts).getConceptDetail(USER, leafId);
    expect(r!.ancestor_path).toEqual(['pharmacology', 'cardiac-drugs', 'beta-blockers']);
  });
});
