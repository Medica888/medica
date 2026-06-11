import { describe, it, expect } from 'vitest';
import {
  lookupTopic,
  normalizeTopic,
  getTopicsForSubjectSystem,
  getRelatedTopics,
  isValidTopicForPair,
  getTotalTopicCount,
  getTaxonomyPairs,
  assertAllPairsInMatrix,
} from './medicaTopicTaxonomy.js';

// ── Integrity guards ─────────────────────────────────────────────────────────

describe('medicaTopicTaxonomy — integrity', () => {
  it('loads without collision errors at import time', () => {
    // If buildAliasLookup() threw, the module import would fail. Reaching here = safe.
    expect(getTotalTopicCount()).toBeGreaterThan(0);
  });

  it('contains approximately 100-150 topics', () => {
    const count = getTotalTopicCount();
    expect(count).toBeGreaterThanOrEqual(100);
    expect(count).toBeLessThanOrEqual(200);
  });

  it('all taxonomy pairs are allowed or warning in the USMLE matrix (none invalid)', () => {
    // assertAllPairsInMatrix throws on any 'invalid' pair — must not throw
    expect(() => assertAllPairsInMatrix()).not.toThrow();
  });

  it('all canonical names are unique across the entire taxonomy', () => {
    const pairs = getTaxonomyPairs();
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const { subject, system } of pairs) {
      for (const entry of getTopicsForSubjectSystem(subject, system)) {
        if (seen.has(entry.canonical)) {
          dupes.push(`${entry.canonical} (${subject} × ${system})`);
        }
        seen.add(entry.canonical);
      }
    }
    expect(dupes).toEqual([]);
  });
});

// ── Canonical lookups ────────────────────────────────────────────────────────

describe('lookupTopic — exact canonical', () => {
  it('finds ACE Inhibitors by exact canonical', () => {
    const r = lookupTopic('ACE Inhibitors');
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe('ACE Inhibitors');
    expect(r!.subject).toBe('Pharmacology');
    expect(r!.system).toBe('Cardiovascular');
    expect(r!.wasAlias).toBe(false);
  });

  it('normalizes case — "ACE inhibitors" (lowercase i) resolves as canonical', () => {
    const r = lookupTopic('ACE inhibitors');
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe('ACE Inhibitors');
    expect(r!.wasAlias).toBe(false);
  });

  it('finds Loop Diuretics', () => {
    const r = lookupTopic('Loop Diuretics');
    expect(r!.canonical).toBe('Loop Diuretics');
    expect(r!.subject).toBe('Pharmacology');
    expect(r!.system).toBe('Renal / Urinary');
  });

  it('finds Tuberculosis in Microbiology × Respiratory', () => {
    const r = lookupTopic('Tuberculosis');
    expect(r!.canonical).toBe('Tuberculosis');
    expect(r!.subject).toBe('Microbiology');
    expect(r!.system).toBe('Respiratory');
  });

  it('returns null for unknown topic', () => {
    expect(lookupTopic('NewTopicWeMissed')).toBeNull();
    expect(lookupTopic('')).toBeNull();
    expect(lookupTopic('   ')).toBeNull();
  });
});

describe('lookupTopic — alias matching', () => {
  it('resolves ACEI alias to ACE Inhibitors and marks wasAlias=true', () => {
    const r = lookupTopic('ACEI');
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe('ACE Inhibitors');
    expect(r!.wasAlias).toBe(true);
  });

  it('resolves "loop diuretic" (singular) alias — marks wasAlias=true', () => {
    const r = lookupTopic('loop diuretic');
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe('Loop Diuretics');
    expect(r!.wasAlias).toBe(true);
  });

  it('resolves TB to Tuberculosis — marks wasAlias=true', () => {
    const r = lookupTopic('TB');
    expect(r).not.toBeNull();
    expect(r!.canonical).toBe('Tuberculosis');
    expect(r!.wasAlias).toBe(true);
  });

  it('resolves MI to Myocardial Infarction', () => {
    const r = lookupTopic('MI');
    expect(r!.canonical).toBe('Myocardial Infarction');
    expect(r!.subject).toBe('Pathology');
    expect(r!.system).toBe('Cardiovascular');
  });
});

// ── normalizeTopic ───────────────────────────────────────────────────────────

describe('normalizeTopic', () => {
  it('returns canonical string for known topic', () => {
    expect(normalizeTopic('beta blockers')).toBe('Beta Blockers');
  });

  it('returns null for unknown topic — does not create new canonicals', () => {
    expect(normalizeTopic('FutureTopicNotYetAdded')).toBeNull();
  });
});

// ── isValidTopicForPair ──────────────────────────────────────────────────────

describe('isValidTopicForPair', () => {
  it('returns true when topic matches the pair', () => {
    expect(isValidTopicForPair('ACE Inhibitors', 'Pharmacology', 'Cardiovascular')).toBe(true);
  });

  it('returns true via alias when pair matches', () => {
    expect(isValidTopicForPair('ACEI', 'Pharmacology', 'Cardiovascular')).toBe(true);
  });

  it('returns false when topic exists but pair differs', () => {
    expect(isValidTopicForPair('Tuberculosis', 'Pharmacology', 'Renal / Urinary')).toBe(false);
  });

  it('returns false for unknown topic', () => {
    expect(isValidTopicForPair('UnknownTopic', 'Pharmacology', 'Cardiovascular')).toBe(false);
  });
});

// ── getTopicsForSubjectSystem ────────────────────────────────────────────────

describe('getTopicsForSubjectSystem', () => {
  it('returns topic list for a populated pair', () => {
    const topics = getTopicsForSubjectSystem('Pharmacology', 'Cardiovascular');
    expect(topics.length).toBeGreaterThan(0);
    expect(topics.some(t => t.canonical === 'ACE Inhibitors')).toBe(true);
  });

  it('returns empty array for a pair not in taxonomy', () => {
    const topics = getTopicsForSubjectSystem('Biostatistics', 'Multisystem');
    expect(topics).toEqual([]);
  });
});

// ── getRelatedTopics ─────────────────────────────────────────────────────────

describe('getRelatedTopics', () => {
  it('returns other topics in the same pair, excluding self', () => {
    const related = getRelatedTopics('ACE Inhibitors');
    expect(related.length).toBeGreaterThan(0);
    expect(related.every(t => t.canonical !== 'ACE Inhibitors')).toBe(true);
    // All related topics should be in Pharmacology × Cardiovascular
    const pairsForRelated = related.map(t => {
      const r = lookupTopic(t.canonical);
      return r ? `${r.subject}×${r.system}` : null;
    });
    expect(pairsForRelated.every(p => p === 'Pharmacology×Cardiovascular')).toBe(true);
  });

  it('returns empty for unknown topic', () => {
    expect(getRelatedTopics('NonExistentTopic')).toEqual([]);
  });
});
