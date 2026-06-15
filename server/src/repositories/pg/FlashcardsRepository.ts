import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { Flashcard } from '../../types/index.js';
import type { IFlashcardsRepository, FlashcardSrsUpdate } from '../interfaces.js';

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
         (id, user_id, source_question_id, type, front, back, tag, review_status,
          subject, system, topic, canonical_topic, topic_slug, source_mode,
          memory_anchor, common_trap, source_pearl, weak_spot_category,
          reinforcement_priority, review_count, ease, last_missed_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [
        id,
        flashcard.user_id,
        flashcard.source_question_id,
        flashcard.type,
        flashcard.front,
        flashcard.back,
        flashcard.tag ?? '',
        flashcard.review_status,
        flashcard.subject ?? '',
        flashcard.system ?? '',
        flashcard.topic ?? '',
        flashcard.canonical_topic ?? '',
        flashcard.topic_slug ?? '',
        flashcard.source_mode ?? '',
        flashcard.memory_anchor ?? null,
        flashcard.common_trap ?? null,
        flashcard.source_pearl ?? null,
        flashcard.weak_spot_category ?? '',
        flashcard.reinforcement_priority ?? 'normal',
        flashcard.review_count ?? 0,
        flashcard.ease ?? null,
        flashcard.last_missed_reason ?? null,
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
           (id, user_id, source_question_id, type, front, back, tag, review_status,
            subject, system, topic, canonical_topic, topic_slug, source_mode,
            memory_anchor, common_trap, source_pearl, weak_spot_category,
            reinforcement_priority, review_count, ease, last_missed_reason)
         SELECT
           unnest($1::uuid[]),
           unnest($2::uuid[]),
           unnest($3::text[]),
           unnest($4::text[]),
           unnest($5::text[]),
           unnest($6::text[]),
           unnest($7::text[]),
           unnest($8::text[]),
           unnest($9::text[]),
           unnest($10::text[]),
           unnest($11::text[]),
           unnest($12::text[]),
           unnest($13::text[]),
           unnest($14::text[]),
           unnest($15::text[]),
           unnest($16::text[]),
           unnest($17::text[]),
           unnest($18::text[]),
           unnest($19::text[]),
           unnest($20::integer[]),
           unnest($21::text[]),
           unnest($22::text[])
         RETURNING *`,
        [
          ids,
          flashcards.map((f) => f.user_id),
          flashcards.map((f) => f.source_question_id ?? null),
          flashcards.map((f) => f.type),
          flashcards.map((f) => f.front),
          flashcards.map((f) => f.back),
          flashcards.map((f) => f.tag ?? ''),
          flashcards.map((f) => f.review_status),
          flashcards.map((f) => f.subject ?? ''),
          flashcards.map((f) => f.system ?? ''),
          flashcards.map((f) => f.topic ?? ''),
          flashcards.map((f) => f.canonical_topic ?? ''),
          flashcards.map((f) => f.topic_slug ?? ''),
          flashcards.map((f) => f.source_mode ?? ''),
          flashcards.map((f) => f.memory_anchor ?? null),
          flashcards.map((f) => f.common_trap ?? null),
          flashcards.map((f) => f.source_pearl ?? null),
          flashcards.map((f) => f.weak_spot_category ?? ''),
          flashcards.map((f) => f.reinforcement_priority ?? 'normal'),
          flashcards.map((f) => f.review_count ?? 0),
          flashcards.map((f) => f.ease ?? null),
          flashcards.map((f) => f.last_missed_reason ?? null),
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

  async markReviewed(id: string, userId: string, srs: FlashcardSrsUpdate): Promise<Flashcard | null> {
    const res = await this.pool.query<Flashcard>(
      `UPDATE flashcards
       SET reviewed_at   = $3,
           review_count  = $4,
           review_status = $5,
           ease          = $6,
           interval_days = $7,
           next_review   = $8
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId, srs.reviewed_at, srs.review_count, srs.review_status, srs.ease, srs.interval_days, srs.next_review],
    );
    return res.rows[0] ?? null;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const res = await this.pool.query('DELETE FROM flashcards WHERE user_id = $1', [userId]);
    return res.rowCount ?? 0;
  }
}
