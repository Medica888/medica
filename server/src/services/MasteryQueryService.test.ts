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
  subject = 'Cardiology',
): Promise<string> {
  const c = await concepts.upsertBySlug(slug, {
    name,
    subject,
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

// ── getSubjectBreakdown ───────────────────────────────────────────────────────

describe('MasteryQueryService.getSubjectBreakdown', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns empty array when user has no mastery data', async () => {
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    expect(result).toHaveLength(0);
  });

  it('groups mastery rows by concept.subject', async () => {
    const c1 = await seedConcept(concepts, 'cardio-1', 'Heart Failure',     undefined, 'Cardiology');
    const c2 = await seedConcept(concepts, 'pharm-1',  'Beta Blockers',     undefined, 'Pharmacology');
    const c3 = await seedConcept(concepts, 'cardio-2', 'Atrial Fibrillation', undefined, 'Cardiology');
    await seedMastery(masteryRepo, USER, c1, 4, 2);
    await seedMastery(masteryRepo, USER, c2, 4, 3);
    await seedMastery(masteryRepo, USER, c3, 4, 4);

    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    const subjects = result.map(r => r.subject).sort();
    expect(subjects).toEqual(['Cardiology', 'Pharmacology']);
  });

  it('computes attempt-weighted rollup mastery (not plain average)', async () => {
    // mastery 0.9 × 20 attempts + mastery 0.4 × 2 attempts
    // plain avg  = (0.9 + 0.4) / 2 = 0.65
    // weighted   = (0.9×20 + 0.4×2) / (20+2) = (18+0.8)/22 ≈ 0.8545
    const c1 = await seedConcept(concepts, 'wt-high', 'High Mastery', undefined, 'Pharmacology');
    const c2 = await seedConcept(concepts, 'wt-low',  'Low Mastery',  undefined, 'Pharmacology');
    await seedMastery(masteryRepo, USER, c1, 20, 18); // mastery ≈ 0.9
    await seedMastery(masteryRepo, USER, c2,  2,  0); // mastery ≈ 0 (but seedMastery gives 0/2 = 0... hmm let me verify)

    // Actually: seedMastery(r, userId, conceptId, attempted, correct)
    // mastery = correct/attempted
    // c1: 18/20 = 0.9 ✓, c2: 0/2 = 0
    // weighted = (0.9×20 + 0×2) / 22 = 18/22 ≈ 0.8182
    // plain avg = (0.9 + 0) / 2 = 0.45
    // These are clearly different — test pins the weighted formula
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    const pharm = result.find(r => r.subject === 'Pharmacology');
    expect(pharm).toBeDefined();
    // Weighted: (0.9×20 + 0×2)/22 ≈ 0.8182 — not plain avg 0.45
    expect(pharm!.rollupMastery).toBeGreaterThan(0.80);
    expect(pharm!.rollupMastery).toBeLessThan(0.85);
  });

  it('computes attempt-weighted rollup confidence (not plain average)', async () => {
    // confidence = min(attempts/5, 1.0)
    // c1: attempts=10 → confidence=1.0; c2: attempts=2 → confidence=0.4
    // plain avg = (1.0+0.4)/2 = 0.7; weighted = (1.0×10 + 0.4×2)/12 = 10.8/12 = 0.9
    const c1 = await seedConcept(concepts, 'cf-high', 'High Conf', undefined, 'Neurology');
    const c2 = await seedConcept(concepts, 'cf-low',  'Low Conf',  undefined, 'Neurology');
    await seedMastery(masteryRepo, USER, c1, 10, 10); // confidence = min(10/5,1) = 1.0
    await seedMastery(masteryRepo, USER, c2,  2,  2); // confidence = min(2/5,1)  = 0.4
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    const neuro = result.find(r => r.subject === 'Neurology');
    expect(neuro).toBeDefined();
    // Weighted = (1.0×10 + 0.4×2) / 12 = 0.9; plain avg = 0.7
    expect(neuro!.rollupConfidence).toBeCloseTo(0.9, 2);
  });

  it('counts weakConceptCount as concepts with mastery_score < 0.65', async () => {
    const c1 = await seedConcept(concepts, 'wk-1', 'Weak 1',   undefined, 'Pathology');
    const c2 = await seedConcept(concepts, 'wk-2', 'Boundary', undefined, 'Pathology');
    const c3 = await seedConcept(concepts, 'wk-3', 'Strong',   undefined, 'Pathology');
    await seedMastery(masteryRepo, USER, c1,  2,  0);  // mastery 0.00 → weak
    await seedMastery(masteryRepo, USER, c2, 20, 12);  // mastery 0.60 → weak (< 0.65)
    await seedMastery(masteryRepo, USER, c3, 20, 13);  // mastery 0.65 → NOT weak (≥ 0.65)
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    const patho = result.find(r => r.subject === 'Pathology');
    expect(patho!.weakConceptCount).toBe(2);
  });

  it('assigns correct tier via masteryTier()', async () => {
    // All strong → ontrack
    const c1 = await seedConcept(concepts, 'tr-1', 'Strong Concept', undefined, 'Nephrology');
    await seedMastery(masteryRepo, USER, c1, 10, 10); // mastery 1.0 → ontrack
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    expect(result[0]!.tier).toBe('ontrack');
  });

  it('sorts by rollupMastery ASC (weakest subject first)', async () => {
    const c1 = await seedConcept(concepts, 'sort-a', 'Low',  undefined, 'Pulmonology');
    const c2 = await seedConcept(concepts, 'sort-b', 'High', undefined, 'Rheumatology');
    await seedMastery(masteryRepo, USER, c1, 4, 0);   // mastery 0.0
    await seedMastery(masteryRepo, USER, c2, 4, 4);   // mastery 1.0
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    expect(result[0]!.subject).toBe('Pulmonology');
    expect(result[1]!.subject).toBe('Rheumatology');
  });

  it('sums totalAttempts across all concepts in the subject', async () => {
    const c1 = await seedConcept(concepts, 'att-1', 'C1', undefined, 'Cardiology');
    const c2 = await seedConcept(concepts, 'att-2', 'C2', undefined, 'Cardiology');
    await seedMastery(masteryRepo, USER, c1,  5, 4);
    await seedMastery(masteryRepo, USER, c2, 10, 8);
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    expect(result[0]!.totalAttempts).toBe(15);
  });

  it('uses prefetched rows and skips internal findByUserId', async () => {
    const c1 = await seedConcept(concepts, 'pf-1', 'Prefetch', undefined, 'Cardiology');
    await seedMastery(masteryRepo, USER, c1, 4, 2);
    const preRows = await masteryRepo.findByUserId(USER);
    // Pass an empty repo — would return [] if queried directly
    const { InMemoryUserConceptMasteryRepository: R } = await import('../repositories/memory/UserConceptMasteryRepository.js');
    const emptyRepo = new R();
    const svc = new MasteryQueryService(emptyRepo, concepts, new ConceptHierarchyService(concepts));
    const result = await svc.getSubjectBreakdown(USER, preRows);
    expect(result).toHaveLength(1);
    expect(result[0]!.subject).toBe('Cardiology');
  });

  it('skips concepts with no subject field', async () => {
    // Concepts with empty-string subject should be ignored
    const c1 = await seedConcept(concepts, 'nosub', 'No Subject', undefined, '');
    await seedMastery(masteryRepo, USER, c1, 4, 2);
    const result = await makeService(masteryRepo, concepts).getSubjectBreakdown(USER);
    expect(result).toHaveLength(0);
  });
});

// ── getConceptsBySubject ──────────────────────────────────────────────────────

describe('MasteryQueryService.getConceptsBySubject', () => {
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let concepts:    InMemoryConceptsRepository;

  beforeEach(() => {
    masteryRepo = new InMemoryUserConceptMasteryRepository();
    concepts    = new InMemoryConceptsRepository();
  });

  it('returns empty array when user has no mastery data', async () => {
    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Pharmacology');
    expect(result).toHaveLength(0);
  });

  it('returns only concepts matching the given subject', async () => {
    const c1 = await seedConcept(concepts, 'pharm-1', 'Beta Blockers',    undefined, 'Pharmacology');
    const c2 = await seedConcept(concepts, 'pharm-2', 'ACE Inhibitors',   undefined, 'Pharmacology');
    const c3 = await seedConcept(concepts, 'cardio-1', 'Heart Failure',   undefined, 'Cardiology');
    await seedMastery(masteryRepo, USER, c1, 4, 2);
    await seedMastery(masteryRepo, USER, c2, 4, 3);
    await seedMastery(masteryRepo, USER, c3, 4, 1);

    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Pharmacology');
    expect(result).toHaveLength(2);
    const names = result.map(e => e.concept.name).sort();
    expect(names).toEqual(['ACE Inhibitors', 'Beta Blockers']);
  });

  it('excludes concepts from other subjects', async () => {
    const c1 = await seedConcept(concepts, 'excl-p', 'Pharmacology C', undefined, 'Pharmacology');
    const c2 = await seedConcept(concepts, 'excl-c', 'Cardiology C',   undefined, 'Cardiology');
    await seedMastery(masteryRepo, USER, c1, 4, 2);
    await seedMastery(masteryRepo, USER, c2, 4, 2);

    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Cardiology');
    expect(result).toHaveLength(1);
    expect(result[0]!.concept.name).toBe('Cardiology C');
  });

  it('sorts by mastery_score ASC (weakest first)', async () => {
    const c1 = await seedConcept(concepts, 'sort-ph-1', 'Strong Pharm', undefined, 'Pharmacology');
    const c2 = await seedConcept(concepts, 'sort-ph-2', 'Weak Pharm',   undefined, 'Pharmacology');
    const c3 = await seedConcept(concepts, 'sort-ph-3', 'Mid Pharm',    undefined, 'Pharmacology');
    await seedMastery(masteryRepo, USER, c1, 10, 10); // mastery 1.0
    await seedMastery(masteryRepo, USER, c2,  4,  0); // mastery 0.0
    await seedMastery(masteryRepo, USER, c3,  4,  2); // mastery 0.5

    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Pharmacology');
    expect(result[0]!.concept.name).toBe('Weak Pharm');
    expect(result[1]!.concept.name).toBe('Mid Pharm');
    expect(result[2]!.concept.name).toBe('Strong Pharm');
  });

  it('returns empty array when no concepts match the requested subject', async () => {
    const c1 = await seedConcept(concepts, 'no-match', 'Pharmacology C', undefined, 'Pharmacology');
    await seedMastery(masteryRepo, USER, c1, 4, 2);

    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Neurology');
    expect(result).toHaveLength(0);
  });

  it('includes all tracked concepts regardless of attempt count', async () => {
    const c1 = await seedConcept(concepts, 'one-att', 'One Attempt', undefined, 'Pharmacology');
    await seedMastery(masteryRepo, USER, c1, 1, 1); // only 1 attempt
    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Pharmacology');
    expect(result).toHaveLength(1);
  });

  it('attaches correct tier to each concept', async () => {
    const c1 = await seedConcept(concepts, 'tier-p', 'Priority Pharm', undefined, 'Pharmacology');
    const c2 = await seedConcept(concepts, 'tier-o', 'OnTrack Pharm',  undefined, 'Pharmacology');
    await seedMastery(masteryRepo, USER, c1, 2, 0);   // mastery 0.0 → priority
    await seedMastery(masteryRepo, USER, c2, 10, 10); // mastery 1.0 → ontrack

    const result = await makeService(masteryRepo, concepts).getConceptsBySubject(USER, 'Pharmacology');
    expect(result[0]!.tier).toBe('priority');   // weakest first
    expect(result[1]!.tier).toBe('ontrack');
  });

  it('uses prefetched rows and skips internal findByUserId', async () => {
    const c1 = await seedConcept(concepts, 'pf-sub', 'Prefetch Pharm', undefined, 'Pharmacology');
    await seedMastery(masteryRepo, USER, c1, 4, 2);
    const preRows = await masteryRepo.findByUserId(USER);
    const { InMemoryUserConceptMasteryRepository: R } = await import('../repositories/memory/UserConceptMasteryRepository.js');
    const emptyRepo = new R();
    const svc = new MasteryQueryService(emptyRepo, concepts, new ConceptHierarchyService(concepts));
    const result = await svc.getConceptsBySubject(USER, 'Pharmacology', preRows);
    expect(result).toHaveLength(1);
    expect(result[0]!.concept.name).toBe('Prefetch Pharm');
  });
});
