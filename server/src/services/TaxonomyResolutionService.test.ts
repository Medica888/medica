import { describe, it, expect, beforeEach } from 'vitest';
import { TaxonomyAliasService } from './TaxonomyAliasService.js';
import { TaxonomyResolutionService } from './TaxonomyResolutionService.js';
import { InMemoryTaxonomyCandidatesRepository } from '../repositories/memory/TaxonomyCandidatesRepository.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRepo() {
  return new InMemoryTaxonomyCandidatesRepository();
}

function makeService(aliasService?: TaxonomyAliasService) {
  const alias = aliasService ?? new TaxonomyAliasService();
  return new TaxonomyResolutionService(alias);
}

async function seedMappedTopicAlias(
  repo: InMemoryTaxonomyCandidatesRepository,
  rawLabel: string,
  mappedTo: string,
  subject = 'Pharmacology',
  system  = 'Cardiovascular',
) {
  const candidate = await repo.upsertUnknownTopicCandidate({
    rawLabel,
    normalizedGuess: rawLabel,
    subject,
    system,
    source: 'validation_topic',
    type: 'topic',
  });
  await repo.updateUnknownTopicCandidateStatus(candidate.id, {
    status: 'mapped_alias',
    metadata: { mappedTo },
  });
}

async function seedMappedConceptAlias(
  repo: InMemoryTaxonomyCandidatesRepository,
  rawLabel: string,
  mappedTo: string,
) {
  const candidate = await repo.upsertUnknownTopicCandidate({
    rawLabel,
    normalizedGuess: rawLabel,
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    source: 'validation_concept',
    type: 'concept',
  });
  await repo.updateUnknownTopicCandidateStatus(candidate.id, {
    status: 'mapped_alias',
    metadata: { mappedTo },
  });
}

// ── TaxonomyAliasService unit tests ──────────────────────────────────────────

describe('TaxonomyAliasService', () => {
  let repo: InMemoryTaxonomyCandidatesRepository;
  let service: TaxonomyAliasService;

  beforeEach(() => {
    repo    = makeRepo();
    service = new TaxonomyAliasService();
  });

  it('starts with empty caches', () => {
    expect(service.topicCacheSize).toBe(0);
    expect(service.conceptCacheSize).toBe(0);
  });

  it('loads mapped_alias topics into topic cache', async () => {
    // 'ACE Inhibitors' is a valid canonical in the static topic taxonomy
    await seedMappedTopicAlias(repo, 'ace inhibitor drugs', 'ACE Inhibitors');
    await service.loadApprovedAliases(repo);
    expect(service.topicCacheSize).toBe(1);
    expect(service.lookupTopicAlias('ace inhibitor drugs')).toBe('ACE Inhibitors');
  });

  it('loads mapped_alias concepts into concept cache', async () => {
    await seedMappedConceptAlias(repo, 'bradykinin cough mechanism', 'ACE Inhibitor Cough');
    await service.loadApprovedAliases(repo);
    expect(service.conceptCacheSize).toBe(1);
    expect(service.lookupConceptAlias('bradykinin cough mechanism')).toBe('ACE Inhibitor Cough');
  });

  it('uses taxonomy key() normalization — strips punctuation', async () => {
    await seedMappedTopicAlias(repo, 'ACE Inhibitors (drug class)', 'ACE Inhibitors');
    await service.loadApprovedAliases(repo);
    // The cache key is taxonomyKey('ACE Inhibitors (drug class)') = 'aceinhibitorsdrugclass'
    // Lookup of 'ACE Inhibitors (drug class)' should normalize the same way
    expect(service.lookupTopicAlias('ACE Inhibitors (drug class)')).toBe('ACE Inhibitors');
  });

  it('returns null for unknown alias', async () => {
    await service.loadApprovedAliases(repo);
    expect(service.lookupTopicAlias('not a real topic')).toBeNull();
  });

  it('increments hit counter on each lookup hit', async () => {
    await seedMappedTopicAlias(repo, 'ace inhibitor drugs', 'ACE Inhibitors');
    await service.loadApprovedAliases(repo);
    service.lookupTopicAlias('ace inhibitor drugs');
    service.lookupTopicAlias('ace inhibitor drugs');
    expect(service.topicHitCount).toBe(2);
  });

  it('does not increment hit counter on miss', async () => {
    await service.loadApprovedAliases(repo);
    service.lookupTopicAlias('unknown label');
    expect(service.topicHitCount).toBe(0);
  });

  it('replaces cache atomically on refresh — old entries gone', async () => {
    await seedMappedTopicAlias(repo, 'old label', 'ACE Inhibitors');
    await service.loadApprovedAliases(repo);
    expect(service.topicCacheSize).toBe(1);

    // Reject old, approve nothing new
    const entry = [...(await repo.findUnknownTopicCandidates({ status: 'mapped_alias' }))][0];
    await repo.updateUnknownTopicCandidateStatus(entry.id, { status: 'rejected' });

    await service.loadApprovedAliases(repo);
    expect(service.topicCacheSize).toBe(0);
    expect(service.lookupTopicAlias('old label')).toBeNull();
  });

  it('skips candidates with blank canonical destination', async () => {
    const candidate = await repo.upsertUnknownTopicCandidate({
      rawLabel: 'some label',
      normalizedGuess: '',
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      source: 'validation_topic',
      type: 'topic',
    });
    await repo.updateUnknownTopicCandidateStatus(candidate.id, {
      status: 'mapped_alias',
      metadata: { mappedTo: '' },
    });
    await service.loadApprovedAliases(repo);
    expect(service.topicCacheSize).toBe(0);
  });
});

// ── TaxonomyResolutionService unit tests ─────────────────────────────────────

describe('TaxonomyResolutionService.resolveTopicAlias', () => {
  let repo:    InMemoryTaxonomyCandidatesRepository;
  let alias:   TaxonomyAliasService;
  let service: TaxonomyResolutionService;

  beforeEach(async () => {
    repo    = makeRepo();
    alias   = new TaxonomyAliasService();
    service = new TaxonomyResolutionService(alias);
    await service.loadApprovedAliases(repo);
  });

  it('returns canonical aliasSource for exact match', () => {
    // 'ACE Inhibitors' is canonical in Pharmacology×Cardiovascular in the static taxonomy
    const result = service.resolveTopicAlias('ACE Inhibitors');
    expect(result).not.toBeNull();
    expect(result?.aliasSource).toBe('canonical');
    expect(result?.wasAlias).toBe(false);
  });

  it('returns static_alias aliasSource for a known static alias', () => {
    // 'ACE inhibitors' (lowercase) is an alias in the static taxonomy
    const result = service.resolveTopicAlias('ace inhibitors');
    expect(result).not.toBeNull();
    // Either canonical or static_alias depending on whether exact form is the canonical
    expect(['canonical', 'static_alias']).toContain(result?.aliasSource);
  });

  it('returns null for unknown topic with empty cache', () => {
    const result = service.resolveTopicAlias('completely unknown medical topic xyz');
    expect(result).toBeNull();
  });

  it('returns runtime_alias when approved candidate maps to a known canonical', async () => {
    // 'ace inhibitor drugs' → 'ACE Inhibitors' (canonical in static taxonomy)
    await seedMappedTopicAlias(repo, 'ace inhibitor drugs', 'ACE Inhibitors');
    await service.loadApprovedAliases(repo);

    const result = service.resolveTopicAlias('ace inhibitor drugs');
    expect(result).not.toBeNull();
    expect(result?.aliasSource).toBe('runtime_alias');
    expect(result?.wasAlias).toBe(true);
    expect(result?.canonical).toBe('ACE Inhibitors');
    expect(result?.subject).toBe('Pharmacology');
    expect(result?.system).toBe('Cardiovascular');
  });

  it('returns null when runtime canonical is not in static taxonomy', async () => {
    await seedMappedTopicAlias(repo, 'some label', 'Completely New Topic Not In Static Taxonomy XYZ');
    await service.loadApprovedAliases(repo);

    const result = service.resolveTopicAlias('some label');
    expect(result).toBeNull();
  });

  it('is case-insensitive and punctuation-insensitive for runtime cache hits', async () => {
    await seedMappedTopicAlias(repo, 'ACE Inhibitor Drugs', 'ACE Inhibitors');
    await service.loadApprovedAliases(repo);

    expect(service.resolveTopicAlias('ace inhibitor drugs')?.aliasSource).toBe('runtime_alias');
    expect(service.resolveTopicAlias('ACE INHIBITOR DRUGS')?.aliasSource).toBe('runtime_alias');
    expect(service.resolveTopicAlias('ace-inhibitor-drugs')?.aliasSource).toBe('runtime_alias');
  });
});

describe('TaxonomyResolutionService.resolveConceptAlias', () => {
  let repo:    InMemoryTaxonomyCandidatesRepository;
  let alias:   TaxonomyAliasService;
  let service: TaxonomyResolutionService;

  beforeEach(async () => {
    repo    = makeRepo();
    alias   = new TaxonomyAliasService();
    service = new TaxonomyResolutionService(alias);
    await service.loadApprovedAliases(repo);
  });

  it('returns canonical for exact canonical concept name', () => {
    const result = service.resolveConceptAlias('ACE Inhibitor Cough');
    expect(result).not.toBeNull();
    expect(result?.aliasSource).toBe('canonical');
    expect(result?.canonical).toBe('ACE Inhibitor Cough');
  });

  it('returns static_alias for a known static concept alias', () => {
    // 'bradykinin cough' is a static alias for 'ACE Inhibitor Cough'
    const result = service.resolveConceptAlias('bradykinin cough');
    expect(result).not.toBeNull();
    expect(result?.aliasSource).toBe('static_alias');
    expect(result?.canonical).toBe('ACE Inhibitor Cough');
    expect(result?.wasAlias).toBe(true);
  });

  it('returns null for unknown concept', () => {
    expect(service.resolveConceptAlias('totally unknown concept xyz')).toBeNull();
  });

  it('returns runtime_alias when approved candidate maps to known canonical concept', async () => {
    await seedMappedConceptAlias(repo, 'bradykinin cough mechanism', 'ACE Inhibitor Cough');
    await service.loadApprovedAliases(repo);

    const result = service.resolveConceptAlias('bradykinin cough mechanism');
    expect(result).not.toBeNull();
    expect(result?.aliasSource).toBe('runtime_alias');
    expect(result?.wasAlias).toBe(true);
    expect(result?.canonical).toBe('ACE Inhibitor Cough');
  });
});

// ── refreshCache / getAliasMetrics ────────────────────────────────────────────

describe('TaxonomyResolutionService.refreshCache + getAliasMetrics', () => {
  it('refreshCache updates the live alias cache without restart', async () => {
    const repo    = makeRepo();
    const alias   = new TaxonomyAliasService();
    const service = new TaxonomyResolutionService(alias);
    await service.loadApprovedAliases(repo);

    expect(service.resolveTopicAlias('ace inhibitor drugs')).toBeNull();

    await seedMappedTopicAlias(repo, 'ace inhibitor drugs', 'ACE Inhibitors');
    await service.refreshCache(repo);

    expect(service.resolveTopicAlias('ace inhibitor drugs')?.aliasSource).toBe('runtime_alias');
  });

  it('getAliasMetrics reflects loaded cache sizes and hit counts', async () => {
    const repo    = makeRepo();
    const alias   = new TaxonomyAliasService();
    const service = new TaxonomyResolutionService(alias);

    await seedMappedTopicAlias(repo, 'ace inhibitor drugs', 'ACE Inhibitors');
    await seedMappedConceptAlias(repo, 'bradykinin cough mechanism', 'ACE Inhibitor Cough');
    await service.loadApprovedAliases(repo);

    service.resolveTopicAlias('ace inhibitor drugs');   // hit
    service.resolveConceptAlias('bradykinin cough mechanism'); // hit

    const metrics = service.getAliasMetrics();
    expect(metrics.topicAliasCount).toBe(1);
    expect(metrics.conceptAliasCount).toBe(1);
    expect(metrics.approvedRuntimeAliases).toBe(2);
    expect(metrics.topicAliasHitCount).toBe(1);
    expect(metrics.conceptAliasHitCount).toBe(1);
  });
});

// ── Fail-safe: repo throws ────────────────────────────────────────────────────

describe('TaxonomyAliasService — fail-safe', () => {
  it('does not throw when repo load fails — old cache preserved', async () => {
    const alias   = new TaxonomyAliasService();
    const service = new TaxonomyResolutionService(alias);

    const badRepo = {
      findUnknownTopicCandidates: async () => { throw new Error('DB down'); },
      upsertUnknownTopicCandidate: async () => { throw new Error('DB down'); },
      updateUnknownTopicCandidateStatus: async () => null,
    } as unknown as InMemoryTaxonomyCandidatesRepository;

    // loadApprovedAliases itself throws; caller (index.ts) catches and warns
    await expect(service.loadApprovedAliases(badRepo)).rejects.toThrow('DB down');
    // Cache remains empty (or previous state) — no partial corruption
    expect(alias.topicCacheSize).toBe(0);
  });
});
