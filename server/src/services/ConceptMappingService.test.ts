import { describe, it, expect, beforeEach } from 'vitest';
import { slugifyConcept, extractConcepts, ConceptMappingService } from './ConceptMappingService.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';
import { InMemoryQuestionConceptsRepository } from '../repositories/memory/QuestionConceptsRepository.js';

// ── slugifyConcept ────────────────────────────────────────────────────────────

describe('slugifyConcept', () => {
  it('lowercases and hyphenates spaces', () => {
    expect(slugifyConcept('ACE Inhibitors')).toBe('ace-inhibitors');
  });

  it('replaces Greek letters', () => {
    expect(slugifyConcept('β-blockers')).toBe('beta-blockers');
    expect(slugifyConcept('α-adrenergic')).toBe('alpha-adrenergic');
  });

  it('collapses multiple spaces and hyphens', () => {
    expect(slugifyConcept('Renal  /  Urinary')).toBe('renal-urinary');
    expect(slugifyConcept('HMG-CoA Reductase')).toBe('hmg-coa-reductase');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugifyConcept('  Acute MI  ')).toBe('acute-mi');
  });

  it('produces identical slugs for name variants', () => {
    expect(slugifyConcept('ACE inhibitor')).toBe(slugifyConcept('ACE Inhibitor'));
  });
});

// ── extractConcepts ───────────────────────────────────────────────────────────

describe('extractConcepts', () => {
  it('extracts primary concept from testedConcept', () => {
    const candidates = extractConcepts({
      testedConcept: 'ACE Inhibitors',
      weakSpotCategory: '',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.name).toBe('ACE Inhibitors');
    expect(candidates[0]!.slug).toBe('ace-inhibitors');
    expect(candidates[0]!.weight).toBe(1.0);
  });

  it('splits dash-format testedConcept into two concepts', () => {
    const candidates = extractConcepts({
      testedConcept: 'ACE Inhibitors — RAAS Pathway',
      weakSpotCategory: '',
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.name).toBe('ACE Inhibitors');
    expect(candidates[0]!.weight).toBe(1.0);
    expect(candidates[1]!.name).toBe('RAAS Pathway');
    expect(candidates[1]!.weight).toBe(0.70);
  });

  it('adds weakSpotCategory as secondary concept when distinct', () => {
    const candidates = extractConcepts({
      testedConcept: 'ACE Inhibitors',
      weakSpotCategory: 'Cardiac Pharmacology',
    });
    expect(candidates).toHaveLength(2);
    expect(candidates[1]!.name).toBe('Cardiac Pharmacology');
    expect(candidates[1]!.weight).toBe(0.60);
  });

  it('deduplicates by slug — same slug appears only once', () => {
    const candidates = extractConcepts({
      testedConcept: 'ACE Inhibitors',
      weakSpotCategory: 'ACE inhibitors', // same slug, different casing
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.slug).toBe('ace-inhibitors');
  });

  it('skips empty and generic values', () => {
    const candidates = extractConcepts({
      testedConcept: '',
      weakSpotCategory: 'General',
      canonicalTopic: 'Mixed',
    });
    expect(candidates).toHaveLength(0);
  });

  it('falls back to topic when no primary concept metadata is present', () => {
    const candidates = extractConcepts({
      topic: 'Hypertension Management',
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.slug).toBe('hypertension-management');
    expect(candidates[0]!.weight).toBe(0.40);
  });

  it('caps output at 4 concepts', () => {
    const candidates = extractConcepts({
      testedConcept: 'Drug A — Mechanism B',
      weakSpotCategory: 'Category C',
      canonicalTopic: 'Topic D',
      topic: 'Topic E',
    });
    expect(candidates.length).toBeLessThanOrEqual(4);
  });

  it('adds canonicalTopic as tertiary when distinct', () => {
    const candidates = extractConcepts({
      testedConcept: 'Loop Diuretics',
      weakSpotCategory: 'Renal Pharmacology',
      canonicalTopic: 'Ischemic Heart Disease',
    });
    expect(candidates).toHaveLength(3);
    expect(candidates[2]!.weight).toBe(0.40);
  });
});

// ── ConceptMappingService ─────────────────────────────────────────────────────

describe('ConceptMappingService', () => {
  let conceptsRepo: InMemoryConceptsRepository;
  let questionConceptsRepo: InMemoryQuestionConceptsRepository;
  let service: ConceptMappingService;

  beforeEach(() => {
    conceptsRepo = new InMemoryConceptsRepository();
    questionConceptsRepo = new InMemoryQuestionConceptsRepository();
    service = new ConceptMappingService(conceptsRepo, questionConceptsRepo);
  });

  const baseQuestion = {
    id: 'q-db-uuid-001',
    text: 'A 45-year-old man presents with cough after starting a new medication for hypertension.',
    options: ['Continue medication', 'Switch to ARB', 'Add spironolactone', 'Add amlodipine'],
    correct_answer: 'Switch to ARB',
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    testedConcept: 'ACE Inhibitor — Bradykinin Cough',
    weakSpotCategory: 'Antihypertensive Adverse Effects',
    canonicalTopic: 'RAAS Pharmacology',
  };

  it('upserts concepts and creates question_concept links', async () => {
    await service.mapQuestion(baseQuestion, 'db-uuid-001');

    const links = await questionConceptsRepo.findByQuestionId('db-uuid-001');
    expect(links.length).toBeGreaterThanOrEqual(1);

    const allConcepts = conceptsRepo._getAll();
    expect(allConcepts.length).toBeGreaterThanOrEqual(1);
    expect(allConcepts.some((c) => c.slug === 'ace-inhibitor')).toBe(true);
  });

  it('sets primary concept weight to 1.0', async () => {
    await service.mapQuestion(baseQuestion, 'db-uuid-001');

    const links = await questionConceptsRepo.findByQuestionId('db-uuid-001');
    const primaryLink = links.find((l) => {
      const c = conceptsRepo._getAll().find((c) => c.id === l.concept_id);
      return c?.slug === 'ace-inhibitor';
    });
    expect(primaryLink?.weight).toBe(1.0);
  });

  it('sets secondary (dash-format) concept weight to 0.7', async () => {
    await service.mapQuestion(baseQuestion, 'db-uuid-001');

    const allConcepts = conceptsRepo._getAll();
    const bradykinin = allConcepts.find((c) => c.slug === 'bradykinin-cough');
    expect(bradykinin).toBeDefined();

    const links = await questionConceptsRepo.findByQuestionId('db-uuid-001');
    const bradyLink = links.find((l) => l.concept_id === bradykinin?.id);
    expect(bradyLink?.weight).toBe(0.70);
  });

  it('stores subject and system on the concept (first-wins)', async () => {
    await service.mapQuestion(baseQuestion, 'db-uuid-001');

    const concept = await conceptsRepo.findBySlug('ace-inhibitor');
    expect(concept?.subject).toBe('Pharmacology');
    expect(concept?.system).toBe('Cardiovascular');
  });

  it('preserves first-seen subject/system on re-upsert with different values', async () => {
    await service.mapQuestion(baseQuestion, 'db-uuid-001');

    const differentSubjectQuestion = {
      ...baseQuestion,
      id: 'q-db-uuid-002',
      subject: 'Internal Medicine',
      system: 'Renal',
      testedConcept: 'ACE Inhibitor — Bradykinin Cough', // same concept
    };
    await service.mapQuestion(differentSubjectQuestion, 'db-uuid-002');

    const concept = await conceptsRepo.findBySlug('ace-inhibitor');
    expect(concept?.subject).toBe('Pharmacology'); // first-wins
    expect(concept?.system).toBe('Cardiovascular'); // first-wins
  });

  it('is a no-op for questions with no usable concept metadata', async () => {
    const emptyQuestion = {
      ...baseQuestion,
      testedConcept: undefined,
      weakSpotCategory: undefined,
      canonicalTopic: undefined,
      topic: undefined,
    };
    await service.mapQuestion(emptyQuestion, 'db-uuid-001');

    const links = await questionConceptsRepo.findByQuestionId('db-uuid-001');
    expect(links).toHaveLength(0);
  });

  it('links multiple questions to the same concept correctly', async () => {
    const q2 = {
      ...baseQuestion,
      id: 'q-db-uuid-002',
      testedConcept: 'ACE Inhibitors', // same primary slug
    };

    await service.mapQuestion(baseQuestion, 'db-uuid-001');
    await service.mapQuestion(q2, 'db-uuid-002');

    const allConcepts = conceptsRepo._getAll();
    const aceInhibitorConcept = allConcepts.find((c) => c.slug === 'ace-inhibitor' || c.slug === 'ace-inhibitors');
    expect(aceInhibitorConcept).toBeDefined();

    const links1 = await questionConceptsRepo.findByQuestionId('db-uuid-001');
    const links2 = await questionConceptsRepo.findByQuestionId('db-uuid-002');
    expect(links1.length).toBeGreaterThanOrEqual(1);
    expect(links2.length).toBeGreaterThanOrEqual(1);
  });
});
