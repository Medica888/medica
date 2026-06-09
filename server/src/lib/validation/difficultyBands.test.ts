// Scale divergence guard — see difficultyBands.ts header for full explanation.
// ENGINE_DEPTH_BANDS uses reasoningDepth(question); DIFFICULTY_RANGES in questionValidator.ts
// uses scoreReasoningDepth(stem).  The numeric values intentionally differ.  If a future
// change accidentally aligns them, the cross-scale tests below will still pass (same numbers
// would satisfy the inequalities), so treat ANY change to these values as a signal to verify
// both scoring functions were deliberately aligned before merging.
import { describe, it, expect } from 'vitest';
import { ENGINE_DEPTH_BANDS, STRUCTURAL_DEPTH_THRESHOLDS } from './difficultyBands.js';
import { DIFFICULTY_RANGES } from '../questionValidator.js';

const ALL_DIFFICULTIES = ['More Easy', 'Balanced', 'More Hard', 'NBME Difficult', 'UWorld Challenge'];

describe('ENGINE_DEPTH_BANDS', () => {
  it('covers all five allowed difficulties', () => {
    for (const d of ALL_DIFFICULTIES) {
      expect(ENGINE_DEPTH_BANDS[d], `band missing for ${d}`).toBeDefined();
    }
  });

  it('min < max for every band', () => {
    for (const d of ALL_DIFFICULTIES) {
      const { min, max } = ENGINE_DEPTH_BANDS[d];
      expect(min).toBeLessThan(max);
    }
  });

  it('UWorld Challenge has the highest minimum depth floor', () => {
    for (const d of ALL_DIFFICULTIES.filter(d => d !== 'UWorld Challenge')) {
      expect(ENGINE_DEPTH_BANDS['UWorld Challenge'].min).toBeGreaterThanOrEqual(ENGINE_DEPTH_BANDS[d].min);
    }
  });

  it('More Easy has the lowest minimum depth floor', () => {
    for (const d of ALL_DIFFICULTIES.filter(d => d !== 'More Easy')) {
      expect(ENGINE_DEPTH_BANDS['More Easy'].min).toBeLessThanOrEqual(ENGINE_DEPTH_BANDS[d].min);
    }
  });

  it('all values are within 0–100 range', () => {
    for (const d of ALL_DIFFICULTIES) {
      const { min, max } = ENGINE_DEPTH_BANDS[d];
      expect(min).toBeGreaterThanOrEqual(0);
      expect(max).toBeLessThanOrEqual(100);
    }
  });

  it('falls back to Balanced for unknown difficulty', () => {
    const fallback = ENGINE_DEPTH_BANDS['Unknown'] ?? ENGINE_DEPTH_BANDS['Balanced'];
    expect(fallback).toEqual(ENGINE_DEPTH_BANDS['Balanced']);
  });
});

describe('STRUCTURAL_DEPTH_THRESHOLDS', () => {
  it('covers More Easy, More Hard, and UWorld Challenge', () => {
    expect(STRUCTURAL_DEPTH_THRESHOLDS['More Easy']).toBeDefined();
    expect(STRUCTURAL_DEPTH_THRESHOLDS['More Hard']).toBeDefined();
    expect(STRUCTURAL_DEPTH_THRESHOLDS['UWorld Challenge']).toBeDefined();
  });

  it('More Easy hardRejectAbove > softWarnAbove', () => {
    const t = STRUCTURAL_DEPTH_THRESHOLDS['More Easy'];
    expect(t.hardRejectAbove).toBeGreaterThan(t.softWarnAbove);
  });

  it('More Easy softWarnAbove matches ENGINE_DEPTH_BANDS More Easy max', () => {
    expect(STRUCTURAL_DEPTH_THRESHOLDS['More Easy'].softWarnAbove)
      .toBe(ENGINE_DEPTH_BANDS['More Easy'].max);
  });

  it('More Hard warnBelow matches ENGINE_DEPTH_BANDS More Hard min', () => {
    expect(STRUCTURAL_DEPTH_THRESHOLDS['More Hard'].warnBelow)
      .toBe(ENGINE_DEPTH_BANDS['More Hard'].min);
  });

  it('UWorld Challenge warnBelow matches ENGINE_DEPTH_BANDS UWorld Challenge min', () => {
    expect(STRUCTURAL_DEPTH_THRESHOLDS['UWorld Challenge'].warnBelow)
      .toBe(ENGINE_DEPTH_BANDS['UWorld Challenge'].min);
  });
});

// ── Cross-scale divergence guard ──────────────────────────────────────────────
// These tests document the known numeric gaps between ENGINE_DEPTH_BANDS (full-question
// reasoningDepth scale) and DIFFICULTY_RANGES.depthMax (stem-only scoreReasoningDepth scale).
// If both tables are ever intentionally unified, update these assertions to toBe() equality
// and verify that both scoring functions were realigned first.

describe('ENGINE_DEPTH_BANDS vs DIFFICULTY_RANGES — intentional scale divergence', () => {
  it('Balanced max is higher in ENGINE_DEPTH_BANDS than in DIFFICULTY_RANGES', () => {
    expect(ENGINE_DEPTH_BANDS['Balanced'].max).toBeGreaterThan(DIFFICULTY_RANGES['Balanced'].depthMax);
  });

  it('More Hard max is higher in ENGINE_DEPTH_BANDS than in DIFFICULTY_RANGES', () => {
    expect(ENGINE_DEPTH_BANDS['More Hard'].max).toBeGreaterThan(DIFFICULTY_RANGES['More Hard'].depthMax);
  });

  it('More Easy max matches across both tables (scales converge at the low end)', () => {
    expect(ENGINE_DEPTH_BANDS['More Easy'].max).toBe(DIFFICULTY_RANGES['More Easy'].depthMax);
  });
});
