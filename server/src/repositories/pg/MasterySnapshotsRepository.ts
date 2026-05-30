import type { Pool, QueryResultRow } from 'pg';
import type { MasterySnapshot } from '../../types/index.js';
import type { IMasterySnapshotsRepository } from '../interfaces.js';

interface SnapshotRow extends QueryResultRow {
  id:            string;
  user_id:       string;
  concept_id:    string;
  session_id:    string;
  mastery_score: string; // pg returns numeric as string
  confidence:    string;
  attempt_count: number;
  created_at:    Date;
}

function toSnapshot(row: SnapshotRow): MasterySnapshot {
  return {
    id:            row.id,
    user_id:       row.user_id,
    concept_id:    row.concept_id,
    session_id:    row.session_id,
    mastery_score: Number(row.mastery_score),
    confidence:    Number(row.confidence),
    attempt_count: Number(row.attempt_count),
    created_at:    row.created_at,
  };
}

export class PgMasterySnapshotsRepository implements IMasterySnapshotsRepository {
  constructor(private pool: Pool) {}

  async insertBatch(
    snapshots: {
      userId:       string;
      conceptId:    string;
      sessionId:    string;
      masteryScore: number;
      confidence:   number;
      attemptCount: number;
    }[],
  ): Promise<void> {
    if (!snapshots.length) return;
    await this.pool.query(
      `INSERT INTO mastery_snapshots
         (user_id, concept_id, session_id, mastery_score, confidence, attempt_count)
       SELECT unnest($1::uuid[]), unnest($2::uuid[]), unnest($3::uuid[]),
              unnest($4::numeric[]), unnest($5::numeric[]), unnest($6::int[])`,
      [
        snapshots.map((s) => s.userId),
        snapshots.map((s) => s.conceptId),
        snapshots.map((s) => s.sessionId),
        snapshots.map((s) => s.masteryScore),
        snapshots.map((s) => s.confidence),
        snapshots.map((s) => s.attemptCount),
      ],
    );
  }

  async findByUserId(userId: string): Promise<MasterySnapshot[]> {
    const res = await this.pool.query<SnapshotRow>(
      'SELECT * FROM mastery_snapshots WHERE user_id = $1 ORDER BY created_at ASC',
      [userId],
    );
    return res.rows.map(toSnapshot);
  }

  async findBatchIds(userId: string): Promise<string[]> {
    const res = await this.pool.query<{ session_id: string }>(
      `SELECT session_id
       FROM   mastery_snapshots
       WHERE  user_id = $1
       GROUP  BY session_id
       ORDER  BY MIN(created_at) ASC`,
      [userId],
    );
    return res.rows.map((r) => r.session_id);
  }

  async findByBatch(userId: string, sessionId: string): Promise<MasterySnapshot[]> {
    const res = await this.pool.query<SnapshotRow>(
      'SELECT * FROM mastery_snapshots WHERE user_id = $1 AND session_id = $2',
      [userId, sessionId],
    );
    return res.rows.map(toSnapshot);
  }
}
