import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const FLAG_KEY  = 'medica_flashcards_synced_v9_user-123';
const DIRTY_KEY = 'medica_flashcards_dirty_v9_user-123';

// Mock storage module before importing dataProvider
vi.mock('./storage.js', () => ({
  saveCompletedSession: vi.fn(),
  getSessionHistory: vi.fn(() => []),
  appendFlashcards: vi.fn(),
  markFlashcardReviewed: vi.fn(),
  updateFlashcardStatus: vi.fn(),
  getFlashcards: vi.fn(() => []),
  saveFlashcards: vi.fn(),
  clearFlashcards: vi.fn(),
}));

// Mock apiClient
vi.mock('./apiClient.js', () => ({
  isAuthenticated: vi.fn(() => true),
  getCurrentUserId: vi.fn(() => 'user-123'),
  exams: {
    create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
    list:   vi.fn().mockResolvedValue({ data: [], totalPages: 1 }),
  },
  flashcards: {
    list: vi.fn().mockResolvedValue({ flashcards: [] }),
    createMany: vi.fn().mockResolvedValue({ flashcards: [] }),
    updateStatus: vi.fn(),
    markReviewed: vi.fn(),
  },
  analytics: { get: vi.fn(), progress: vi.fn() },
}));

import * as storage from './storage.js';
import * as api from './apiClient.js';
import { getSessionSyncOutbox } from './sessionSyncOutbox.js';
import {
  saveSession,
  getSessions,
  saveFlashcards,
  getAllFlashcards,
  reviewFlashcard,
  setFlashcardStatus,
  clearFlashcards,
  syncLocalFlashcardsToBackend,
  getBackendFlashcards,
  importBackendFlashcards,
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
      usmleContentArea: 'Cardiovascular System',
      usmleSubdomain: 'Acute coronary syndrome',
      physicianTask: 'Patient Care: Diagnosis',
      difficulty: 'Medium',
    },
  ],
  answers: { q1: 'A' },
  config: { difficulty: 'Balanced' },
  totalTime: 45,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.isAuthenticated.mockReturnValue(true);
  api.getCurrentUserId.mockReturnValue('user-123');
  storage.appendFlashcards.mockReturnValue(0);
  storage.getFlashcards.mockReturnValue([]);
});

afterEach(() => {
  vi.useRealTimers();
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
    expect(payload.questions[0].usmleContentArea).toBe('Cardiovascular System');
    expect(payload.questions[0].physicianTask).toBe('Patient Care: Diagnosis');
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

  it('uses correctAnswer alias when correct is absent', async () => {
    const session = {
      ...sessionWithAnswers,
      questions: [{ ...sessionWithAnswers.questions[0], correct: undefined, correctAnswer: 'B' }],
      answers: { q1: 'b' },
    };

    await saveSession(results, session);

    const payload = api.exams.create.mock.calls[0][0];
    expect(payload.questions[0].correct_answer).toBe('B');
    expect(payload.missed_questions).toHaveLength(0);
  });

  it('prefers correct over correctAnswer for backend missed question filtering', async () => {
    const session = {
      ...sessionWithAnswers,
      questions: [{ ...sessionWithAnswers.questions[0], correct: 'C', correctAnswer: 'A' }],
      answers: { q1: 'C' },
    };

    await saveSession(results, session);

    const payload = api.exams.create.mock.calls[0][0];
    expect(payload.questions[0].correct_answer).toBe('C');
    expect(payload.missed_questions).toHaveLength(0);
  });

  it('queues a failed write and retries with the same idempotency key', async () => {
    vi.useFakeTimers();
    const session = {
      ...sessionWithAnswers,
      clientSessionId: '11111111-1111-4111-a111-111111111111',
    };
    api.exams.create
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 503 }))
      .mockResolvedValueOnce({ id: session.clientSessionId });

    const pending = saveSession(results, session);
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await pending;

    expect(result).toEqual({ backendSynced: true, syncState: 'synced' });
    expect(api.exams.create).toHaveBeenCalledTimes(2);
    expect(api.exams.create.mock.calls[0][0].clientSessionId).toBe(session.clientSessionId);
    expect(api.exams.create.mock.calls[1][0].clientSessionId).toBe(session.clientSessionId);
    expect(getSessionSyncOutbox('user-123')).toHaveLength(0);
    vi.useRealTimers();
  });

  it('keeps a durable pending entry when the initial write and retry fail', async () => {
    vi.useFakeTimers();
    const session = {
      ...sessionWithAnswers,
      clientSessionId: '22222222-2222-4222-a222-222222222222',
    };
    api.exams.create.mockRejectedValue(Object.assign(new Error('offline'), { status: 503 }));

    const pending = saveSession(results, session);
    await vi.advanceTimersByTimeAsync(1_500);
    const result = await pending;

    expect(result).toEqual({ backendSynced: false, syncState: 'pending' });
    expect(getSessionSyncOutbox('user-123')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('does not queue a permanently invalid session payload', async () => {
    api.exams.create.mockRejectedValueOnce(Object.assign(new Error('invalid'), { status: 400 }));

    const result = await saveSession(results, sessionWithAnswers);

    expect(result).toEqual({ backendSynced: false, syncState: 'failed' });
    expect(api.exams.create).toHaveBeenCalledOnce();
    expect(getSessionSyncOutbox('user-123')).toHaveLength(0);
  });

  it('queues and pauses after an authentication failure without retrying', async () => {
    api.exams.create.mockRejectedValueOnce(Object.assign(new Error('expired'), { status: 401 }));

    const result = await saveSession(results, {
      ...sessionWithAnswers,
      clientSessionId: '44444444-4444-4444-a444-444444444444',
    });

    expect(result).toEqual({ backendSynced: false, syncState: 'pending' });
    expect(api.exams.create).toHaveBeenCalledOnce();
    expect(getSessionSyncOutbox('user-123')).toHaveLength(1);
  });
});

describe('getSessions', () => {
  it('returns localStorage sessions when unauthenticated', async () => {
    api.isAuthenticated.mockReturnValueOnce(false);
    storage.getSessionHistory.mockReturnValueOnce([{ id: 's1' }]);
    const result = await getSessions();
    expect(result).toEqual([{ id: 's1' }]);
    expect(api.exams.list).not.toHaveBeenCalled();
  });

  it('returns normalized backend sessions for authenticated users', async () => {
    api.exams.list.mockResolvedValueOnce({
      data: [{
        id:               'b1',
        completed_at:     '2024-01-01T00:00:00.000Z',
        mode:             'practice',
        score:            8,
        percentage:       80,
        medica_score:     75,
        readiness_label:  'Ready',
        subject_breakdown: {},
        system_breakdown:  {},
        missed_questions:  [],
        questions:         [],
        answers:           {},
        difficulty:        'Balanced',
      }],
      totalPages: 1,
    });
    const result = await getSessions();
    expect(api.exams.list).toHaveBeenCalledWith(1, 100);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b1');
    expect(result[0].mode).toBe('practice');
    expect(result[0].correct).toBe(8);
  });

  it('falls back to localStorage when backend throws', async () => {
    api.exams.list.mockRejectedValueOnce(new Error('network error'));
    storage.getSessionHistory.mockReturnValueOnce([{ id: 'local1' }]);
    const result = await getSessions();
    expect(result).toEqual([{ id: 'local1' }]);
  });
});

describe('saveFlashcards', () => {
  afterEach(() => {
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  it('saves locally first and returns accepted/skipped counts', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards
      .mockReturnValueOnce([])
      .mockReturnValueOnce(cards);

    const result = await saveFlashcards(cards);

    expect(storage.appendFlashcards).toHaveBeenCalledWith(cards);
    expect(result).toMatchObject({ added: 1, skipped: 0, total: 1 });
  });

  it('calls api.flashcards.createMany with locally accepted cards', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio', reviewStatus: 'new' }];
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards
      .mockReturnValueOnce([])
      .mockReturnValueOnce(cards);

    const result = await saveFlashcards(cards);

    expect(api.flashcards.createMany).toHaveBeenCalledOnce();
    const mapped = api.flashcards.createMany.mock.calls[0][0];
    expect(mapped[0].source_question_id).toBe('q1');
    expect(mapped[0].front).toBe('Q');
    expect(mapped[0].type).toBe('Recall');
    expect(result.backendAttempted).toBe(true);
    expect(result.backendSynced).toBe(true);
  });

  it('does not call backend when the user is not logged in', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    api.isAuthenticated.mockReturnValueOnce(false);
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards
      .mockReturnValueOnce([])
      .mockReturnValueOnce(cards);

    const result = await saveFlashcards(cards);

    expect(api.flashcards.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ added: 1, skipped: 0, backendAttempted: false, backendSynced: false });
  });

  it('does not call backend when local validation or dedupe rejects every card', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    storage.appendFlashcards.mockReturnValueOnce(0);

    const result = await saveFlashcards(cards);

    expect(api.flashcards.createMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ added: 0, skipped: 1 });
  });

  it('maps full-fidelity camelCase metadata to snake_case', async () => {
    const richCard = [{
      front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio',
      reviewStatus: 'new', subject: 'Cardiology', system: 'Cardiovascular',
      canonicalTopic: 'Hypertensive Crises', topicSlug: 'hypertensive-crises',
      sourceMode: 'practice', memoryAnchor: 'no damage = urgency',
      commonTrap: 'urgency vs emergency', sourcePearl: 'DBP > 120 alone',
      weakSpotCategory: 'Cardio', reinforcementPriority: 'high',
      reviewCount: 2, ease: 'good', lastMissedReason: 'confused with emergency',
    }];
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards.mockReturnValueOnce([]).mockReturnValueOnce(richCard);

    await saveFlashcards(richCard);

    const mapped = api.flashcards.createMany.mock.calls[0][0];
    expect(mapped[0].canonical_topic).toBe('Hypertensive Crises');
    expect(mapped[0].topic_slug).toBe('hypertensive-crises');
    expect(mapped[0].source_mode).toBe('practice');
    expect(mapped[0].memory_anchor).toBe('no damage = urgency');
    expect(mapped[0].common_trap).toBe('urgency vs emergency');
    expect(mapped[0].source_pearl).toBe('DBP > 120 alone');
    expect(mapped[0].weak_spot_category).toBe('Cardio');
    expect(mapped[0].reinforcement_priority).toBe('high');
    expect(mapped[0].review_count).toBe(2);
    expect(mapped[0].ease).toBe('good');
    expect(mapped[0].last_missed_reason).toBe('confused with emergency');
  });

  it('keeps local cards saved when backend sync fails', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards
      .mockReturnValueOnce([])
      .mockReturnValueOnce(cards);
    api.flashcards.createMany.mockRejectedValueOnce(new Error('offline'));

    const result = await saveFlashcards(cards);

    expect(result).toMatchObject({ added: 1, skipped: 0, backendAttempted: true, backendSynced: false });
  });

  it('sets dirty flag when backend write fails for an authenticated user', async () => {
    api.isAuthenticated.mockReturnValue(true);
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards.mockReturnValueOnce([]).mockReturnValueOnce(cards);
    api.flashcards.createMany.mockRejectedValueOnce(new Error('offline'));

    await saveFlashcards(cards);

    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
  });

  it('does not set dirty flag when user is not authenticated', async () => {
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    api.isAuthenticated.mockReturnValueOnce(false);
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards.mockReturnValueOnce([]).mockReturnValueOnce(cards);

    await saveFlashcards(cards);

    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });

  it('does not set dirty flag when backend write succeeds', async () => {
    api.isAuthenticated.mockReturnValue(true);
    const cards = [{ front: 'Q', back: 'A', sourceQuestionId: 'q1', type: 'Recall', tag: 'Bio' }];
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards.mockReturnValueOnce([]).mockReturnValueOnce(cards);

    await saveFlashcards(cards);

    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });
});

describe('getAllFlashcards', () => {
  it('delegates to getFlashcards from storage', () => {
    storage.getFlashcards.mockReturnValueOnce([{ id: 'f1' }]);
    const result = getAllFlashcards();
    expect(result).toEqual([{ id: 'f1' }]);
  });
});

describe('reviewFlashcard', () => {
  it('passes ease through to markFlashcardReviewed', async () => {
    await reviewFlashcard('fc-1', 'easy');
    expect(storage.markFlashcardReviewed).toHaveBeenCalledWith('fc-1', 'easy');
  });

  it('still writes locally even when user is not authenticated', async () => {
    api.isAuthenticated.mockReturnValueOnce(false);
    await reviewFlashcard('fc-1', 'good');
    expect(storage.markFlashcardReviewed).toHaveBeenCalledWith('fc-1', 'good');
    expect(api.flashcards.markReviewed).not.toHaveBeenCalled();
  });
});

describe('clearFlashcards', () => {
  it('calls clearFlashcards from storage', async () => {
    await clearFlashcards();
    expect(storage.clearFlashcards).toHaveBeenCalledOnce();
  });
});

describe('syncLocalFlashcardsToBackend', () => {
  const LOCAL_CARD = { front: 'Q', back: 'A', sourceQuestionId: 'q1', tag: 'Bio', type: 'Recall', reviewStatus: 'new' };

  beforeEach(() => {
    vi.clearAllMocks();
    api.isAuthenticated.mockReturnValue(true);
    api.getCurrentUserId.mockReturnValue('user-123');
    api.flashcards.list.mockResolvedValue({ flashcards: [] });
    api.flashcards.createMany.mockResolvedValue({ flashcards: [] });
    try { localStorage.removeItem(FLAG_KEY);  } catch { /* ignore */ }
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  afterEach(() => {
    try { localStorage.removeItem(FLAG_KEY);  } catch { /* ignore */ }
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  it('skips when user is not authenticated', async () => {
    api.isAuthenticated.mockReturnValue(false);
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    const result = await syncLocalFlashcardsToBackend();

    expect(result.skipped).toBe(true);
    expect(api.flashcards.list).not.toHaveBeenCalled();
    expect(api.flashcards.createMany).not.toHaveBeenCalled();
  });

  it('sends local cards to backend on first sync', async () => {
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    const result = await syncLocalFlashcardsToBackend();

    expect(api.flashcards.list).toHaveBeenCalledOnce();
    expect(api.flashcards.createMany).toHaveBeenCalledOnce();
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(false);
  });

  it('sets the sync flag after successful sync', async () => {
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    await syncLocalFlashcardsToBackend();

    expect(localStorage.getItem(FLAG_KEY)).toBe('1');
  });

  it('skips when sync flag is set and dirty flag is absent', async () => {
    localStorage.setItem(FLAG_KEY, '1');
    // dirty flag intentionally absent
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    const result = await syncLocalFlashcardsToBackend();

    expect(result.skipped).toBe(true);
    expect(api.flashcards.list).not.toHaveBeenCalled();
    expect(api.flashcards.createMany).not.toHaveBeenCalled();
  });

  it('runs delta sync when sync flag is set but dirty flag is also set', async () => {
    localStorage.setItem(FLAG_KEY, '1');
    localStorage.setItem(DIRTY_KEY, '1');
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    const result = await syncLocalFlashcardsToBackend();

    expect(api.flashcards.list).toHaveBeenCalledOnce();
    expect(api.flashcards.createMany).toHaveBeenCalledOnce();
    expect(result.synced).toBe(1);
    expect(result.skipped).toBe(false);
  });

  it('clears dirty flag after successful delta sync', async () => {
    localStorage.setItem(FLAG_KEY, '1');
    localStorage.setItem(DIRTY_KEY, '1');
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    await syncLocalFlashcardsToBackend();

    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
    expect(localStorage.getItem(FLAG_KEY)).toBe('1');
  });

  it('does not duplicate cards in backend after dirty-flag-triggered delta sync', async () => {
    // Backend already has the card. Dirty flag triggers a sync attempt.
    localStorage.setItem(FLAG_KEY, '1');
    localStorage.setItem(DIRTY_KEY, '1');
    api.flashcards.list.mockResolvedValue({ flashcards: [{ source_question_id: 'q1', tag: 'Bio' }] });
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    const result = await syncLocalFlashcardsToBackend();

    expect(api.flashcards.createMany).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(localStorage.getItem(DIRTY_KEY)).toBeNull();
  });

  it('does not send card already in backend (dedup by source_question_id::tag)', async () => {
    api.flashcards.list.mockResolvedValue({ flashcards: [{ source_question_id: 'q1', tag: 'Bio' }] });
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);

    const result = await syncLocalFlashcardsToBackend();

    expect(api.flashcards.createMany).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(localStorage.getItem(FLAG_KEY)).toBe('1');
  });

  it('sends only cards not already in backend (partial dedup)', async () => {
    api.flashcards.list.mockResolvedValue({ flashcards: [{ source_question_id: 'q1', tag: 'Bio' }] });
    const localCard2 = { front: 'Q2', back: 'A2', sourceQuestionId: 'q2', tag: 'Neuro', type: 'Recall', reviewStatus: 'new' };
    storage.getFlashcards.mockReturnValue([LOCAL_CARD, localCard2]);

    await syncLocalFlashcardsToBackend();

    const sent = api.flashcards.createMany.mock.calls[0][0];
    expect(sent).toHaveLength(1);
    expect(sent[0].source_question_id).toBe('q2');
  });

  it('filters out cards with empty front or back', async () => {
    const blankCard = { front: '', back: 'A', sourceQuestionId: 'q2', tag: 'X', type: 'Recall' };
    storage.getFlashcards.mockReturnValue([LOCAL_CARD, blankCard]);

    await syncLocalFlashcardsToBackend();

    const sent = api.flashcards.createMany.mock.calls[0][0];
    expect(sent).toHaveLength(1);
    expect(sent[0].source_question_id).toBe('q1');
  });

  it('does not set sync flag when createMany fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);
    api.flashcards.createMany.mockRejectedValueOnce(new Error('network error'));

    await syncLocalFlashcardsToBackend();

    expect(localStorage.getItem(FLAG_KEY)).toBeNull();
    warnSpy.mockRestore();
  });

  it('aborts without sending when list fetch fails, does not set flag', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.getFlashcards.mockReturnValue([LOCAL_CARD]);
    api.flashcards.list.mockRejectedValueOnce(new Error('network error'));

    await syncLocalFlashcardsToBackend();

    expect(api.flashcards.createMany).not.toHaveBeenCalled();
    expect(localStorage.getItem(FLAG_KEY)).toBeNull();
    warnSpy.mockRestore();
  });

  it('maps cards through full-fidelity helper before syncing', async () => {
    const richCard = {
      front: 'Q', back: 'A', sourceQuestionId: 'q1', tag: 'Bio',
      type: 'Pearl', reviewStatus: 'learning',
      subject: 'Cardiology', system: 'Cardiovascular',
      canonicalTopic: 'Hypertensive Crises', topicSlug: 'hypertensive-crises',
      sourceMode: 'practice', memoryAnchor: 'no damage = urgency',
      reinforcementPriority: 'high', reviewCount: 3, ease: 'good',
    };
    storage.getFlashcards.mockReturnValue([richCard]);

    await syncLocalFlashcardsToBackend();

    const sent = api.flashcards.createMany.mock.calls[0][0];
    expect(sent[0].type).toBe('Pearl');
    expect(sent[0].review_status).toBe('learning');
    expect(sent[0].canonical_topic).toBe('Hypertensive Crises');
    expect(sent[0].reinforcement_priority).toBe('high');
    expect(sent[0].review_count).toBe(3);
    expect(sent[0].ease).toBe('good');
  });
});

describe('getBackendFlashcards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isAuthenticated.mockReturnValue(true);
    api.getCurrentUserId.mockReturnValue('user-123');
    api.flashcards.list.mockResolvedValue({ flashcards: [] });
  });

  it('returns null when no auth token', async () => {
    api.isAuthenticated.mockReturnValue(false);
    const result = await getBackendFlashcards();
    expect(result).toBeNull();
  });

  it('does not call api.flashcards.list when unauthenticated', async () => {
    api.isAuthenticated.mockReturnValue(false);
    await getBackendFlashcards();
    expect(api.flashcards.list).not.toHaveBeenCalled();
  });

  it('returns empty array when backend has no cards', async () => {
    const result = await getBackendFlashcards();
    expect(result).toEqual([]);
  });

  it('maps backend snake_case fields to frontend camelCase', async () => {
    const backendCard = {
      id: 'uuid-123',
      front: 'Front text',
      back: 'Back text',
      tag: 'Cardio',
      type: 'Pearl',
      review_status: 'learning',
      subject: 'Cardiology',
      system: 'Cardiovascular',
      topic: 'Heart Failure',
      source_question_id: 'q-abc',
      canonical_topic: 'Heart Failure',
      topic_slug: 'heart-failure',
      source_mode: 'coach',
      memory_anchor: 'anchor text',
      common_trap: 'trap text',
      source_pearl: 'pearl text',
      weak_spot_category: 'Pathology',
      reinforcement_priority: 'high',
      review_count: 3,
      ease: 'good',
      last_missed_reason: 'missed reason',
      created_at: '2026-01-01T00:00:00.000Z',
      reviewed_at: '2026-01-02T00:00:00.000Z',
    };
    api.flashcards.list.mockResolvedValue({ flashcards: [backendCard] });

    const result = await getBackendFlashcards();

    expect(result).toHaveLength(1);
    const card = result[0];
    expect(card.id).toBe('uuid-123');
    expect(card.reviewStatus).toBe('learning');
    expect(card.sourceQuestionId).toBe('q-abc');
    expect(card.canonicalTopic).toBe('Heart Failure');
    expect(card.topicSlug).toBe('heart-failure');
    expect(card.sourceMode).toBe('coach');
    expect(card.memoryAnchor).toBe('anchor text');
    expect(card.commonTrap).toBe('trap text');
    expect(card.sourcePearl).toBe('pearl text');
    expect(card.weakSpotCategory).toBe('Pathology');
    expect(card.reinforcementPriority).toBe('high');
    expect(card.reviewCount).toBe(3);
    expect(card.ease).toBe('good');
    expect(card.lastMissedReason).toBe('missed reason');
    expect(card.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(card.reviewedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('fills in defaults for missing optional fields', async () => {
    api.flashcards.list.mockResolvedValue({ flashcards: [{ id: 'uuid-min', front: 'Front', back: 'Back' }] });

    const result = await getBackendFlashcards();

    const card = result[0];
    expect(card.tag).toBe('');
    expect(card.type).toBe('Recall');
    expect(card.reviewStatus).toBe('new');
    expect(card.sourceQuestionId).toBe('');
    expect(card.reinforcementPriority).toBe('normal');
    expect(card.reviewCount).toBe(0);
    expect(card.ease).toBeNull();
    expect(card.memoryAnchor).toBeNull();
    expect(card.createdAt).toBeNull();
    expect(card.reviewedAt).toBeNull();
  });

  it('returns null when the api call throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.flashcards.list.mockRejectedValue(new Error('network error'));

    const result = await getBackendFlashcards();

    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});

describe('importBackendFlashcards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.getFlashcards.mockReturnValue([]);
  });

  // ── empty / no-op ────────────────────────────────────────────────────────

  it('returns 0 for empty input without touching storage', () => {
    const added = importBackendFlashcards([]);
    expect(storage.saveFlashcards).not.toHaveBeenCalled();
    expect(added).toBe(0);
  });

  // ── new inserts ──────────────────────────────────────────────────────────

  it('inserts new backend card and returns count of 1', () => {
    const bc = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'Cardio' };
    storage.getFlashcards.mockReturnValue([]);

    const added = importBackendFlashcards([bc]);

    expect(storage.saveFlashcards).toHaveBeenCalledOnce();
    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('uuid-1');
    expect(added).toBe(1);
  });

  it('preserves backend UUID as card id for new inserts', () => {
    const cards = [
      { id: 'uuid-abc', front: 'F1', back: 'B1', sourceQuestionId: 'q1', tag: 'A' },
      { id: 'uuid-def', front: 'F2', back: 'B2', sourceQuestionId: 'q2', tag: 'B' },
    ];
    storage.getFlashcards.mockReturnValue([]);

    importBackendFlashcards(cards);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].id).toBe('uuid-abc');
    expect(saved[1].id).toBe('uuid-def');
  });

  it('does not add a card with duplicate normalized front text (secondary dedup)', () => {
    const local = { id: 'fcg_1', front: 'What is ATP?', back: 'Energy unit', sourceQuestionId: 'q1', tag: 'A' };
    const bc    = { id: 'uuid-2', front: 'What is  ATP?', back: 'Energy', sourceQuestionId: 'q9', tag: 'B' };
    storage.getFlashcards.mockReturnValue([local]);

    const added = importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(added).toBe(0);
  });

  // ── ID match (uuid→uuid): backend SRS and content fields overwrite local ─

  it('updates SRS fields (reviewStatus, reviewCount, reviewedAt) when backend UUID matches local id', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    reviewStatus: 'new', reviewCount: 0, reviewedAt: null };
    const bc    = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    reviewStatus: 'mastered', reviewCount: 5, reviewedAt: '2026-06-01T10:00:00Z' };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].reviewStatus).toBe('mastered');
    expect(saved[0].reviewCount).toBe(5);
    expect(saved[0].reviewedAt).toBe('2026-06-01T10:00:00Z');
  });

  it('updates content/metadata fields for ID match', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    memoryAnchor: null, commonTrap: null };
    const bc    = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    memoryAnchor: 'backend anchor', commonTrap: 'backend trap' };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].memoryAnchor).toBe('backend anchor');
    expect(saved[0].commonTrap).toBe('backend trap');
  });

  it('does not overwrite local content field when backend sends null (ID match)', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    memoryAnchor: 'local anchor' };
    const bc    = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    memoryAnchor: null };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].memoryAnchor).toBe('local anchor');
  });

  it('never overwrites local ease (backend never stores ease updates)', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    ease: 'easy' };
    const bc    = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    ease: null };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].ease).toBe('easy');
  });

  it('never overwrites local nextReview (local-only SRS field not in backend schema)', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    nextReview: '2026-07-01T00:00:00Z', reviewStatus: 'mastered' };
    const bc    = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    reviewStatus: 'mastered' };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].nextReview).toBe('2026-07-01T00:00:00Z');
  });

  it('does not duplicate when backend card matches existing by id (ID match returns 0)', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    storage.getFlashcards.mockReturnValue([local]);

    const added = importBackendFlashcards([{ ...local }]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(added).toBe(0);
  });

  // ── Key-only match (fcg_ local, different uuid): local SRS wins ──────────

  it('fills missing content fields for key-only match (fcg_ card)', () => {
    const local = { id: 'fcg_local', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    memoryAnchor: null, commonTrap: null };
    const bc    = { id: 'uuid-99', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    memoryAnchor: 'anchor', commonTrap: 'trap' };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].memoryAnchor).toBe('anchor');
    expect(saved[0].commonTrap).toBe('trap');
  });

  it('local SRS wins for key-only match (backend SRS frozen because fcg_ id 404s on backend)', () => {
    const local = { id: 'fcg_local', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    reviewStatus: 'mastered', ease: 'easy', reviewCount: 10, reviewedAt: '2026-01-15' };
    const bc    = { id: 'uuid-99', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C',
                    reviewStatus: 'new', ease: null, reviewCount: 0, reviewedAt: null };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].reviewStatus).toBe('mastered');
    expect(saved[0].ease).toBe('easy');
    expect(saved[0].reviewCount).toBe(10);
    expect(saved[0].reviewedAt).toBe('2026-01-15');
  });

  it('does not duplicate when backend key-only matches local (local id preserved)', () => {
    const local = { id: 'fcg_local', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    const bc    = { id: 'uuid-99',  front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    storage.getFlashcards.mockReturnValue([local]);

    const added = importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe('fcg_local');
    expect(added).toBe(0);
  });

  // ── mixed: one update + one insert ───────────────────────────────────────

  it('returns count of newly inserted cards only (updates counted as 0)', () => {
    const local   = { id: 'uuid-1', front: 'F1', back: 'B1', sourceQuestionId: 'q1', tag: 'A' };
    const update  = { id: 'uuid-1', front: 'F1', back: 'B1', sourceQuestionId: 'q1', tag: 'A', memoryAnchor: 'x' };
    const newCard = { id: 'uuid-2', front: 'F2', back: 'B2', sourceQuestionId: 'q2', tag: 'B' };
    storage.getFlashcards.mockReturnValue([local]);

    const added = importBackendFlashcards([update, newCard]);

    expect(added).toBe(1);
    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved).toHaveLength(2);
  });

  // ── alpha.8: backendId written on all match paths ────────────────────────

  it('sets backendId on ID-matched local card', () => {
    const local = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    const bc    = { id: 'uuid-1', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].backendId).toBe('uuid-1');
  });

  it('sets backendId on key-only matched fcg_ card (the critical mapping)', () => {
    const local = { id: 'fcg_local', front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    const bc    = { id: 'uuid-99',  front: 'F', back: 'B', sourceQuestionId: 'q1', tag: 'C' };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].id).toBe('fcg_local');
    expect(saved[0].backendId).toBe('uuid-99');
  });

  it('sets backendId on newly inserted card', () => {
    const bc = { id: 'uuid-new', front: 'F', back: 'B', sourceQuestionId: 'q9', tag: 'X' };
    storage.getFlashcards.mockReturnValue([]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].backendId).toBe('uuid-new');
  });

  it('does not let backendId mapping route fcg_ card into SRS overwrite branch', () => {
    // Regression: after fcg_ card gets backendId='uuid-9', backend returns {id:'uuid-9', reviewStatus:'new'}.
    // The card must still use LOCAL SRS (mastered/5) — key-only match path, not id-match.
    const local = {
      id: 'fcg_x', backendId: 'uuid-9', sourceQuestionId: 'q1', tag: 'C',
      front: 'F', back: 'B', reviewStatus: 'mastered', reviewCount: 5, reviewedAt: '2026-01-15',
    };
    const bc = {
      id: 'uuid-9', sourceQuestionId: 'q1', tag: 'C',
      front: 'F', back: 'B', reviewStatus: 'new', reviewCount: 0, reviewedAt: null,
    };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].id).toBe('fcg_x');
    expect(saved[0].reviewStatus).toBe('mastered');
    expect(saved[0].reviewCount).toBe(5);
    expect(saved[0].reviewedAt).toBe('2026-01-15');
    expect(saved[0].backendId).toBe('uuid-9');
  });

  // ── SRS timestamp gate ──────────────────────────────────────────────────────

  it('SRS gate: backend reviewedAt newer than local → SRS fields overwritten', () => {
    const local = {
      id: 'uuid-aa', sourceQuestionId: 'q2', tag: 'T',
      front: 'F', back: 'B',
      reviewStatus: 'learning', reviewCount: 1, reviewedAt: '2026-01-10T00:00:00.000Z',
      ease: 'again', interval: 0, nextReview: null,
    };
    const bc = {
      id: 'uuid-aa', sourceQuestionId: 'q2', tag: 'T',
      front: 'F', back: 'B',
      reviewStatus: 'mastered', reviewCount: 4, reviewedAt: '2026-01-20T00:00:00.000Z',
      ease: 'easy', interval: 7, nextReview: '2026-01-27T00:00:00.000Z',
    };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].reviewStatus).toBe('mastered');
    expect(saved[0].reviewCount).toBe(4);
    expect(saved[0].ease).toBe('easy');
    expect(saved[0].interval).toBe(7);
  });

  it('SRS gate: local reviewedAt newer than backend → SRS fields kept', () => {
    const local = {
      id: 'uuid-bb', sourceQuestionId: 'q3', tag: 'T',
      front: 'F', back: 'B',
      reviewStatus: 'mastered', reviewCount: 5, reviewedAt: '2026-01-25T00:00:00.000Z',
      ease: 'easy', interval: 14, nextReview: '2026-02-08T00:00:00.000Z',
    };
    const bc = {
      id: 'uuid-bb', sourceQuestionId: 'q3', tag: 'T',
      front: 'Updated front', back: 'Updated back',
      reviewStatus: 'learning', reviewCount: 1, reviewedAt: '2026-01-10T00:00:00.000Z',
      ease: 'again', interval: 0, nextReview: null,
    };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    // Content fields updated (backend values applied)
    expect(saved[0].front).toBe('Updated front');
    expect(saved[0].back).toBe('Updated back');
    // SRS fields preserved (local is newer)
    expect(saved[0].reviewStatus).toBe('mastered');
    expect(saved[0].reviewCount).toBe(5);
    expect(saved[0].ease).toBe('easy');
    expect(saved[0].interval).toBe(14);
  });

  it('SRS gate (keyMatch): content overwritten, SRS preserved when local is newer', () => {
    // key-match path: local has no backendId, matched by sourceQuestionId::tag
    const local = {
      id: 'fcg_cc', sourceQuestionId: 'q4', tag: 'T',
      front: 'Old front', back: 'Old back', subject: 'Old',
      reviewStatus: 'mastered', reviewCount: 3, reviewedAt: '2026-02-01T00:00:00.000Z',
      ease: 'good', interval: 8, nextReview: '2026-02-09T00:00:00.000Z',
    };
    const bc = {
      id: 'uuid-cc', sourceQuestionId: 'q4', tag: 'T',
      front: 'New front', back: 'New back', subject: 'New',
      reviewStatus: 'new', reviewCount: 0, reviewedAt: '2026-01-01T00:00:00.000Z',
      ease: null, interval: 0, nextReview: null,
    };
    storage.getFlashcards.mockReturnValue([local]);

    importBackendFlashcards([bc]);

    const saved = storage.saveFlashcards.mock.calls[0][0];
    // Content updated
    expect(saved[0].front).toBe('New front');
    expect(saved[0].subject).toBe('New');
    // SRS preserved (local newer)
    expect(saved[0].reviewStatus).toBe('mastered');
    expect(saved[0].reviewCount).toBe(3);
    expect(saved[0].interval).toBe(8);
    // backendId assigned
    expect(saved[0].backendId).toBe('uuid-cc');
  });
});

describe('reviewFlashcard — backendId resolution (alpha.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isAuthenticated.mockReturnValue(true);
    api.getCurrentUserId.mockReturnValue('user-123');
    storage.getFlashcards.mockReturnValue([]);
  });

  afterEach(() => {
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  it('calls backend with local id when id is already a UUID', async () => {
    api.flashcards.markReviewed.mockResolvedValue(null);
    storage.getFlashcards.mockReturnValue([]);

    await reviewFlashcard('11111111-2222-3333-4444-555555555555', 'good');

    expect(api.flashcards.markReviewed).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555', 'good');
  });

  it('calls backend with backendId when fcg_ card has backendId set', async () => {
    const localCard = { id: 'fcg_x', backendId: 'uuid-99', front: 'F', back: 'B' };
    storage.getFlashcards.mockReturnValue([localCard]);
    api.flashcards.markReviewed.mockResolvedValue(null);

    await reviewFlashcard('fcg_x', 'easy');

    expect(storage.markFlashcardReviewed).toHaveBeenCalledWith('fcg_x', 'easy');
    expect(api.flashcards.markReviewed).toHaveBeenCalledWith('uuid-99', 'easy');
  });

  it('marks dirty and skips backend when fcg_ card has no backendId', async () => {
    api.isAuthenticated.mockReturnValue(true);
    const localCard = { id: 'fcg_x', front: 'F', back: 'B' };
    storage.getFlashcards.mockReturnValue([localCard]);

    await reviewFlashcard('fcg_x', 'good');

    expect(api.flashcards.markReviewed).not.toHaveBeenCalled();
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
  });

  it('marks dirty when backend call fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.getFlashcards.mockReturnValue([]);
    api.flashcards.markReviewed.mockRejectedValueOnce(new Error('network'));

    await reviewFlashcard('11111111-2222-3333-4444-555555555555', 'hard');

    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
    warnSpy.mockRestore();
  });
});

describe('setFlashcardStatus — backendId resolution (alpha.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isAuthenticated.mockReturnValue(true);
    api.getCurrentUserId.mockReturnValue('user-123');
    storage.getFlashcards.mockReturnValue([]);
  });

  afterEach(() => {
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  it('always updates localStorage', async () => {
    await setFlashcardStatus('fcg_x', 'mastered');
    expect(storage.updateFlashcardStatus).toHaveBeenCalledWith('fcg_x', 'mastered');
  });

  it('calls backend with UUID directly when id is already a UUID', async () => {
    api.flashcards.updateStatus.mockResolvedValue(null);
    storage.getFlashcards.mockReturnValue([]);

    await setFlashcardStatus('11111111-2222-3333-4444-555555555555', 'review');

    expect(api.flashcards.updateStatus).toHaveBeenCalledWith('11111111-2222-3333-4444-555555555555', 'review');
  });

  it('calls backend with backendId when fcg_ card has backendId set', async () => {
    const localCard = { id: 'fcg_x', backendId: 'uuid-77', front: 'F', back: 'B' };
    storage.getFlashcards.mockReturnValue([localCard]);
    api.flashcards.updateStatus.mockResolvedValue(null);

    await setFlashcardStatus('fcg_x', 'mastered');

    expect(api.flashcards.updateStatus).toHaveBeenCalledWith('uuid-77', 'mastered');
  });

  it('marks dirty and skips backend when fcg_ card has no backendId', async () => {
    const localCard = { id: 'fcg_x', front: 'F', back: 'B' };
    storage.getFlashcards.mockReturnValue([localCard]);

    await setFlashcardStatus('fcg_x', 'mastered');

    expect(api.flashcards.updateStatus).not.toHaveBeenCalled();
    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
  });

  it('marks dirty when backend call fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.getFlashcards.mockReturnValue([]);
    api.flashcards.updateStatus.mockRejectedValueOnce(new Error('network'));

    await setFlashcardStatus('11111111-2222-3333-4444-555555555555', 'learning');

    expect(localStorage.getItem(DIRTY_KEY)).toBe('1');
    warnSpy.mockRestore();
  });

  it('does not call backend when user is not authenticated', async () => {
    api.isAuthenticated.mockReturnValue(false);

    await setFlashcardStatus('11111111-2222-3333-4444-555555555555', 'mastered');

    expect(api.flashcards.updateStatus).not.toHaveBeenCalled();
  });
});

describe('saveFlashcards — _writeBackendIds (alpha.8)', () => {
  afterEach(() => {
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  it('writes backendId to local fcg_ card after successful createMany', async () => {
    const fcgCard = { id: 'fcg_x', front: 'Q', back: 'A', sourceQuestionId: 'q1', tag: 'Bio' };
    const backendResponse = { flashcards: [{ id: 'uuid-new', source_question_id: 'q1', tag: 'Bio' }] };
    api.isAuthenticated.mockReturnValue(true);
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards
      .mockReturnValueOnce([])         // beforeKeys
      .mockReturnValueOnce([fcgCard])  // savedCards filter
      .mockReturnValueOnce([fcgCard]); // _writeBackendIds read
    api.flashcards.createMany.mockResolvedValueOnce(backendResponse);

    await saveFlashcards([fcgCard]);

    expect(storage.saveFlashcards).toHaveBeenCalledOnce();
    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].backendId).toBe('uuid-new');
  });

  it('does not call saveFlashcards when createMany returns no cards', async () => {
    const fcgCard = { id: 'fcg_y', front: 'Q', back: 'A', sourceQuestionId: 'q2', tag: 'Neuro' };
    api.isAuthenticated.mockReturnValue(true);
    storage.appendFlashcards.mockReturnValueOnce(1);
    storage.getFlashcards
      .mockReturnValueOnce([])
      .mockReturnValueOnce([fcgCard])
      .mockReturnValueOnce([fcgCard]);
    api.flashcards.createMany.mockResolvedValueOnce({ flashcards: [] });

    await saveFlashcards([fcgCard]);

    expect(storage.saveFlashcards).not.toHaveBeenCalled();
  });
});

describe('syncLocalFlashcardsToBackend — _writeBackendIds (alpha.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.isAuthenticated.mockReturnValue(true);
    api.getCurrentUserId.mockReturnValue('user-123');
    api.flashcards.list.mockResolvedValue({ flashcards: [] });
    api.flashcards.createMany.mockResolvedValue({ flashcards: [] });
    try { localStorage.removeItem(FLAG_KEY);  } catch { /* ignore */ }
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  afterEach(() => {
    try { localStorage.removeItem(FLAG_KEY);  } catch { /* ignore */ }
    try { localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
  });

  it('writes backendId to local fcg_ card after successful sync', async () => {
    const fcgCard = { front: 'Q', back: 'A', sourceQuestionId: 'q1', tag: 'Bio' };
    const backendResponse = { flashcards: [{ id: 'uuid-new', source_question_id: 'q1', tag: 'Bio' }] };
    storage.getFlashcards
      .mockReturnValueOnce([fcgCard])  // localCards
      .mockReturnValueOnce([fcgCard]); // _writeBackendIds read
    api.flashcards.createMany.mockResolvedValueOnce(backendResponse);

    await syncLocalFlashcardsToBackend();

    expect(storage.saveFlashcards).toHaveBeenCalledOnce();
    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].backendId).toBe('uuid-new');
  });

  it('uses sourceQuestionId ?? id fallback when sourceQuestionId is absent', async () => {
    // Card was sent to backend with source_question_id = c.id (the fcg_ id) fallback
    const fcgCard = { id: 'fcg_nqid', front: 'Q', back: 'A', tag: 'Bio' };
    const backendResponse = { flashcards: [{ id: 'uuid-match', source_question_id: 'fcg_nqid', tag: 'Bio' }] };
    storage.getFlashcards
      .mockReturnValueOnce([fcgCard])
      .mockReturnValueOnce([fcgCard]);
    api.flashcards.createMany.mockResolvedValueOnce(backendResponse);

    await syncLocalFlashcardsToBackend();

    const saved = storage.saveFlashcards.mock.calls[0][0];
    expect(saved[0].backendId).toBe('uuid-match');
  });
});
