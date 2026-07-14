import { describe, it, expect } from 'vitest';
import {
  selectStep1BlueprintBlock,
  InsufficientBlueprintCoverageError,
  STEP1_STANDARD_BLOCK_BLUEPRINT,
  STEP1_BLUEPRINT_TARGET_COUNT,
} from './step1BlueprintSelection.js';

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: `q-${Math.random().toString(36).slice(2)}`,
    testedConcept: `concept-${Math.random().toString(36).slice(2)}`,
    topic: `topic-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

function buildFullPool(): Record<string, unknown>[] {
  const pool: Record<string, unknown>[] = [];
  let counter = 0;
  for (const group of STEP1_STANDARD_BLOCK_BLUEPRINT) {
    for (const area of group.areas) {
      // 3 unique candidates per area — comfortably above any single group's quota.
      for (let i = 0; i < 3; i++) {
        counter += 1;
        pool.push(makeQuestion({
          id: `bp-${counter}`,
          usmleContentArea: area,
          testedConcept: `concept-${counter}`,
          topic: `topic-${counter}`,
        }));
      }
    }
  }
  return pool;
}

describe('selectStep1BlueprintBlock', () => {
  it('selects exactly targetCount questions with each group filled to its quota', () => {
    const pool = buildFullPool();
    const selected = selectStep1BlueprintBlock(pool, STEP1_BLUEPRINT_TARGET_COUNT);

    expect(selected).toHaveLength(STEP1_BLUEPRINT_TARGET_COUNT);

    for (const group of STEP1_STANDARD_BLOCK_BLUEPRINT) {
      const matched = selected.filter(q => group.areas.includes(q.usmleContentArea as string));
      expect(matched).toHaveLength(group.count);
    }
  });

  it('never selects the same testedConcept or topic twice', () => {
    const pool = buildFullPool();
    const selected = selectStep1BlueprintBlock(pool, STEP1_BLUEPRINT_TARGET_COUNT);

    const concepts = selected.map(q => q.testedConcept);
    const topics = selected.map(q => q.topic);
    expect(new Set(concepts).size).toBe(concepts.length);
    expect(new Set(topics).size).toBe(topics.length);
  });

  it('never selects the same question id twice', () => {
    const pool = buildFullPool();
    const selected = selectStep1BlueprintBlock(pool, STEP1_BLUEPRINT_TARGET_COUNT);
    const ids = selected.map(q => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('backfills an empty group from the remainder pool rather than failing, as long as total count is reachable', () => {
    // No Social Sciences / Human Development / Biostatistics candidates at all —
    // every other group is well-stocked. Quotas are best-effort: the remainder
    // pass should still reach the full target count from whatever is available.
    const pool = buildFullPool().filter(q => !['human-development', 'social-sciences', 'biostatistics-epidemiology'].some(
      groupId => STEP1_STANDARD_BLOCK_BLUEPRINT.find(g => g.id === groupId)!.areas.includes(q.usmleContentArea as string),
    ));

    const selected = selectStep1BlueprintBlock(pool, STEP1_BLUEPRINT_TARGET_COUNT);
    expect(selected).toHaveLength(STEP1_BLUEPRINT_TARGET_COUNT);
  });

  it('throws InsufficientBlueprintCoverageError when the pool has too few unique candidates to reach targetCount', () => {
    // Only 5 unique (concept, topic) candidates exist in total — far short of 20,
    // even though the raw array below is padded with duplicates of the same ids.
    const pool = Array.from({ length: 5 }, (_, i) => makeQuestion({
      id: `only-${i}`,
      usmleContentArea: 'Cardiovascular System',
      testedConcept: `concept-${i}`,
      topic: `topic-${i}`,
    }));

    expect(() => selectStep1BlueprintBlock(pool, STEP1_BLUEPRINT_TARGET_COUNT)).toThrow(InsufficientBlueprintCoverageError);
  });

  it('caps selection at the number of unique concepts even when raw row count is large', () => {
    // 100 rows, but only 2 distinct testedConcept/topic combinations — dedup
    // should cap real selection at 2, regardless of how many raw rows exist.
    const pool = Array.from({ length: 100 }, (_, i) => makeQuestion({
      id: `dup-${i}`,
      usmleContentArea: 'Cardiovascular System',
      testedConcept: `concept-${i % 2}`,
      topic: `topic-${i % 2}`,
    }));

    expect(() => selectStep1BlueprintBlock(pool, STEP1_BLUEPRINT_TARGET_COUNT)).toThrow(InsufficientBlueprintCoverageError);
  });

  it('falls back to a plain shuffled slice for a non-20 target count', () => {
    const pool = buildFullPool();
    const selected = selectStep1BlueprintBlock(pool, 5);
    expect(selected).toHaveLength(5);
    const ids = selected.map(q => q.id);
    expect(new Set(ids).size).toBe(5);
  });

  it('throws for a non-20 target count when the pool is smaller than requested', () => {
    const pool = Array.from({ length: 3 }, (_, i) => makeQuestion({ id: `small-${i}` }));
    expect(() => selectStep1BlueprintBlock(pool, 5)).toThrow(InsufficientBlueprintCoverageError);
  });
});
