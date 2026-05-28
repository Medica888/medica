import { randomUUID } from 'crypto';
import type { Pool, QueryResultRow } from 'pg';
import type { AnalyticsSnapshot } from '../../types/index.js';
import type { IAnalyticsRepository } from '../interfaces.js';

interface SnapshotRow extends QueryResultRow {
  id: string;
  user_id: string;
  snapshot_date: Date;
  total_sessions: number;
  average_score: number;
  subject_mastery: Record<string, number>;
  system_mastery: Record<string, number>;
  weak_areas: string[];
  study_priorities: AnalyticsSnapshot['study_priorities'];
  mistake_diagnoses: AnalyticsSnapshot['mistake_diagnoses'];
}

function toSnapshot(row: SnapshotRow): AnalyticsSnapshot {
  return {
    id: row.id,
    user_id: row.user_id,
    snapshot_date: row.snapshot_date,
    total_sessions: Number(row.total_sessions),
    average_score: Number(row.average_score),
    subject_mastery: row.subject_mastery,
    system_mastery: row.system_mastery,
    weak_areas: row.weak_areas,
    study_priorities: row.study_priorities,
    mistake_diagnoses: row.mistake_diagnoses,
  };
}

export class PgAnalyticsRepository implements IAnalyticsRepository {
  constructor(private pool: Pool) {}

  async findLatestByUserId(userId: string): Promise<AnalyticsSnapshot | null> {
    const res = await this.pool.query<SnapshotRow>(
      `SELECT * FROM analytics_snapshots
       WHERE user_id = $1
       ORDER BY snapshot_date DESC
       LIMIT 1`,
      [userId],
    );
    return res.rows[0] ? toSnapshot(res.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<AnalyticsSnapshot[]> {
    const res = await this.pool.query<SnapshotRow>(
      'SELECT * FROM analytics_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC',
      [userId],
    );
    return res.rows.map(toSnapshot);
  }

  async upsert(snapshot: Omit<AnalyticsSnapshot, 'id'>): Promise<AnalyticsSnapshot> {
    const id = randomUUID();
    // ON CONFLICT relies on the unique index: analytics_snapshots_user_date_uniq
    // (user_id, (snapshot_date::date)) — created by migration 1748300000003
    const res = await this.pool.query<SnapshotRow>(
      `INSERT INTO analytics_snapshots
         (id, user_id, snapshot_date, total_sessions, average_score,
          subject_mastery, system_mastery, weak_areas, study_priorities, mistake_diagnoses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (user_id, (snapshot_date::date))
       DO UPDATE SET
         snapshot_date     = EXCLUDED.snapshot_date,
         total_sessions    = EXCLUDED.total_sessions,
         average_score     = EXCLUDED.average_score,
         subject_mastery   = EXCLUDED.subject_mastery,
         system_mastery    = EXCLUDED.system_mastery,
         weak_areas        = EXCLUDED.weak_areas,
         study_priorities  = EXCLUDED.study_priorities,
         mistake_diagnoses = EXCLUDED.mistake_diagnoses
       RETURNING *`,
      [
        id,
        snapshot.user_id,
        snapshot.snapshot_date,
        snapshot.total_sessions,
        snapshot.average_score,
        JSON.stringify(snapshot.subject_mastery),
        JSON.stringify(snapshot.system_mastery),
        JSON.stringify(snapshot.weak_areas),
        JSON.stringify(snapshot.study_priorities),
        JSON.stringify(snapshot.mistake_diagnoses),
      ],
    );
    return toSnapshot(res.rows[0]!);
  }
}
