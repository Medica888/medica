import { describe, expect, it } from 'vitest';
import {
  allowedDifficulties,
  allowedSubjects,
  allowedSystems,
  isKnownDifficulty,
  isKnownSubject,
  isKnownSystem,
  normalizeDifficulty,
  normalizeSubject,
  normalizeSystem,
} from './medicaTaxonomy.js';

describe('medicaTaxonomy', () => {
  it('normalizes all canonical subjects to themselves', () => {
    for (const subject of allowedSubjects) {
      expect(normalizeSubject(subject)).toBe(subject);
      expect(isKnownSubject(subject)).toBe(true);
    }
  });

  it('normalizes all canonical systems to themselves', () => {
    for (const system of allowedSystems) {
      expect(normalizeSystem(system)).toBe(system);
      expect(isKnownSystem(system)).toBe(true);
    }
  });

  it('normalizes all canonical difficulties to themselves', () => {
    for (const difficulty of allowedDifficulties) {
      expect(normalizeDifficulty(difficulty)).toBe(difficulty);
      expect(isKnownDifficulty(difficulty)).toBe(true);
    }
  });

  it('normalizes Cardiology to system Cardiovascular, not a subject', () => {
    expect(normalizeSystem('Cardiology')).toBe('Cardiovascular');
    expect(normalizeSubject('Cardiology')).toBeNull();
    expect(isKnownSubject('Cardiology')).toBe(false);
  });

  it('normalizes Skin to Dermatology', () => {
    expect(normalizeSystem('Skin')).toBe('Dermatology');
    expect(normalizeSystem('skin')).toBe('Dermatology');
    expect(normalizeSystem('Skin Subcutaneous Tissue')).toBe('Dermatology');
  });

  it('normalizes Nephrology to Renal / Urinary', () => {
    expect(normalizeSystem('Nephrology')).toBe('Renal / Urinary');
    expect(normalizeSubject('Nephrology')).toBeNull();
  });

  it('keeps previous harmless validator wording variants in the shared taxonomy', () => {
    expect(normalizeSubject('Disease Mechanism')).toBe('Pathology');
    expect(normalizeSubject('Biostatistics Epidemiology Population Health')).toBe('Biostatistics');
    expect(normalizeSystem('Blood Lymphoreticular System')).toBe('Hematology');
    expect(normalizeSystem('Nervous System Special Senses')).toBe('Neurology');
  });

  it('normalizes Neuroscience to system Neurology, not a subject', () => {
    expect(normalizeSystem('Neuroscience')).toBe('Neurology');
    expect(normalizeSubject('Neuroscience')).toBeNull();
  });

  it('handles Behavioral Health by field context', () => {
    expect(normalizeSubject('Behavioral Health')).toBe('Behavioral Science');
    expect(normalizeSystem('Behavioral Health')).toBe('Psychiatry');
  });

  it('returns null for unknown subject, system, and difficulty labels', () => {
    expect(normalizeSubject('Space Medicine')).toBeNull();
    expect(normalizeSystem('Space Medicine')).toBeNull();
    expect(normalizeDifficulty('standardized')).toBeNull();
  });
});
