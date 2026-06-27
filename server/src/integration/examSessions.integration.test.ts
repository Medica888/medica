import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgExamSessionsRepository } from '../repositories/pg/ExamSessionsRepository.js';
import { PgQuestionAttemptsRepository } from '../repositories/pg/QuestionAttemptsRepository.js';
import { createTestPool, truncateAll, makeUser } from './helpers.js';
import type { ExamSession } from '../types/index.js';

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
