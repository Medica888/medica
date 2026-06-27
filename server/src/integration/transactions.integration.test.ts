import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgExamSessionsRepository } from '../repositories/pg/ExamSessionsRepository.js';
import { PgQuestionAttemptsRepository } from '../repositories/pg/QuestionAttemptsRepository.js';
import { createTestPool, truncateAll, makeUser } from './helpers.js';

describe('PostgreSQL transaction rollback — integration', () => {
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

  it('rolls back a session insert when a subsequent constraint violation occurs', async () => {
    const user = await usersRepo.create(makeUser({ email: 'tx1@test.com' }));

    const client: PoolClient = await pool.connect();
    let threw = false;
    try {
      await client.query('BEGIN');

      // Insert a valid session — would succeed on its own.
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO exam_sessions
           (id, user_id, mode, completed_at)
         VALUES ($1, $2, 'exam', now())`,
        [sessionId, user.id],
      );

      // Force a unique-constraint violation: same email as the user above.
      // LOWER('TX1@TEST.COM') = LOWER('tx1@test.com') → triggers users_email_lower_unique index.
      await client.query(
        `INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, $2, 'dup', 'hash')`,
        [randomUUID(), 'TX1@TEST.COM'],
      );

      await client.query('COMMIT');
    } catch {
      threw = true;
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    expect(threw).toBe(true);

    // The session insert must be rolled back — it should not exist.
    const sessions = await sessionsRepo.findByUserId(user.id);
    expect(sessions.data).toHaveLength(0);
  });

  it('commits all writes when no error occurs', async () => {
    const user = await usersRepo.create(makeUser({ email: 'tx2@test.com' }));

    const client: PoolClient = await pool.connect();
    let sessionId!: string;
    try {
      await client.query('BEGIN');

      sessionId = randomUUID();
      await client.query(
        `INSERT INTO exam_sessions (id, user_id, mode, completed_at) VALUES ($1, $2, 'practice', now())`,
        [sessionId, user.id],
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
      throw new Error('unexpected error in commit test');
    } finally {
      client.release();
    }

    const found = await sessionsRepo.findById(sessionId);
    expect(found?.id).toBe(sessionId);
  });

  it('session + attempts written atomically via client tx — both visible or neither', async () => {
    const user = await usersRepo.create(makeUser({ email: 'tx3@test.com' }));

    const client: PoolClient = await pool.connect();
    const sessionId = randomUUID();
    const now = new Date();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO exam_sessions (id, user_id, mode, completed_at) VALUES ($1, $2, 'coach', now())`,
        [sessionId, user.id],
      );

      // Write attempts using the repository's tx parameter (passes the client through)
      await attemptsRepo.createMany(
        [
          {
            user_id: user.id, session_id: sessionId, question_id: 'q1',
            selected_answer: 'A', is_correct: true, time_spent_seconds: 20,
            attempted_at: now, question_ref_id: null,
          },
        ],
        client,
      );

      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const session = await sessionsRepo.findById(sessionId);
    expect(session).not.toBeNull();

    const attempts = await attemptsRepo.findBySessionId(sessionId);
    expect(attempts).toHaveLength(1);
  });

  it('FK constraint: inserting attempt for non-existent session is rejected', async () => {
    const user = await usersRepo.create(makeUser({ email: 'fk@test.com' }));
    await expect(
      attemptsRepo.createMany([
        {
          user_id: user.id,
          session_id: randomUUID(), // no such session in DB
          question_id: 'q1',
          selected_answer: 'A',
          is_correct: false,
          time_spent_seconds: 10,
          attempted_at: new Date(),
          question_ref_id: null,
        },
      ]),
    ).rejects.toThrow();
  });
});
