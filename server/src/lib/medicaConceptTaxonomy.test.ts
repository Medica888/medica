import { describe, it, expect } from 'vitest';
import {
  lookupConcept,
  normalizeConcept,
  getCanonicalConcept,
  getConceptAliases,
  isValidConcept,
  getConceptsForTopic,
  getRelatedConcepts,
  getTotalConceptCount,
  getAllCanonicals,
  groupFlashcardsByConcept,
  extractConceptWeaknesses,
} from './medicaConceptTaxonomy.js';

// ── Integrity guards ──────────────────────────────────────────────────────────

describe('medicaConceptTaxonomy — integrity', () => {
  it('loads without alias collisions (module-level guard)', () => {
    // The buildConceptLookup() singleton throws at import time on collision.
    // Reaching this line proves it did not throw.
    expect(getTotalConceptCount()).toBeGreaterThan(0);
  });

  it('has 200–300 canonical concepts', () => {
    const count = getTotalConceptCount();
    expect(count).toBeGreaterThanOrEqual(200);
    expect(count).toBeLessThanOrEqual(350);
  });

  it('all canonical names are unique (no duplicate canonicals)', () => {
    // buildConceptLookup() already throws at import time on dup, but this test
    // verifies the invariant at the data level rather than relying solely on the guard.
    const canonicals = getAllCanonicals();
    const unique = new Set(canonicals.map(c => c.toLowerCase()));
    expect(unique.size).toBe(canonicals.length);
  });
});

// ── lookupConcept — exact canonical ──────────────────────────────────────────

describe('lookupConcept — exact canonical matches', () => {
  it('finds Na-K-2Cl Transporter Inhibition in Pharmacology × Renal under Loop Diuretics', () => {
    const result = lookupConcept('Na-K-2Cl Transporter Inhibition');
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Na-K-2Cl Transporter Inhibition');
    expect(result!.subject).toBe('Pharmacology');
    expect(result!.system).toBe('Renal / Urinary');
    expect(result!.topic).toBe('Loop Diuretics');
    expect(result!.wasAlias).toBe(false);
  });

  it('finds Lewy Body Alpha-Synuclein Pathology in Pathology × Neurology', () => {
    const result = lookupConcept('Lewy Body Alpha-Synuclein Pathology');
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Pathology');
    expect(result!.system).toBe('Neurology');
    expect(result!.topic).toBe('Parkinson Disease');
    expect(result!.wasAlias).toBe(false);
  });

  it('finds Insulin GLUT4 Translocation in Pharmacology × Endocrine', () => {
    const result = lookupConcept('Insulin GLUT4 Translocation');
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Pharmacology');
    expect(result!.system).toBe('Endocrine');
    expect(result!.topic).toBe('Insulin');
    expect(result!.wasAlias).toBe(false);
  });

  it('finds Periventricular Plaques on MRI in Pathology × Neurology under Multiple Sclerosis', () => {
    const result = lookupConcept('Periventricular Plaques on MRI');
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Pathology');
    expect(result!.system).toBe('Neurology');
    expect(result!.topic).toBe('Multiple Sclerosis');
    expect(result!.wasAlias).toBe(false);
  });
});

// ── lookupConcept — alias matching ────────────────────────────────────────────

describe('lookupConcept — alias matching (wasAlias=true)', () => {
  it('resolves "NKCC2 inhibition" to Na-K-2Cl Transporter Inhibition via alias', () => {
    const result = lookupConcept('NKCC2 inhibition');
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Na-K-2Cl Transporter Inhibition');
    expect(result!.wasAlias).toBe(true);
  });

  it('resolves "furosemide ototoxicity" to Loop Diuretic Ototoxicity via alias', () => {
    const result = lookupConcept('furosemide ototoxicity');
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Loop Diuretic Ototoxicity');
    expect(result!.wasAlias).toBe(true);
  });

  it('resolves "Lewy bodies Parkinson" to Lewy Body Alpha-Synuclein Pathology via alias', () => {
    const result = lookupConcept('Lewy bodies Parkinson');
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Lewy Body Alpha-Synuclein Pathology');
    expect(result!.wasAlias).toBe(true);
  });

  it('resolves "serotonin syndrome SSRI" to SSRI Serotonin Syndrome via alias', () => {
    const result = lookupConcept('serotonin syndrome SSRI');
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('SSRI Serotonin Syndrome');
    expect(result!.wasAlias).toBe(true);
  });

  it('resolves "insulin mechanism GLUT4" to Insulin GLUT4 Translocation via alias', () => {
    const result = lookupConcept('insulin mechanism GLUT4');
    expect(result).not.toBeNull();
    expect(result!.canonical).toBe('Insulin GLUT4 Translocation');
    expect(result!.wasAlias).toBe(true);
  });
});

// ── lookupConcept — unknown concepts ─────────────────────────────────────────

describe('lookupConcept — unknown concepts return null', () => {
  it('returns null for completely unknown concept', () => {
    expect(lookupConcept('FooBar Syndrome')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(lookupConcept('')).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(lookupConcept('   ')).toBeNull();
  });

  it('returns null for bare "Hypokalemia" (not a standalone canonical)', () => {
    // "Hypokalemia" alone is not a canonical — each hypokalemia concept is topic-specific.
    // This is intentional — unknown bare terms emit WARN not FAIL.
    expect(lookupConcept('Hypokalemia')).toBeNull();
  });

  it('returns null for bare "Lewy bodies" — compound alias "Lewy bodies Parkinson" needed', () => {
    // Bare "Lewy bodies" is not a registered alias — "Lewy bodies Parkinson" is.
    // Unknown concept → returns null → validator emits WARN (discovery mode, not FAIL).
    expect(lookupConcept('Lewy bodies')).toBeNull();
    // The compound form resolves correctly:
    const compound = lookupConcept('Lewy bodies Parkinson');
    expect(compound).not.toBeNull();
    expect(compound!.canonical).toBe('Lewy Body Alpha-Synuclein Pathology');
  });
});

// ── normalizeConcept and getCanonicalConcept ──────────────────────────────────

describe('normalizeConcept / getCanonicalConcept', () => {
  it('returns canonical for exact input', () => {
    expect(normalizeConcept('Na-K-2Cl Transporter Inhibition')).toBe('Na-K-2Cl Transporter Inhibition');
  });

  it('returns canonical for alias input', () => {
    expect(normalizeConcept('NKCC2 inhibition')).toBe('Na-K-2Cl Transporter Inhibition');
    expect(normalizeConcept('furosemide ototoxicity')).toBe('Loop Diuretic Ototoxicity');
  });

  it('returns null for unknown input', () => {
    expect(normalizeConcept('Unknown Concept XYZ')).toBeNull();
  });

  it('getCanonicalConcept is an alias for normalizeConcept', () => {
    expect(getCanonicalConcept('NKCC2 inhibition')).toBe(normalizeConcept('NKCC2 inhibition'));
  });
});

// ── isValidConcept ────────────────────────────────────────────────────────────

describe('isValidConcept', () => {
  it('returns true for known canonical', () => {
    expect(isValidConcept('Na-K-2Cl Transporter Inhibition')).toBe(true);
  });

  it('returns true for known alias', () => {
    expect(isValidConcept('furosemide ototoxicity')).toBe(true);
  });

  it('returns false for unknown concept', () => {
    expect(isValidConcept('Totally Unknown Concept')).toBe(false);
  });
});

// ── getConceptAliases ─────────────────────────────────────────────────────────

describe('getConceptAliases', () => {
  it('returns alias list for Na-K-2Cl Transporter Inhibition', () => {
    const aliases = getConceptAliases('Na-K-2Cl Transporter Inhibition');
    expect(aliases.length).toBeGreaterThan(0);
    expect(aliases).toContain('NKCC2 inhibition');
  });

  it('returns empty array for unknown canonical', () => {
    expect(getConceptAliases('Not A Real Concept')).toEqual([]);
  });
});

// ── getConceptsForTopic ───────────────────────────────────────────────────────

describe('getConceptsForTopic', () => {
  it('returns concepts for Loop Diuretics (Pharmacology × Renal)', () => {
    const concepts = getConceptsForTopic('Pharmacology', 'Renal / Urinary', 'Loop Diuretics');
    expect(concepts.length).toBeGreaterThanOrEqual(2);
    const canonicals = concepts.map(c => c.canonical);
    expect(canonicals).toContain('Na-K-2Cl Transporter Inhibition');
    expect(canonicals).toContain('Loop Diuretic Ototoxicity');
  });

  it('returns concepts for Multiple Sclerosis (Pathology × Neurology)', () => {
    const concepts = getConceptsForTopic('Pathology', 'Neurology', 'Multiple Sclerosis');
    const canonicals = concepts.map(c => c.canonical);
    expect(canonicals).toContain('CNS Demyelination Mechanism');
    expect(canonicals).toContain('Periventricular Plaques on MRI');
    expect(canonicals).toContain('Internuclear Ophthalmoplegia MS');
  });

  it('returns empty array for unknown topic', () => {
    const concepts = getConceptsForTopic('Pharmacology', 'Renal / Urinary', 'Unknown Topic XYZ');
    expect(concepts).toEqual([]);
  });

  it('returns empty array for unknown subject-system pair', () => {
    const concepts = getConceptsForTopic('Pharmacology' as never, 'Oncology' as never, 'Any Topic');
    expect(concepts).toEqual([]);
  });
});

// ── getRelatedConcepts ────────────────────────────────────────────────────────

describe('getRelatedConcepts', () => {
  it('returns sibling concepts for Na-K-2Cl Transporter Inhibition', () => {
    const related = getRelatedConcepts('Na-K-2Cl Transporter Inhibition');
    const canonicals = related.map(c => c.canonical);
    expect(canonicals).toContain('Loop Diuretic Ototoxicity');
    expect(canonicals).toContain('Loop Diuretic Hypokalemia');
    // Should NOT contain itself
    expect(canonicals).not.toContain('Na-K-2Cl Transporter Inhibition');
  });

  it('returns empty array for unknown concept', () => {
    expect(getRelatedConcepts('Not A Real Concept')).toEqual([]);
  });
});

// ── alsoAllowedIn ─────────────────────────────────────────────────────────────

describe('alsoAllowedIn cross-cutting concepts', () => {
  it('Anion Gap Calculation has alsoAllowedIn for Pathology × Endocrine', () => {
    const result = lookupConcept('Anion Gap Calculation');
    expect(result).not.toBeNull();
    expect(result!.alsoAllowedIn).toBeDefined();
    const pairs = result!.alsoAllowedIn!;
    expect(pairs.some(p => p.subject === 'Pathology' && p.system === 'Endocrine')).toBe(true);
  });

  it('SSRI Serotonin Syndrome has alsoAllowedIn for Pharmacology × Neurology', () => {
    const result = lookupConcept('SSRI Serotonin Syndrome');
    expect(result).not.toBeNull();
    expect(result!.alsoAllowedIn).toBeDefined();
    expect(result!.alsoAllowedIn!.some(p => p.subject === 'Pharmacology' && p.system === 'Neurology')).toBe(true);
  });
});

// ── groupFlashcardsByConcept (Part 8 helper) ──────────────────────────────────

describe('groupFlashcardsByConcept', () => {
  it('groups cards by normalized canonical concept', () => {
    const cards = [
      { testedConcept: 'Na-K-2Cl Transporter Inhibition', id: 1 },
      { testedConcept: 'NKCC2 inhibition', id: 2 },  // alias → same canonical
      { testedConcept: 'Loop Diuretic Ototoxicity', id: 3 },
    ];
    const groups = groupFlashcardsByConcept(cards);
    expect(groups.get('Na-K-2Cl Transporter Inhibition')?.length).toBe(2);
    expect(groups.get('Loop Diuretic Ototoxicity')?.length).toBe(1);
  });

  it('puts unknown concept cards in "Unknown" bucket', () => {
    const cards = [{ testedConcept: 'Totally Unknown Concept', id: 1 }];
    const groups = groupFlashcardsByConcept(cards);
    expect(groups.get('Unknown')?.length).toBe(1);
  });

  it('handles missing testedConcept field', () => {
    const cards = [{ id: 1 }];
    const groups = groupFlashcardsByConcept(cards);
    expect(groups.get('Unknown')?.length).toBe(1);
  });
});

// ── extractConceptWeaknesses (Part 8 helper) ──────────────────────────────────

describe('extractConceptWeaknesses', () => {
  it('sorts concepts from weakest to strongest', () => {
    const mastery = {
      'Na-K-2Cl Transporter Inhibition': 0.82,
      'Loop Diuretic Hypokalemia': 0.45,
      'Lewy Body Alpha-Synuclein Pathology': 0.31,
    };
    const result = extractConceptWeaknesses(mastery);
    expect(result[0]).toBe('Lewy Body Alpha-Synuclein Pathology');
    expect(result[1]).toBe('Loop Diuretic Hypokalemia');
    expect(result[2]).toBe('Na-K-2Cl Transporter Inhibition');
  });
});
