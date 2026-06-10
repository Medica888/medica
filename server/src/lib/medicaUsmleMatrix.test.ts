/**
 * USMLE Subject × System Matrix Tests
 *
 * 1. Integrity — every pair classified exactly once, no gaps, no duplicates.
 * 2. Tier correctness — getPairStatus returns the expected tier for known pairs.
 * 3. Edge cases — null inputs, boundary subjects/systems.
 */

import { describe, it, expect } from 'vitest';
import {
  allowedPairs,
  warningPairs,
  invalidPairs,
  getPairStatus,
} from './medicaUsmleMatrix.js';
import { allowedSubjects, allowedSystems } from './medicaTaxonomy.js';

// ── Precomputed sets for cross-tier uniqueness checks ─────────────────────────
const allPairs = [...allowedPairs, ...warningPairs, ...invalidPairs];
const allKeys  = allPairs.map(([s, sys]) => `${s}|${sys}`);

const allowedKeys = new Set(allowedPairs.map(([s, sys]) => `${s}|${sys}`));
const warningKeys = new Set(warningPairs.map(([s, sys]) => `${s}|${sys}`));
const invalidKeys = new Set(invalidPairs.map(([s, sys]) => `${s}|${sys}`));

// ── 1. Integrity ──────────────────────────────────────────────────────────────

describe('medicaUsmleMatrix — integrity', () => {
  it('has exactly 165 pairs (11 subjects × 15 systems)', () => {
    const expected = allowedSubjects.length * allowedSystems.length;
    expect(expected).toBe(165);
    expect(allPairs.length).toBe(expected);
  });

  it('has no duplicate pairs within any single tier', () => {
    const allowedArr = allowedPairs.map(([s, sys]) => `${s}|${sys}`);
    const warningArr = warningPairs.map(([s, sys]) => `${s}|${sys}`);
    const invalidArr = invalidPairs.map(([s, sys]) => `${s}|${sys}`);

    expect(new Set(allowedArr).size).toBe(allowedArr.length);
    expect(new Set(warningArr).size).toBe(warningArr.length);
    expect(new Set(invalidArr).size).toBe(invalidArr.length);
  });

  it('has no pair appearing in more than one tier', () => {
    for (const k of allowedKeys) {
      expect(warningKeys.has(k), `"${k}" appears in both allowed and warning`).toBe(false);
      expect(invalidKeys.has(k), `"${k}" appears in both allowed and invalid`).toBe(false);
    }
    for (const k of warningKeys) {
      expect(invalidKeys.has(k), `"${k}" appears in both warning and invalid`).toBe(false);
    }
  });

  it('covers every allowedSubject × allowedSystem combination', () => {
    for (const subject of allowedSubjects) {
      for (const system of allowedSystems) {
        const key = `${subject}|${system}`;
        expect(allKeys, `Missing pair: ${key}`).toContain(key);
      }
    }
  });

  it('contains no pairs with unrecognised subject or system labels', () => {
    const subjectSet = new Set<string>(allowedSubjects);
    const systemSet  = new Set<string>(allowedSystems);
    for (const [subject, system] of allPairs) {
      expect(subjectSet.has(subject), `Unknown subject: ${subject}`).toBe(true);
      expect(systemSet.has(system),  `Unknown system: ${system}`).toBe(true);
    }
  });
});

// ── 2. getPairStatus — tier correctness ───────────────────────────────────────

describe('getPairStatus — allowed pairs', () => {
  const coreAllowed: Array<[string, string]> = [
    // High-volume USMLE pairs
    ['Pharmacology',    'Cardiovascular'],
    ['Pharmacology',    'Neurology'],
    ['Pharmacology',    'Renal / Urinary'],
    ['Pharmacology',    'Oncology'],
    ['Pharmacology',    'Infectious Disease'],
    ['Pharmacology',    'Psychiatry'],
    ['Pathology',       'Cardiovascular'],
    ['Pathology',       'Renal / Urinary'],
    ['Pathology',       'Neurology'],
    ['Pathology',       'Hematology'],
    ['Physiology',      'Cardiovascular'],
    ['Physiology',      'Renal / Urinary'],
    ['Physiology',      'Neurology'],
    ['Microbiology',    'Respiratory'],
    ['Microbiology',    'Gastrointestinal'],
    ['Microbiology',    'Neurology'],
    ['Microbiology',    'Renal / Urinary'],
    ['Genetics',        'Hematology'],
    ['Genetics',        'Respiratory'],
    ['Genetics',        'Multisystem'],
    ['Biochemistry',    'Multisystem'],
    ['Biochemistry',    'Hematology'],
    ['Biochemistry',    'Neurology'],
    ['Immunology',      'Multisystem'],
    ['Immunology',      'Renal / Urinary'],
    ['Behavioral Science', 'Psychiatry'],
    ['Biostatistics',   'Multisystem'],
    ['Ethics',          'Multisystem'],
  ];

  for (const [subject, system] of coreAllowed) {
    it(`${subject} + ${system} → allowed`, () => {
      expect(getPairStatus(subject as never, system as never)).toBe('allowed');
    });
  }
});

describe('getPairStatus — warning pairs', () => {
  const expectedWarnings: Array<[string, string]> = [
    ['Biochemistry',    'Cardiovascular'],
    ['Biochemistry',    'Musculoskeletal'],
    ['Biochemistry',    'Respiratory'],
    ['Biochemistry',    'Reproductive'],
    ['Biochemistry',    'Oncology'],
    ['Biochemistry',    'Psychiatry'],
    ['Biochemistry',    'Dermatology'],
    ['Genetics',        'Cardiovascular'],
    ['Genetics',        'Endocrine'],
    ['Genetics',        'Renal / Urinary'],
    ['Genetics',        'Musculoskeletal'],
    ['Genetics',        'Gastrointestinal'],
    ['Genetics',        'Dermatology'],
    ['Genetics',        'Immunology'],
    ['Genetics',        'Infectious Disease'],
    ['Genetics',        'Psychiatry'],
    ['Anatomy',         'Psychiatry'],
    ['Anatomy',         'Oncology'],
    ['Anatomy',         'Infectious Disease'],
    ['Physiology',      'Psychiatry'],
    ['Physiology',      'Dermatology'],
    ['Physiology',      'Oncology'],
    ['Physiology',      'Infectious Disease'],
    ['Pathology',       'Psychiatry'],
    ['Microbiology',    'Endocrine'],
    ['Microbiology',    'Oncology'],
    ['Microbiology',    'Immunology'],
    ['Immunology',      'Cardiovascular'],
    ['Immunology',      'Dermatology'],
    ['Immunology',      'Oncology'],
    ['Immunology',      'Reproductive'],
    ['Immunology',      'Infectious Disease'],
    ['Behavioral Science', 'Neurology'],
    ['Behavioral Science', 'Reproductive'],
    ['Behavioral Science', 'Multisystem'],
  ];

  for (const [subject, system] of expectedWarnings) {
    it(`${subject} + ${system} → warning`, () => {
      expect(getPairStatus(subject as never, system as never)).toBe('warning');
    });
  }
});

describe('getPairStatus — invalid pairs', () => {
  const expectedInvalid: Array<[string, string]> = [
    ['Microbiology',    'Psychiatry'],
    ['Immunology',      'Psychiatry'],
    // Behavioral Science
    ['Behavioral Science', 'Cardiovascular'],
    ['Behavioral Science', 'Respiratory'],
    ['Behavioral Science', 'Renal / Urinary'],
    ['Behavioral Science', 'Gastrointestinal'],
    ['Behavioral Science', 'Endocrine'],
    ['Behavioral Science', 'Musculoskeletal'],
    ['Behavioral Science', 'Dermatology'],
    ['Behavioral Science', 'Hematology'],
    ['Behavioral Science', 'Oncology'],
    ['Behavioral Science', 'Immunology'],
    ['Behavioral Science', 'Infectious Disease'],
    // Biostatistics
    ['Biostatistics',   'Cardiovascular'],
    ['Biostatistics',   'Respiratory'],
    ['Biostatistics',   'Renal / Urinary'],
    ['Biostatistics',   'Gastrointestinal'],
    ['Biostatistics',   'Endocrine'],
    ['Biostatistics',   'Reproductive'],
    ['Biostatistics',   'Neurology'],
    ['Biostatistics',   'Psychiatry'],
    ['Biostatistics',   'Musculoskeletal'],
    ['Biostatistics',   'Dermatology'],
    ['Biostatistics',   'Hematology'],
    ['Biostatistics',   'Oncology'],
    ['Biostatistics',   'Immunology'],
    ['Biostatistics',   'Infectious Disease'],
    // Ethics
    ['Ethics',          'Cardiovascular'],
    ['Ethics',          'Respiratory'],
    ['Ethics',          'Renal / Urinary'],
    ['Ethics',          'Gastrointestinal'],
    ['Ethics',          'Endocrine'],
    ['Ethics',          'Reproductive'],
    ['Ethics',          'Neurology'],
    ['Ethics',          'Psychiatry'],
    ['Ethics',          'Musculoskeletal'],
    ['Ethics',          'Dermatology'],
    ['Ethics',          'Hematology'],
    ['Ethics',          'Oncology'],
    ['Ethics',          'Immunology'],
    ['Ethics',          'Infectious Disease'],
  ];

  for (const [subject, system] of expectedInvalid) {
    it(`${subject} + ${system} → invalid`, () => {
      expect(getPairStatus(subject as never, system as never)).toBe('invalid');
    });
  }
});

// ── 3. Edge cases ─────────────────────────────────────────────────────────────

describe('getPairStatus — edge cases', () => {
  it('returns unknown when subject is null', () => {
    expect(getPairStatus(null, 'Cardiovascular')).toBe('unknown');
  });

  it('returns unknown when system is null', () => {
    expect(getPairStatus('Pharmacology', null)).toBe('unknown');
  });

  it('returns unknown when both are null', () => {
    expect(getPairStatus(null, null)).toBe('unknown');
  });
});
