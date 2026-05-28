import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { Flashcard } from '../../types/index.js';
import type { IFlashcardsRepository } from '../interfaces.js';

export class PgFlashcardsRepository implements IFlashcardsRepository {
  constructor(private pool: Pool) {}

  async findByUserId(userId: string): Promise<Flashcard[]> {
    const res = await this.pool.query<Flashcard>(
      'SELECT * FROM flashcards WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return res.rows;
  }

  async findById(id: string): Promise<Flashcard | null> {
    const res = await this.pool.query<Flashcard>(
      'SELECT * FROM flashcards WHERE id = $1',
      [id],
    );
    return res.rows[0] ?? null;
  }

  async create(flashcard: Omit<Flashcard, 'id' | 'created_at'>): Promise<Flashcard> {
    const id = randomUUID();
    const res = await this.pool.query<Flashcard>(
      `INSERT INTO flashcards
         (id, user_id, source_question_id, type, front, back, tag, review_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        id,
        flashcard.user_id,
        flashcard.source_question_id,
        flashcard.type,
        flashcard.front,
        flashcard.back,
        flashcard.tag,
        flashcard.review_status,
      ],
    );
    return res.rows[0]!;
  }

  async createMany(flashcards: Omit<Flashcard, 'id' | 'created_at'>[]): Promise<Flashcard[]> {
    if (!flashcards.length) return [];

    const ids = flashcards.map(() => randomUUID());
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<Flashcard>(
        `INSERT INTO flashcards
           (id, user_id, source_question_id, type, front, back, tag, review_status)
         SELECT
           unnest($1::uuid[]),
           unnest($2::uuid[]),
           unnest($3::text[]),
           unnest($4::text[]),
           unnest($5::text[]),
           unnest($6::text[]),
           unnest($7::text[]),
           unnest($8::text[])
         RETURNING *`,
        [
          ids,
          flashcards.map((f) => f.user_id),
          flashcards.map((f) => f.source_question_id ?? null),
          flashcards.map((f) => f.type),
          flashcards.map((f) => f.front),
          flashcards.map((f) => f.back),
          flashcards.map((f) => f.tag ?? null),
          flashcards.map((f) => f.review_status),
        ],
      );
      await client.query('COMMIT');
      return res.rows;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateStatus(id: string, userId: string, status: Flashcard['review_status']): Promise<Flashcard | null> {
    const res = await this.pool.query<Flashcard>(
      'UPDATE flashcards SET review_status = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId, status],
    );
    return res.rows[0] ?? null;
  }

  async markReviewed(id: string, userId: string): Promise<Flashcard | null> {
    const res = await this.pool.query<Flashcard>(
      `UPDATE flashcards
       SET reviewed_at = NOW(),
           review_status = CASE WHEN review_status = 'new' THEN 'learning' ELSE review_status END
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId],
    );
    return res.rows[0] ?? null;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const res = await this.pool.query('DELETE FROM flashcards WHERE user_id = $1', [userId]);
    return res.rowCount ?? 0;
  }
}
