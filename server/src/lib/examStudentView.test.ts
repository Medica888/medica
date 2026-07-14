import { describe, it, expect } from 'vitest';
import { shuffleQuestionForExam, toStudentExamQuestion, getGeneratedQuestionCorrectLetter } from './examStudentView.js';

function makeQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q-fp-1',
    stem: 'A 45-year-old man presents with chest pain.',
    options: [
      { letter: 'A', text: 'Aortic dissection' },
      { letter: 'B', text: 'Acute inferior MI' },
      { letter: 'C', text: 'Pulmonary embolism' },
      { letter: 'D', text: 'Pericarditis' },
    ],
    correct: 'B',
    explanation: 'ST elevations in II, III, aVF indicate inferior MI.',
    optionExplanations: { A: 'Tearing pain, not this.', B: 'Correct — inferior wall.', C: 'No risk factors given.', D: 'No friction rub.' },
    pearl: 'ST elevation in II, III, aVF = inferior wall = RCA territory.',
    memoryAnchor: 'RCA = Right Coronary Artery = inferior wall',
    commonTrap: 'Confusing with aortic dissection.',
    subject: 'Cardiology',
    system: 'Cardiovascular',
    topic: 'Chest Pain',
    testedConcept: 'Acute Myocardial Infarction',
    weakSpotCategory: 'Cardiac Emergencies',
    difficulty: 'Balanced',
    ...overrides,
  };
}

describe('getGeneratedQuestionCorrectLetter', () => {
  it('reads the correct field', () => {
    expect(getGeneratedQuestionCorrectLetter({ correct: 'C' })).toBe('C');
  });

  it('falls back to correctAnswer then correct_answer', () => {
    expect(getGeneratedQuestionCorrectLetter({ correctAnswer: 'D' })).toBe('D');
    expect(getGeneratedQuestionCorrectLetter({ correct_answer: 'A' })).toBe('A');
  });

  it('returns empty string when absent (student-view question)', () => {
    expect(getGeneratedQuestionCorrectLetter({ stem: 'no answer key here' })).toBe('');
  });
});

describe('shuffleQuestionForExam', () => {
  it('keeps the correct answer text at whatever position it lands, and updates the letter to match', () => {
    const q = makeQuestion();
    const shuffled = shuffleQuestionForExam(q);

    const newCorrectLetter = shuffled.correct as string;
    const newCorrectOption = shuffled.options.find((o) => o.letter === newCorrectLetter);
    expect(newCorrectOption?.text).toBe('Acute inferior MI');
  });

  it('remaps optionExplanations to the new letter positions', () => {
    const q = makeQuestion();
    const shuffled = shuffleQuestionForExam(q);

    const newCorrectLetter = shuffled.correct as string;
    expect(shuffled.optionExplanations[newCorrectLetter]).toBe('Correct — inferior wall.');
  });

  it('preserves the same set of option texts, just reordered', () => {
    const q = makeQuestion();
    const shuffled = shuffleQuestionForExam(q);
    const originalTexts = q.options.map((o) => o.text).sort();
    const shuffledTexts = shuffled.options.map((o) => o.text).sort();
    expect(shuffledTexts).toEqual(originalTexts);
  });

  it('assigns sequential letters A, B, C, D regardless of shuffle', () => {
    const q = makeQuestion();
    const shuffled = shuffleQuestionForExam(q);
    expect(shuffled.options.map((o) => o.letter)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('does not mutate the input question', () => {
    const q = makeQuestion();
    const before = JSON.stringify(q);
    shuffleQuestionForExam(q);
    expect(JSON.stringify(q)).toBe(before);
  });

  it('is a safe no-op when there is no resolvable correct letter', () => {
    const q = makeQuestion({ correct: undefined });
    const result = shuffleQuestionForExam(q);
    expect(result).toBe(q);
  });

  it('is a safe no-op when there are fewer than 2 options', () => {
    const q = makeQuestion({ options: [{ letter: 'A', text: 'Only option' }] });
    const result = shuffleQuestionForExam(q);
    expect(result).toBe(q);
  });

  it('never throws even for a malformed correct letter with no matching option', () => {
    const q = makeQuestion({ correct: 'Z' });
    expect(() => shuffleQuestionForExam(q)).not.toThrow();
    expect(shuffleQuestionForExam(q)).toBe(q);
  });
});

describe('toStudentExamQuestion', () => {
  it('strips every answer/reveal field', () => {
    const q = makeQuestion();
    const view = toStudentExamQuestion(q);

    expect(view).not.toHaveProperty('correct');
    expect(view).not.toHaveProperty('correctAnswer');
    expect(view).not.toHaveProperty('correct_answer');
    expect(view).not.toHaveProperty('explanation');
    expect(view).not.toHaveProperty('optionExplanations');
    expect(view).not.toHaveProperty('wrongAnswerExplanations');
    expect(view).not.toHaveProperty('pearl');
    expect(view).not.toHaveProperty('highYieldPearl');
    expect(view).not.toHaveProperty('memoryAnchor');
    expect(view).not.toHaveProperty('commonTrap');
  });

  it('strips bank/admin metadata not on the allow-list', () => {
    const q = makeQuestion({
      source: 'ai',
      bankStatus: 'validated_generated',
      fingerprint: 'abc123',
      validationScore: 0.9,
      aiModel: 'claude-haiku-4-5',
      reviewMetadata: { reviewStatus: 'source_checked' },
    });
    const view = toStudentExamQuestion(q);

    expect(view).not.toHaveProperty('source');
    expect(view).not.toHaveProperty('bankStatus');
    expect(view).not.toHaveProperty('fingerprint');
    expect(view).not.toHaveProperty('validationScore');
    expect(view).not.toHaveProperty('aiModel');
    expect(view).not.toHaveProperty('reviewMetadata');
  });

  it('preserves everything a student needs to answer and render the question', () => {
    const q = makeQuestion();
    const view = toStudentExamQuestion(q);

    expect(view).toEqual({
      id: 'q-fp-1',
      stem: 'A 45-year-old man presents with chest pain.',
      options: [
        { letter: 'A', text: 'Aortic dissection' },
        { letter: 'B', text: 'Acute inferior MI' },
        { letter: 'C', text: 'Pulmonary embolism' },
        { letter: 'D', text: 'Pericarditis' },
      ],
      subject: 'Cardiology',
      system: 'Cardiovascular',
      topic: 'Chest Pain',
      rawTopic: '',
      canonicalTopic: '',
      topicSlug: '',
      topicSource: '',
      questionAngle: '',
      usmleContentArea: '',
      usmleSubdomain: '',
      physicianTask: '',
      difficulty: 'Balanced',
      testedConcept: 'Acute Myocardial Infarction',
      weakSpotCategory: 'Cardiac Emergencies',
    });
  });

  it('applied after shuffleQuestionForExam still contains no answer key', () => {
    const q = makeQuestion();
    const view = toStudentExamQuestion(shuffleQuestionForExam(q));
    expect(view).not.toHaveProperty('correct');
    expect(view.options).toHaveLength(4);
  });
});
