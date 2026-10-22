import { describe, it, expect } from 'vitest';
import { collectExcludedQuestionIds, preferUnseenQuestions } from './preferUnseenQuestions.js';

describe('collectExcludedQuestionIds', () => {
  it('merges questionIds and baseQuestionIds', () => {
    const ids = collectExcludedQuestionIds({ questionIds: ['a', 'b'], baseQuestionIds: ['b', 'c'] });
    expect([...ids].sort()).toEqual(['a', 'b', 'c']);
  });

  it.each([undefined, null, 'x', 42, {}, { questionIds: 'nope' }, { questionIds: [1, null, ''] }])(
    'returns an empty set for malformed input %j',
    (value) => {
      expect(collectExcludedQuestionIds(value).size).toBe(0);
    },
  );
});

describe('preferUnseenQuestions', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

  it('puts unseen questions first and keeps relative order in both groups', () => {
    expect(preferUnseenQuestions(pool, new Set(['a', 'c'])).map((q) => q.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('never drops a seen question, so exhausting a scope still fills a session', () => {
    const all = preferUnseenQuestions(pool, new Set(['a', 'b', 'c', 'd']));
    expect(all.map((q) => q.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns the pool unchanged when nothing is seen', () => {
    expect(preferUnseenQuestions(pool, new Set())).toBe(pool);
  });
});
