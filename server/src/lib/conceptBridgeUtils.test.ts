/**
 * Regression tests for the mastery consolidation fix in conceptBridgeUtils.
 *
 * Before the v8.4 fix, canonicalConceptToMasteryKey() slugified the RAW input
 * string rather than the canonical concept name.  That meant a question tagged
 * "bradykinin cough" (a static alias for "ACE Inhibitor Cough") created a
 * separate mastery row from one tagged "ACE Inhibitor Cough", fragmenting
 * per-concept performance data.
 *
 * After the fix the flow is:
 *   raw input → resolveConceptAlias() → canonical name → slugifyConcept() → DB upsert
 *
 * These tests prove the consolidated behaviour and prevent regressions.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';
import {
  canonicalConceptToMasteryKey,
  canonicalConceptsToMasteryKeys,
} from './conceptBridgeUtils.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRepo() {
  return new InMemoryConceptsRepository();
}

// ── Static alias consolidation ────────────────────────────────────────────────

describe('canonicalConceptToMasteryKey — static alias consolidation', () => {
  let repo: InMemoryConceptsRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('resolves "bradykinin cough" to the same UUID as "ACE Inhibitor Cough"', async () => {
    // "bradykinin cough" is a static alias for "ACE Inhibitor Cough" in the
    // Pharmacology × Cardiovascular × ACE Inhibitors entry of CONCEPT_TAXONOMY.
    const idAlias    = await canonicalConceptToMasteryKey('bradykinin cough', repo);
    const idCanonical = await canonicalConceptToMasteryKey('ACE Inhibitor Cough', repo);

    expect(idAlias).not.toBeNull();
    expect(idCanonical).not.toBeNull();
    expect(idAlias).toBe(idCanonical);
  });

  it('stores the canonical name (not the raw alias) in the concepts table', async () => {
    await canonicalConceptToMasteryKey('bradykinin cough', repo);
    const concept = await repo.findBySlug('ace-inhibitor-cough');

    expect(concept).not.toBeNull();
    expect(concept?.name).toBe('ACE Inhibitor Cough');
    expect(concept?.subject).toBe('Pharmacology');
    expect(concept?.system).toBe('Cardiovascular');
    expect(concept?.source).toBe('canonical');
  });

  it('preserves canonical name for a raw canonical input (no alias involved)', async () => {
    await canonicalConceptToMasteryKey('ACE Inhibitor Cough', repo);
    const concept = await repo.findBySlug('ace-inhibitor-cough');

    expect(concept?.name).toBe('ACE Inhibitor Cough');
  });

  it('other ACE Inhibitor aliases also consolidate to the same row', async () => {
    const ids = await Promise.all([
      canonicalConceptToMasteryKey('ACEI cough mechanism', repo),
      canonicalConceptToMasteryKey('bradykinin accumulation cough', repo),
      canonicalConceptToMasteryKey('dry cough ace inhibitor', repo),
      canonicalConceptToMasteryKey('ACE Inhibitor Cough', repo),
    ]);

    const unique = new Set(ids.filter(Boolean));
    expect(unique.size).toBe(1);
  });
});

// ── canonicalConceptsToMasteryKeys dedup ──────────────────────────────────────

describe('canonicalConceptsToMasteryKeys — alias dedup across a single session', () => {
  let repo: InMemoryConceptsRepository;

  beforeEach(() => {
    repo = makeRepo();
  });

  it('returns one ID when alias and canonical appear in the same concepts list', async () => {
    const ids = await canonicalConceptsToMasteryKeys(
      ['bradykinin cough', 'ACE Inhibitor Cough'],
      repo,
    );

    expect(ids).toHaveLength(1);
  });

  it('returns one ID when the canonical appears twice', async () => {
    const ids = await canonicalConceptsToMasteryKeys(
      ['ACE Inhibitor Cough', 'ACE Inhibitor Cough'],
      repo,
    );

    expect(ids).toHaveLength(1);
  });

  it('returns distinct IDs for genuinely different concepts', async () => {
    const ids = await canonicalConceptsToMasteryKeys(
      ['ACE Inhibitor Cough', 'ACE Inhibitor Angioedema'],
      repo,
    );

    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('filters out non-usable strings without throwing', async () => {
    const ids = await canonicalConceptsToMasteryKeys(
      ['', 'unknown', 'bradykinin cough'],
      repo,
    );

    // Only 'bradykinin cough' is usable
    expect(ids).toHaveLength(1);
  });

  it('returns empty array for an empty input list', async () => {
    const ids = await canonicalConceptsToMasteryKeys([], repo);
    expect(ids).toHaveLength(0);
  });
});
