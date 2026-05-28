import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock storage module before importing dataProvider
vi.mock('./storage.js', () => ({
  saveCompletedSession: vi.fn(),
  getSessionHistory: vi.fn(() => []),
  appendFlashcards: vi.fn(),
  markFlashcardReviewed: vi.fn(),
  updateFlashcardStatus: vi.fn(),
  getFlashcards: vi.fn(() => []),
}));

// Mock apiClient
vi.mock('./apiClient.js', () => ({
  exams: { create: vi.fn().mockResolvedValue({ id: 'sess-1' }) },
  flashcards: { createMany: vi.fn().mockResolvedValue([]), updateStatus: vi.fn(), markReviewed: vi.fn() },
  analytics: { get: vi.fn(), progress: vi.fn() },
}));

import * as storage from './storage.js';
import * as api from './apiClient.js';
import {
  saveSession,
  getSessions,
  saveFlashcards,
  getAllFlashcards,
} from './dataProvider.js';

// results shape — output of calculatePracticeResults
const results = {
  mode: 'practice',
  correct: 5,
  total: 6,
  percentage: 83,
  medicaScore: 70,
  readinessLabel: 'Ready',
  subjectBreakdown: [],
  systemBreakdown: [],
  missedQuestions: [],
  completedAt: new Date().toISOString(),
};

// sessionWithAnswers shape — the full session object from the interface
const sessionWithAnswers = {
  mode: 'practice',
  questions: [
    {
      id: 'q1',
      stem: 'A 45-year-old male presents with chest pain radiating to the left arm and diaphoresis for 30 minutes.',
      options: [{ letter: 'A', text: 'STEMI' }, { letter: 'B', text: 'NSTEMI' }, { letter: 'C', text: 'Angina' }, { letter: 'D', text: 'PE' }],
      correct: 'A',
      explanation: 'Classic MI presentation.',
      subject: 'Cardiology',
      system: 'Cardiovascular',
      difficulty: 'Medium',
    },
  ],
  answers: { q1: 'A' },
  config: { difficulty: 'Balanced' },
  totalTime: 45,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('saveSession', () => {
  it('always calls saveCompletedSession with merged results', async () => {
    await saveSession(results, sessionWithAnswers);
    expect(storage.saveCompletedSession).toHaveBeenCalledOnce();
    const arg = storage.saveCompletedSession.mock.calls[0][0];
    expect(arg.mode).toBe('practice');
    expect(arg.percentage).toBe(83);
    expect(Array.isArray(arg.questionIds)).toBe(true);
    expect(arg.questionIds).toContain('q1');
  });

  it('calls api.exams.create with correctly mapped payload', async () => {
    await saveSession(results, sessionWithAnswers);
    expect(api.exams.create).toHaveBeenCalledOnce();
    const payload = api.exams.create.mock.calls[0][0];
    expect(payload.mode).toBe('practice');
    expect(payload.score).toBe(5);
    expect(payload.percentage).toBe(83);
    expect(payload.medica_score).toBe(70);
    expect(payload.readiness_label).toBe('Ready');
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].text).toBe(sessionWithAnswers.questions[0].stem);
    expect(payload.questions[0].options).toEqual(['STEMI', 'NSTEMI', 'Angina', 'PE']);
    expect(payload.questions[0].correct_answer).toBe('A');
    expect(payload.answers).toEqual({ q1: 'A' });
  });

  it('maps missed_questions correctly — unanswered or incorrect', async () => {
    const swAnswers = { ...sessionWithAnswers, answers: { q1: 'B' } };
    await saveSession(results, swAnswers);
    const payload = api.exams.create.mock.calls[0][0];
    expect(payload.missed_questions).toHaveLength(1);
    expect(payload.missed_questions[0].id).toBe('q1');
  });

  it('marks correct answers as NOT missed', async () => {
    await saveSession(results, sessionWithAnswers);
    const payload = api.exams.create.mock.calls[0][0];
    expect(payload.missed_questions).toHaveLength(0);
  });
});

describe('getSessions', () => {
  it('returns localStorage history', () => {
    storage.getSessionHistory.mockReturnValueOnce([{ id: 's1' }]);
    const result = getSessions();
    expect(result).toEqual([{ id: 's1' }]);
  });
});

describe('saveFlashcards', () => {
  it('calls appendFlashcards with the cards', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    await saveFlashcards(cards);
    expect(storage.appendFlashcards).toHaveBeenCalledWith(cards);
  });

  it('calls api.flashcards.createMany with mapped payload', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio', reviewStatus: 'new' }];
    await saveFlashcards(cards);
    expect(api.flashcards.createMany).toHaveBeenCalledOnce();
    const mapped = api.flashcards.createMany.mock.calls[0][0];
    expect(mapped[0].source_question_id).toBe('q1');
    expect(mapped[0].front).toBe('Q');
    expect(mapped[0].type).toBe('Recall');
  });
});

describe('getAllFlashcards', () => {
  it('delegates to getFlashcards from storage', () => {
    storage.getFlashcards.mockReturnValueOnce([{ id: 'f1' }]);
    const result = getAllFlashcards();
    expect(result).toEqual([{ id: 'f1' }]);
  });
});
