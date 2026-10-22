import { describe, it, expect } from 'vitest';
import { selectAdaptiveFromBank } from './adaptiveBankSelection.js';

const q = (id: string, testedConcept: string, extra: Record<string, string> = {}) => ({ id, testedConcept, ...extra });

describe('selectAdaptiveFromBank', () => {
  const pool = [
    q('a', 'Filler Alpha'),
    q('b', 'Filler Beta'),
    q('c', 'Loop Diuretic Ototoxicity'),
    q('d', 'Filler Delta'),
    q('e', 'ACE Inhibitor Cough'),
    q('f', 'Filler Phi'),
  ];

  it('selects questions matching target concepts, one per concept, keeping pool order', () => {
    const { questions, matchedConcepts } = selectAdaptiveFromBank(
      pool,
      { targetConcepts: ['ACE Inhibitor Cough', 'Loop Diuretic Ototoxicity'] },
      2,
    );

    expect(questions.map((x) => x.id)).toEqual(['c', 'e']);
    expect(matchedConcepts).toEqual(['ACE Inhibitor Cough', 'Loop Diuretic Ototoxicity']);
  });

  it('tops up from the rest of the pool in order when targets are fewer than the count', () => {
    const { questions } = selectAdaptiveFromBank(pool, { targetConcepts: ['ACE Inhibitor Cough'] }, 3);

    expect(questions.map((x) => x.id)).toEqual(['a', 'b', 'e']);
  });

  it('never returns more than the requested count even with more matching targets', () => {
    const { questions } = selectAdaptiveFromBank(
      pool,
      { targetConcepts: ['ACE Inhibitor Cough', 'Loop Diuretic Ototoxicity', 'Filler Alpha'] },
      2,
    );

    expect(questions).toHaveLength(2);
    expect(questions.map((x) => x.id)).toEqual(['c', 'e']);
  });

  it('uses only one question per target concept', () => {
    const dupes = [q('x1', 'Same Concept'), q('x3', 'Other One'), q('x2', 'Same Concept')];
    const { questions, matchedConcepts } = selectAdaptiveFromBank(dupes, { targetConcepts: ['Same Concept'] }, 2);

    expect(matchedConcepts).toEqual(['Same Concept']);
    expect(questions.map((x) => x.id)).toEqual(['x1', 'x3']);
  });

  it('matches through weakSpotCategory and topic metadata, preferring the testedConcept match', () => {
    const items = [
      q('t1', 'Unrelated', { weakSpotCategory: 'Diuretic Adverse Effects' }),
      q('t2', 'Diuretic Adverse Effects'),
    ];
    const { questions } = selectAdaptiveFromBank(items, { targetConcepts: ['Diuretic Adverse Effects'] }, 1);

    expect(questions.map((x) => x.id)).toEqual(['t2']);
  });

  it('returns the first questions in pool order and no matches when there are no targets', () => {
    const { questions, matchedConcepts } = selectAdaptiveFromBank(pool, { targetConcepts: [] }, 3);

    expect(questions.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(matchedConcepts).toEqual([]);
  });

  it('ignores target concepts that match nothing in the pool', () => {
    const { questions, matchedConcepts } = selectAdaptiveFromBank(pool, { targetConcepts: ['Not In Pool'] }, 2);

    expect(questions).toHaveLength(2);
    expect(matchedConcepts).toEqual([]);
  });
});
