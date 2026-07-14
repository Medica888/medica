import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgExamSessionsRepository } from '../repositories/pg/ExamSessionsRepository.js';
import { PgQuestionAttemptsRepository } from '../repositories/pg/QuestionAttemptsRepository.js';
import { PgExamSessionReservationsRepository } from '../repositories/pg/ExamSessionReservationsRepository.js';
import { questionFromAuthoritativeBody } from '../services/ExamService.js';
import { shuffleQuestionForExam, toStudentExamQuestion } from '../lib/examStudentView.js';
import { createTestPool, truncateAll, makeUser } from './helpers.js';
import type { ExamSession, Question } from '../types/index.js';

function makeSession(userId: string, overrides: Partial<Omit<ExamSession, 'id'>> = {}): Omit<ExamSession, 'id'> {
  return {
    user_id:          userId,
    mode:             'practice',
    questions:        [],
    answers:          {},
    score:            8,
    percentage:       80,
    medica_score:     75,
    readiness_label:  'Developing',
    subject_breakdown: {},
    system_breakdown:  {},
    missed_questions:  [],
    completed_at:     new Date(),
    duration_seconds: 300,
    difficulty:       'Balanced',
    ...overrides,
  };
}

describe('PgExamSessionsRepository + PgQuestionAttemptsRepository — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let sessionsRepo: PgExamSessionsRepository;
  let attemptsRepo: PgQuestionAttemptsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo    = new PgUsersRepository(pool);
    sessionsRepo = new PgExamSessionsRepository(pool);
    attemptsRepo = new PgQuestionAttemptsRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('creates a session and retrieves it by id', async () => {
    const user = await usersRepo.create(makeUser({ email: 'sess1@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));

    expect(session.id).toBeTruthy();
    expect(session.user_id).toBe(user.id);
    expect(session.score).toBe(8);
    expect(session.mode).toBe('practice');

    const found = await sessionsRepo.findById(session.id);
    expect(found?.id).toBe(session.id);
  });

  it('findByUserId returns paginated results', async () => {
    const user = await usersRepo.create(makeUser({ email: 'paged@test.com' }));
    await sessionsRepo.create(makeSession(user.id));
    await sessionsRepo.create(makeSession(user.id));
    await sessionsRepo.create(makeSession(user.id));

    const page1 = await sessionsRepo.findByUserId(user.id, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await sessionsRepo.findByUserId(user.id, { page: 2, limit: 2 });
    expect(page2.data).toHaveLength(1);
  });

  it('findByUserId returns empty result for user with no sessions', async () => {
    const user = await usersRepo.create(makeUser({ email: 'empty@test.com' }));
    const result = await sessionsRepo.findByUserId(user.id);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('findById returns null for wrong owner (cross-user isolation)', async () => {
    const u1 = await usersRepo.create(makeUser({ email: 'owner@test.com' }));
    const u2 = await usersRepo.create(makeUser({ email: 'attacker@test.com' }));
    const session = await sessionsRepo.create(makeSession(u1.id));

    // A different user's sessions do not include u1's session
    const result = await sessionsRepo.findByUserId(u2.id);
    const ids = result.data.map(s => s.id);
    expect(ids).not.toContain(session.id);
  });

  it('createMany attempts persists all attempt rows atomically', async () => {
    const user = await usersRepo.create(makeUser({ email: 'attempts@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));

    const now = new Date();
    const result = await attemptsRepo.createMany([
      {
        user_id: user.id, session_id: session.id, question_id: 'q1',
        selected_answer: 'A', is_correct: true, time_spent_seconds: 45,
        attempted_at: now, question_ref_id: null,
      },
      {
        user_id: user.id, session_id: session.id, question_id: 'q2',
        selected_answer: 'B', is_correct: false, time_spent_seconds: 60,
        attempted_at: now, question_ref_id: null,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].question_id).toBe('q1');
    expect(result[1].question_id).toBe('q2');

    const fetched = await attemptsRepo.findBySessionId(session.id);
    expect(fetched).toHaveLength(2);
  });

  it('findByUserId limit is respected', async () => {
    const user = await usersRepo.create(makeUser({ email: 'limit@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    const now = new Date();

    // Insert 3 attempts, fetch with limit 2
    await attemptsRepo.createMany([
      { user_id: user.id, session_id: session.id, question_id: 'q1', selected_answer: 'A', is_correct: true, time_spent_seconds: 10, attempted_at: now, question_ref_id: null },
      { user_id: user.id, session_id: session.id, question_id: 'q2', selected_answer: 'B', is_correct: false, time_spent_seconds: 15, attempted_at: now, question_ref_id: null },
      { user_id: user.id, session_id: session.id, question_id: 'q3', selected_answer: 'C', is_correct: true, time_spent_seconds: 20, attempted_at: now, question_ref_id: null },
    ]);

    const limited = await attemptsRepo.findByUserId(user.id, 2);
    expect(limited).toHaveLength(2);
  });

  it('delete removes the session', async () => {
    const user = await usersRepo.create(makeUser({ email: 'delete@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));

    const deleted = await sessionsRepo.delete(session.id);
    expect(deleted).toBe(true);

    const found = await sessionsRepo.findById(session.id);
    expect(found).toBeNull();
  });

  it('ON DELETE CASCADE: deleting a user removes their sessions and attempts', async () => {
    const user = await usersRepo.create(makeUser({ email: 'cascade@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    await attemptsRepo.createMany([
      { user_id: user.id, session_id: session.id, question_id: 'q1', selected_answer: 'A', is_correct: true, time_spent_seconds: 5, attempted_at: new Date(), question_ref_id: null },
    ]);

    // Soft-delete the user, then hard-delete via pool to trigger FK cascade
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    const sessionCheck = await sessionsRepo.findById(session.id);
    expect(sessionCheck).toBeNull();

    const attemptsCheck = await attemptsRepo.findBySessionId(session.id);
    expect(attemptsCheck).toHaveLength(0);
  });
});

// ── PgExamSessionReservationsRepository — JSONB round-trip + retry idempotency ─

describe('PgExamSessionReservationsRepository — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let reservationsRepo: PgExamSessionReservationsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo = new PgUsersRepository(pool);
    reservationsRepo = new PgExamSessionReservationsRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  // A freshly-generated question body, shaped exactly like what routes/ai.ts
  // holds right before reservation — full taxonomy metadata plus an answer key.
  const freshGeneratedQuestion = {
    id:                'ai-fp-round-trip',
    stem:              'A patient presents with a finding requiring extended taxonomy metadata to round-trip.',
    options: [
      { letter: 'A', text: 'Correct mechanism' },
      { letter: 'B', text: 'Distractor B' },
      { letter: 'C', text: 'Distractor C' },
      { letter: 'D', text: 'Distractor D' },
    ],
    correct:           'A',
    explanation:       'Correct mechanism explains the vignette.',
    subject:           'Pharmacology',
    system:            'Cardiovascular',
    topic:             'Round Trip Topic',
    rawTopic:          'round trip raw topic',
    canonicalTopic:    'Round Trip Canonical Topic',
    topicSlug:         'round-trip-topic',
    topicSource:       'ai',
    questionAngle:     'round-trip-angle',
    usmleContentArea:  'Cardiovascular System',
    usmleSubdomain:    'Heart Failure Pharmacology',
    physicianTask:     'Patient Care: Diagnosis',
    difficulty:        'Balanced',
    testedConcept:     'Round Trip Concept',
    weakSpotCategory:  'Round Trip Weak Spot',
  };

  it('preserves every taxonomy field through the JSONB round-trip, and toStudentExamQuestion reconstructs a full sanitized view from the stored row', async () => {
    const user = await usersRepo.create(makeUser({ email: 'reservation-roundtrip@test.com' }));
    const clientSessionId = randomUUID();

    const shuffled = shuffleQuestionForExam(freshGeneratedQuestion as Record<string, unknown>);
    const emptyFallback: Question = { id: '', text: '', options: [], correct_answer: '' };
    const authoritative = questionFromAuthoritativeBody(
      shuffled.id as string,
      shuffled,
      { ...emptyFallback, id: shuffled.id as string },
    );

    await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [authoritative] });

    const found = await reservationsRepo.findByClientSessionId(user.id, clientSessionId);
    const stored = found!.questions[0]!;

    // Storage shape: plain string[] options (letter = array index), not {letter,text}[].
    expect(Array.isArray(stored.options)).toBe(true);
    expect(typeof stored.options[0]).toBe('string');
    expect(stored.correct_answer).toBeTruthy();

    // Every extended taxonomy field survives the write→JSONB→read round-trip,
    // even though several of them aren't declared on the Question interface.
    expect(stored.topic).toBe('Round Trip Topic');
    expect((stored as unknown as Record<string, unknown>).rawTopic).toBe('round trip raw topic');
    expect(stored.canonicalTopic).toBe('Round Trip Canonical Topic');
    expect(stored.topicSlug).toBe('round-trip-topic');
    expect(stored.topicSource).toBe('ai');
    expect(stored.questionAngle).toBe('round-trip-angle');
    expect((stored as unknown as Record<string, unknown>).usmleContentArea).toBe('Cardiovascular System');
    expect((stored as unknown as Record<string, unknown>).usmleSubdomain).toBe('Heart Failure Pharmacology');
    expect((stored as unknown as Record<string, unknown>).physicianTask).toBe('Patient Care: Diagnosis');
    expect(stored.testedConcept).toBe('Round Trip Concept');
    expect(stored.weakSpotCategory).toBe('Round Trip Weak Spot');

    // The retry response-construction path (routes/ai.ts's applyExamStudentView
    // on an idempotent hit) sanitizes directly from this stored shape — confirm
    // it reconstructs a full, correctly-lettered student view with no reveal fields.
    const studentView = toStudentExamQuestion(stored as unknown as Record<string, unknown>);
    expect(studentView.stem).toBe(freshGeneratedQuestion.stem);
    expect(studentView.options).toHaveLength(4);
    expect(studentView.options.map(o => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(studentView.options.map(o => o.text))).toEqual(
      new Set(['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D']),
    );
    expect(studentView.usmleContentArea).toBe('Cardiovascular System');
    expect(studentView.usmleSubdomain).toBe('Heart Failure Pharmacology');
    expect(studentView.physicianTask).toBe('Patient Care: Diagnosis');
    expect(studentView.rawTopic).toBe('round trip raw topic');
    expect(studentView).not.toHaveProperty('correct');
    expect(studentView).not.toHaveProperty('explanation');
  });

  it('a retry create() with a different shuffle returns the ORIGINAL row via ON CONFLICT, not the new one', async () => {
    const user = await usersRepo.create(makeUser({ email: 'reservation-retry@test.com' }));
    const clientSessionId = randomUUID();

    const first: Question = { ...freshGeneratedQuestion, options: ['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D'], correct_answer: 'A' } as unknown as Question;
    await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [first] });

    const differentShuffle: Question = { ...freshGeneratedQuestion, options: ['Distractor D', 'Correct mechanism', 'Distractor B', 'Distractor C'], correct_answer: 'B' } as unknown as Question;
    const retryResult = await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [differentShuffle] });

    // create()'s OWN return value must already reflect the original row — this
    // is what applyExamStudentView's fix relies on to avoid a second read.
    expect(retryResult.questions[0]!.options).toEqual(['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D']);
    expect(retryResult.questions[0]!.correct_answer).toBe('A');

    const found = await reservationsRepo.findByClientSessionId(user.id, clientSessionId);
    expect(found!.questions[0]!.options).toEqual(['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D']);
  });

  it('cross-user isolation: a reservation is only visible under its owning user id', async () => {
    const owner = await usersRepo.create(makeUser({ email: 'reservation-owner@test.com' }));
    const other = await usersRepo.create(makeUser({ email: 'reservation-other@test.com' }));
    const clientSessionId = randomUUID();

    await reservationsRepo.create({
      userId: owner.id,
      clientSessionId,
      questions: [{ ...freshGeneratedQuestion, options: ['A opt', 'B opt', 'C opt', 'D opt'], correct_answer: 'A' } as unknown as Question],
    });

    const asOther = await reservationsRepo.findByClientSessionId(other.id, clientSessionId);
    expect(asOther).toBeNull();

    const asOwner = await reservationsRepo.findByClientSessionId(owner.id, clientSessionId);
    expect(asOwner).not.toBeNull();
  });
});
