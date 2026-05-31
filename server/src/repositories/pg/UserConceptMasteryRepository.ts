import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { UserConceptMastery } from '../../types/index.js';
import type { IUserConceptMasteryRepository } from '../interfaces.js';

interface MasteryRow extends QueryResultRow {
  user_id:                string;
  concept_id:             string;
  attempts:               number;
  correct:                number;
  mastery_score:          string; // pg returns numeric as string
  confidence_score:       string;
  recent_incorrect_count: number;
  last_seen_at:           Date;
  created_at:             Date;
  updated_at:             Date;
}

function toMastery(row: MasteryRow): UserConceptMastery {
  return {
    user_id:                row.user_id,
    concept_id:             row.concept_id,
    attempts:               Number(row.attempts),
    correct:                Number(row.correct),
    mastery_score:          Number(row.mastery_score),
    confidence_score:       Number(row.confidence_score),
    recent_incorrect_count: Number(row.recent_incorrect_count),
    last_seen_at:           row.last_seen_at,
    created_at:             row.created_at,
    updated_at:             row.updated_at,
  };
}

export class PgUserConceptMasteryRepository implements IUserConceptMasteryRepository {
  constructor(private pool: Pool) {}

  async upsertMany(
    records: { userId: string; conceptId: string; attempted: number; correct: number }[],
    tx?: unknown,
  ): Promise<void> {
    if (!records.length) return;
    const q = (tx as PoolClient | undefined) ?? this.pool;
    await q.query(
      // mastery_score    = correct / attempts
      // confidence_score = LEAST(attempts / 5, 1.0) — saturates at 5 attempts
      // recent_incorrect_count = attempts - correct (total wrong; windowing deferred)
      `INSERT INTO user_concept_mastery
         (user_id, concept_id, attempts, correct,
          mastery_score, confidence_score, recent_incorrect_count,
          last_seen_at, updated_at)
       SELECT u, c, a, r,
              CASE WHEN a > 0 THEN ROUND(r::numeric / a, 4) ELSE 0 END,
              ROUND(LEAST(a::numeric / 5, 1.0), 4),
              a - r,
              now(), now()
       FROM unnest($1::uuid[], $2::uuid[], $3::int[], $4::int[]) AS t(u, c, a, r)
       ON CONFLICT (user_id, concept_id) DO UPDATE SET
         attempts               = user_concept_mastery.attempts + EXCLUDED.attempts,
         correct                = user_concept_mastery.correct  + EXCLUDED.correct,
         mastery_score          = CASE
                                    WHEN (user_concept_mastery.attempts + EXCLUDED.attempts) > 0
                                    THEN ROUND(
                                           (user_concept_mastery.correct + EXCLUDED.correct)::numeric /
                                           (user_concept_mastery.attempts + EXCLUDED.attempts),
                                           4)
                                    ELSE 0
                                  END,
         confidence_score       = ROUND(
                                    LEAST(
                                      (user_concept_mastery.attempts + EXCLUDED.attempts)::numeric / 5,
                                      1.0),
                                    4),
         recent_incorrect_count = (user_concept_mastery.attempts + EXCLUDED.attempts) -
                                  (user_concept_mastery.correct  + EXCLUDED.correct),
         last_seen_at           = EXCLUDED.last_seen_at,
         updated_at             = EXCLUDED.updated_at`,
      [
        records.map((r) => r.userId),
        records.map((r) => r.conceptId),
        records.map((r) => r.attempted),
        records.map((r) => r.correct),
      ],
    );
  }

  async findByUserId(userId: string): Promise<UserConceptMastery[]> {
    const res = await this.pool.query<MasteryRow>(
      'SELECT * FROM user_concept_mastery WHERE user_id = $1 ORDER BY mastery_score DESC LIMIT 2000',
      [userId],
    );
    return res.rows.map(toMastery);
  }

  async findByUserAndConcept(userId: string, conceptId: string): Promise<UserConceptMastery | null> {
    const res = await this.pool.query<MasteryRow>(
      'SELECT * FROM user_concept_mastery WHERE user_id = $1 AND concept_id = $2',
      [userId, conceptId],
    );
    return res.rows[0] ? toMastery(res.rows[0]) : null;
  }
}
