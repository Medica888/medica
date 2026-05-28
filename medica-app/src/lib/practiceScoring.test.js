import { describe, it, expect } from 'vitest';
import { calculatePracticeResults } from './practiceScoring.js';

const makeQuestion = (id, correctAnswer, subject = 'Physiology', system = 'Cardiovascular', difficulty = 'Balanced') => ({
  id,
  correctAnswer,
  subject,
  system,
  difficulty,
});

describe('calculatePracticeResults', () => {
  it('calculates correct percentage for all-correct session', () => {
    const session = {
      questions: [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')],
      answers: { q1: 'A', q2: 'B' },
    };
    const result = calculatePracticeResults(session);
    expect(result.correct).toBe(2);
    expect(result.wrong).toBe(0);
    expect(result.percentage).toBe(100);
  });

  it('calculates correct percentage for partial session', () => {
    const session = {
      questions: [makeQuestion('q1', 'A'), makeQuestion('q2', 'B'), makeQuestion('q3', 'C'), makeQuestion('q4', 'D')],
      answers: { q1: 'A', q2: 'X', q3: 'C', q4: 'X' },
    };
    const result = calculatePracticeResults(session);
    expect(result.correct).toBe(2);
    expect(result.percentage).toBe(50);
  });

  it('computes subject breakdown', () => {
    const session = {
      questions: [
        makeQuestion('q1', 'A', 'Pathology'),
        makeQuestion('q2', 'B', 'Pathology'),
        makeQuestion('q3', 'C', 'Physiology'),
      ],
      answers: { q1: 'A', q2: 'X', q3: 'C' },
    };
    const result = calculatePracticeResults(session);
    const patho = result.subjectBreakdown.find((s) => s.name === 'Pathology');
    expect(patho).toBeDefined();
    expect(patho.total).toBe(2);
    expect(patho.correct).toBe(1);
    expect(patho.percentage).toBe(50);
  });

  it('assigns readiness labels correctly', () => {
    const make100 = {
      questions: [makeQuestion('q1', 'A')],
      answers: { q1: 'A' },
    };
    const result = calculatePracticeResults(make100);
    expect(result.readinessLabel).toBe('Strong');
  });

  it('returns empty weakAreas when all are above 60%', () => {
    const session = {
      questions: [makeQuestion('q1', 'A'), makeQuestion('q2', 'A')],
      answers: { q1: 'A', q2: 'A' },
    };
    const result = calculatePracticeResults(session);
    expect(result.weakAreas).toHaveLength(0);
  });

  it('identifies weak areas below 60% with 2+ questions', () => {
    const session = {
      questions: [
        makeQuestion('q1', 'A', 'Pathology'),
        makeQuestion('q2', 'A', 'Pathology'),
        makeQuestion('q3', 'A', 'Pathology'),
      ],
      answers: { q1: 'X', q2: 'X', q3: 'X' },
    };
    const result = calculatePracticeResults(session);
    expect(result.weakAreas.some((w) => w.name === 'Pathology')).toBe(true);
  });

  it('handles empty session', () => {
    const result = calculatePracticeResults({ questions: [], answers: {} });
    expect(result.total).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.medicaScore).toBe(0);
  });

  it('computes medicaScore within 0–100', () => {
    const session = {
      questions: Array.from({ length: 5 }, (_, i) => makeQuestion(`q${i}`, 'A')),
      answers: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`q${i}`, 'A'])),
    };
    const result = calculatePracticeResults(session);
    expect(result.medicaScore).toBeGreaterThanOrEqual(0);
    expect(result.medicaScore).toBeLessThanOrEqual(100);
  });

  it('lists missed questions', () => {
    const session = {
      questions: [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')],
      answers: { q1: 'A', q2: 'X' },
    };
    const result = calculatePracticeResults(session);
    expect(result.missedQuestions).toHaveLength(1);
  });
});
