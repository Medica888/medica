import { randomUUID } from 'crypto';
import type { Pool, PoolClient } from 'pg';
import type { QuestionAttempt } from '../../types/index.js';
import type { IQuestionAttemptsRepository } from '../interfaces.js';

export class PgQuestionAttemptsRepository implements IQuestionAttemptsRepository {
  constructor(private pool: Pool) {}

  async findBySessionId(sessionId: string): Promise<QuestionAttempt[]> {
    const res = await this.pool.query<QuestionAttempt>(
      'SELECT * FROM question_attempts WHERE session_id = $1 ORDER BY attempted_at',
      [sessionId],
    );
    return res.rows;
  }

  async findByUserId(userId: string, limit = 500): Promise<QuestionAttempt[]> {
    const res = await this.pool.query<QuestionAttempt>(
      'SELECT * FROM question_attempts WHERE user_id = $1 ORDER BY attempted_at LIMIT $2',
      [userId, limit],
    );
    return res.rows;
  }

  async createMany(attempts: Omit<QuestionAttempt, 'id'>[], tx?: unknown): Promise<QuestionAttempt[]> {
    if (!attempts.length) return [];

    const ids = attempts.map(() => randomUUID());
    const q = (tx as PoolClient | undefined) ?? null;

    // question_ref_id requires migration 001 to be applied (additive nullable column)
    const sql = `
      INSERT INTO question_attempts
        (id, user_id, session_id, question_id, selected_answer,
         is_correct, time_spent_seconds, attempted_at, question_ref_id)
      SELECT
        unnest($1::uuid[]),
        unnest($2::uuid[]),
        unnest($3::uuid[]),
        unnest($4::text[]),
        unnest($5::text[]),
        unnest($6::boolean[]),
        unnest($7::integer[]),
        unnest($8::timestamptz[]),
        unnest($9::uuid[])
      RETURNING *`;

    const params = [
      ids,
      attempts.map((a) => a.user_id),
      attempts.map((a) => a.session_id),
      attempts.map((a) => a.question_id),
      attempts.map((a) => a.selected_answer),
      attempts.map((a) => a.is_correct),
      attempts.map((a) => a.time_spent_seconds),
      attempts.map((a) => a.attempted_at),
      attempts.map((a) => a.question_ref_id ?? null),
    ];

    if (q) {
      const res = await q.query<QuestionAttempt>(sql, params);
      return res.rows;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<QuestionAttempt>(sql, params);
      await client.query('COMMIT');
      return res.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
