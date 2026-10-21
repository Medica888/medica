import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { isCommerciallyContentReady } from '../lib/reviewedContentMetadata.js';

interface SeedQuestion {
  id: string;
  difficulty: string;
  correct: string;
  options: { letter: string; text: string }[];
  optionExplanations?: Record<string, string>;
  reviewMetadata?: unknown;
}

const questions: SeedQuestion[] = JSON.parse(
  readFileSync(join(__dirname, 'seed-data', 'authoredQuestions.json'), 'utf-8'),
);

const isReviewed = (q: SeedQuestion) => isCommerciallyContentReady({
  bankStatus: 'approved',
  difficulty: q.difficulty,
  reviewMetadata: q.reviewMetadata,
  source: 'authored',
  body: q as unknown as Record<string, unknown>,
});

// qX* ids are the AI-authored expansion batch; they ship unreviewed.
const expansion = questions.filter((q) => q.id.startsWith('qX'));
const original = questions.filter((q) => !q.id.startsWith('qX'));

describe('authoredQuestions.json seed data', () => {
  it('has unique ids', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length);
  });

  it('keeps every original question student-visible (regression guard for the empty-catalog bug)', () => {
    expect(original.length).toBeGreaterThan(0);
    expect(original.filter((q) => !isReviewed(q)).map((q) => q.id)).toEqual([]);
  });

  it('keeps AI-authored expansion questions out of the student catalog until reviewed', () => {
    expect(expansion.length).toBeGreaterThan(0);
    expect(expansion.filter(isReviewed).map((q) => q.id)).toEqual([]);
  });

  it('gives every question four lettered options, a valid answer, and per-option explanations', () => {
    const problems = questions.filter((q) => {
      const letters = q.options.map((o) => o.letter);
      return letters.join('') !== 'ABCD'
        || !letters.includes(q.correct)
        || !q.optionExplanations
        || letters.some((l) => !String(q.optionExplanations?.[l] ?? '').trim());
    }).filter((q) => expansion.includes(q));
    expect(problems.map((q) => q.id)).toEqual([]);
  });

  it('does not bias the correct answer toward one letter in the expansion batch', () => {
    const counts = new Map<string, number>();
    for (const q of expansion) counts.set(q.correct, (counts.get(q.correct) ?? 0) + 1);
    for (const letter of ['A', 'B', 'C', 'D']) {
      const share = (counts.get(letter) ?? 0) / expansion.length;
      expect(share, `letter ${letter} share`).toBeGreaterThan(0.2);
      expect(share, `letter ${letter} share`).toBeLessThan(0.3);
    }
  });
});
