import { describe, it, expect, beforeEach } from 'vitest';
import { ConceptMappingService } from './ConceptMappingService.js';
import { ConceptHierarchyService } from './ConceptHierarchyService.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';
import { InMemoryQuestionConceptsRepository } from '../repositories/memory/QuestionConceptsRepository.js';

// ── Shared setup ──────────────────────────────────────────────────────────────

function makeRepos() {
  const conceptsRepo = new InMemoryConceptsRepository();
  const questionConceptsRepo = new InMemoryQuestionConceptsRepository();
  const mappingService = new ConceptMappingService(conceptsRepo, questionConceptsRepo);
  const hierarchyService = new ConceptHierarchyService(conceptsRepo);
  return { conceptsRepo, questionConceptsRepo, mappingService, hierarchyService };
}

// A question that produces all 4 hierarchy levels:
//   raas-pharmacology (0.4) → antihypertensive-adverse-effects (0.6)
//     → ace-inhibitor (1.0) → bradykinin-cough (0.7)
const fullQuestion = {
  id: 'q-001',
  text: 'A patient on lisinopril develops a dry cough.',
  options: ['Continue', 'Switch to ARB', 'Add β-blocker', 'Stop all antihypertensives'],
  correct_answer: 'Switch to ARB',
  subject: 'Pharmacology',
  system: 'Cardiovascular',
  testedConcept:    'ACE Inhibitor — Bradykinin Cough',
  weakSpotCategory: 'Antihypertensive Adverse Effects',
  canonicalTopic:   'RAAS Pharmacology',
};

// A question that produces only 2 levels:
//   acute-mi (1.0) → st-elevation (0.7)
const twoLevelQuestion = {
  id: 'q-002',
  text: 'Patient with ST elevation in V1-V4.',
  options: ['Aspirin', 'Heparin', 'PCI', 'Thrombolytics'],
  correct_answer: 'PCI',
  subject: 'Cardiology',
  system: 'Cardiovascular',
  testedConcept: 'Acute MI — ST Elevation',
};

// A question with no parent chain (only primary concept):
const singleConceptQuestion = {
  id: 'q-003',
  text: 'What is the mechanism of spironolactone?',
  options: ['Loop diuretic', 'Aldosterone antagonist', 'Beta-blocker', 'ACE inhibitor'],
  correct_answer: 'Aldosterone antagonist',
  subject: 'Pharmacology',
  system: 'Renal',
  testedConcept: 'Spironolactone',
};

// ── Hierarchy assignment in mapQuestion ───────────────────────────────────────

describe('ConceptMappingService — hierarchy assignment', () => {
  it('assigns parent_concept_id in root-to-leaf order for all 4 levels', async () => {
    const { conceptsRepo, mappingService } = makeRepos();
    await mappingService.mapQuestion(fullQuestion, 'db-q-001');

    const all = conceptsRepo._getAll();

    const raas  = all.find((c) => c.slug === 'raas-pharmacology');
    const aae   = all.find((c) => c.slug === 'antihypertensive-adverse-effects');
    const ace   = all.find((c) => c.slug === 'ace-inhibitor');
    const brady = all.find((c) => c.slug === 'bradykinin-cough');

    // Root has no parent
    expect(raas?.parent_concept_id).toBeUndefined();

    // Chain: raas → aae → ace → brady
    expect(aae?.parent_concept_id).toBe(raas?.id);
    expect(ace?.parent_concept_id).toBe(aae?.id);
    expect(brady?.parent_concept_id).toBe(ace?.id);
  });

  it('assigns correct parent chain for a 2-level dash question', async () => {
    const { conceptsRepo, mappingService } = makeRepos();
    await mappingService.mapQuestion(twoLevelQuestion, 'db-q-002');

    const all = conceptsRepo._getAll();
    const mi  = all.find((c) => c.slug === 'acute-mi');
    const ste = all.find((c) => c.slug === 'st-elevation');

    expect(mi?.parent_concept_id).toBeUndefined();
    expect(ste?.parent_concept_id).toBe(mi?.id);
  });

  it('single-concept question has no parent', async () => {
    const { conceptsRepo, mappingService } = makeRepos();
    await mappingService.mapQuestion(singleConceptQuestion, 'db-q-003');

    const all = conceptsRepo._getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.parent_concept_id).toBeUndefined();
  });

  it('question_concept links preserve original weights regardless of hierarchy order', async () => {
    const { questionConceptsRepo, mappingService, conceptsRepo } = makeRepos();
    await mappingService.mapQuestion(fullQuestion, 'db-q-001');

    const links = await questionConceptsRepo.findByQuestionId('db-q-001');
    const all = conceptsRepo._getAll();

    const findWeight = (slug: string) => {
      const concept = all.find((c) => c.slug === slug);
      return links.find((l) => l.concept_id === concept?.id)?.weight;
    };

    expect(findWeight('ace-inhibitor')).toBe(1.0);
    expect(findWeight('bradykinin-cough')).toBe(0.7);
    expect(findWeight('antihypertensive-adverse-effects')).toBe(0.6);
    expect(findWeight('raas-pharmacology')).toBe(0.4);
  });

  it('re-upsert of same concept with a parent sets parent when previously unset', async () => {
    const { conceptsRepo } = makeRepos();

    // First upsert: no parent
    const first = await conceptsRepo.upsertBySlug('ace-inhibitor', {
      name: 'ACE Inhibitor', subject: 'Pharmacology', system: 'Cardiovascular',
    });
    expect(first.parent_concept_id).toBeUndefined();

    // Second upsert: with parent
    const parent = await conceptsRepo.upsertBySlug('raas-pharmacology', {
      name: 'RAAS Pharmacology', subject: 'Pharmacology', system: 'Cardiovascular',
    });
    const second = await conceptsRepo.upsertBySlug('ace-inhibitor', {
      name: 'ACE Inhibitor', subject: 'Pharmacology', system: 'Cardiovascular',
      parent_concept_id: parent.id,
    });
    expect(second.parent_concept_id).toBe(parent.id);
  });

  it('re-upsert does NOT overwrite an existing parent_concept_id', async () => {
    const { conceptsRepo } = makeRepos();

    const parent1 = await conceptsRepo.upsertBySlug('raas-pharmacology', {
      name: 'RAAS', subject: 'Pharmacology', system: 'Cardiovascular',
    });
    const parent2 = await conceptsRepo.upsertBySlug('cardiac-pharmacology', {
      name: 'Cardiac Pharm', subject: 'Pharmacology', system: 'Cardiovascular',
    });

    // Set parent1 first
    await conceptsRepo.upsertBySlug('ace-inhibitor', {
      name: 'ACE Inhibitor', subject: 'Pharmacology', system: 'Cardiovascular',
      parent_concept_id: parent1.id,
    });
    // Try to overwrite with parent2 — should be ignored (COALESCE keeps existing)
    const result = await conceptsRepo.upsertBySlug('ace-inhibitor', {
      name: 'ACE Inhibitor', subject: 'Pharmacology', system: 'Cardiovascular',
      parent_concept_id: parent2.id,
    });
    expect(result.parent_concept_id).toBe(parent1.id); // first-wins preserved
  });
});

// ── ConceptHierarchyService ───────────────────────────────────────────────────

describe('ConceptHierarchyService', () => {
  async function buildFullTree() {
    const { conceptsRepo, mappingService, hierarchyService } = makeRepos();
    await mappingService.mapQuestion(fullQuestion, 'db-q-001');
    return { conceptsRepo, hierarchyService };
  }

  it('getPath returns slugs root-to-leaf for a leaf concept', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const brady = conceptsRepo._getAll().find((c) => c.slug === 'bradykinin-cough')!;

    const path = await hierarchyService.getPath(brady.id);
    expect(path).toEqual([
      'raas-pharmacology',
      'antihypertensive-adverse-effects',
      'ace-inhibitor',
      'bradykinin-cough',
    ]);
  });

  it('getPath returns a single slug for a root concept', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const root = conceptsRepo._getAll().find((c) => c.slug === 'raas-pharmacology')!;

    const path = await hierarchyService.getPath(root.id);
    expect(path).toEqual(['raas-pharmacology']);
  });

  it('getPath returns empty array for unknown conceptId', async () => {
    const { hierarchyService } = await buildFullTree();
    const path = await hierarchyService.getPath('non-existent-id');
    expect(path).toEqual([]);
  });

  it('getAncestorIds returns IDs root-first for a leaf', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const all = conceptsRepo._getAll();
    const raas  = all.find((c) => c.slug === 'raas-pharmacology')!;
    const aae   = all.find((c) => c.slug === 'antihypertensive-adverse-effects')!;
    const ace   = all.find((c) => c.slug === 'ace-inhibitor')!;
    const brady = all.find((c) => c.slug === 'bradykinin-cough')!;

    const ids = await hierarchyService.getAncestorIds(brady.id);
    expect(ids).toEqual([raas.id, aae.id, ace.id]);
  });

  it('getRoot returns the root for any descendant', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const all = conceptsRepo._getAll();
    const brady = all.find((c) => c.slug === 'bradykinin-cough')!;
    const raas  = all.find((c) => c.slug === 'raas-pharmacology')!;

    const root = await hierarchyService.getRoot(brady.id);
    expect(root?.id).toBe(raas.id);
  });

  it('getRoot returns self for a root concept', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const raas = conceptsRepo._getAll().find((c) => c.slug === 'raas-pharmacology')!;

    const root = await hierarchyService.getRoot(raas.id);
    expect(root?.id).toBe(raas.id);
  });

  it('isDescendantOf correctly identifies ancestry relationships', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const all = conceptsRepo._getAll();
    const raas  = all.find((c) => c.slug === 'raas-pharmacology')!;
    const ace   = all.find((c) => c.slug === 'ace-inhibitor')!;
    const brady = all.find((c) => c.slug === 'bradykinin-cough')!;

    // bradykinin is a descendant of raas (indirect)
    expect(await hierarchyService.isDescendantOf(brady.id, raas.id)).toBe(true);
    // bradykinin is a descendant of ace (direct)
    expect(await hierarchyService.isDescendantOf(brady.id, ace.id)).toBe(true);
    // raas is NOT a descendant of bradykinin
    expect(await hierarchyService.isDescendantOf(raas.id, brady.id)).toBe(false);
    // ace is not a descendant of itself
    expect(await hierarchyService.isDescendantOf(ace.id, ace.id)).toBe(false);
  });

  it('getFamily returns self + ancestors (root-first) + descendants', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const all = conceptsRepo._getAll();
    const ace = all.find((c) => c.slug === 'ace-inhibitor')!;

    const family = await hierarchyService.getFamily(ace.id);
    expect(family.self?.id).toBe(ace.id);

    // ancestors: raas → aae (root-first)
    expect(family.ancestors.map((c) => c.slug)).toEqual([
      'raas-pharmacology',
      'antihypertensive-adverse-effects',
    ]);

    // descendants: bradykinin-cough
    expect(family.descendants.map((c) => c.slug)).toEqual(['bradykinin-cough']);
  });

  it('findDescendants returns all descendants of a root', async () => {
    const { conceptsRepo, hierarchyService } = await buildFullTree();
    const raas = conceptsRepo._getAll().find((c) => c.slug === 'raas-pharmacology')!;

    const { descendants } = await hierarchyService.getFamily(raas.id);
    const slugs = descendants.map((c) => c.slug).sort();
    expect(slugs).toContain('antihypertensive-adverse-effects');
    expect(slugs).toContain('ace-inhibitor');
    expect(slugs).toContain('bradykinin-cough');
    expect(slugs).toHaveLength(3);
  });
});
