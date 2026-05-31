import type { Pool, PoolClient } from 'pg';
import type { ReviewStats } from '../../types/index.js';
import type { IConceptReviewLogRepository } from '../interfaces.js';

export class PgConceptReviewLogRepository implements IConceptReviewLogRepository {
  constructor(private pool: Pool) {}

  async insert(
    entry: {
      userId:         string;
      conceptId:      string;
      result:         'again' | 'hard' | 'good' | 'easy';
      intervalBefore: number;
      intervalAfter:  number;
    },
    tx?: unknown,
  ): Promise<void> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    await q.query(
      `INSERT INTO concept_review_log
         (user_id, concept_id, result, interval_before, interval_after)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.userId, entry.conceptId, entry.result, entry.intervalBefore, entry.intervalAfter],
    );
  }

  async getStats(userId: string): Promise<ReviewStats> {
    // Single query: today counts by ease + week total + distinct review dates (last 366d).
    // Streak and totalReviewed are computed from the result set in TypeScript.
    const res = await this.pool.query<{
      again:       string;
      hard:        string;
      good:        string;
      easy:        string;
      today_total: string;
      week_total:  string;
      total:       string;
      days_asc:    string; // comma-separated YYYY-MM-DD, oldest first
    }>(
      `WITH log AS (
         SELECT result,
                reviewed_at::date AS review_date
         FROM   concept_review_log
         WHERE  user_id    = $1
           AND  reviewed_at >= NOW() - INTERVAL '366 days'
       ),
       today AS (
         SELECT
           COUNT(*) FILTER (WHERE result = 'again') AS again,
           COUNT(*) FILTER (WHERE result = 'hard')  AS hard,
           COUNT(*) FILTER (WHERE result = 'good')  AS good,
           COUNT(*) FILTER (WHERE result = 'easy')  AS easy,
           COUNT(*)                                  AS today_total
         FROM log
         WHERE review_date = CURRENT_DATE
       ),
       week AS (
         SELECT COUNT(*) AS week_total
         FROM log
         WHERE review_date >= CURRENT_DATE - 6
       ),
       total AS (
         SELECT COUNT(DISTINCT concept_id) AS total
         FROM   concept_review_log
         WHERE  user_id = $1
       ),
       days AS (
         SELECT string_agg(review_date::text, ',' ORDER BY review_date ASC) AS days_asc
         FROM  (SELECT DISTINCT review_date FROM log) d
       )
       SELECT t.again, t.hard, t.good, t.easy, t.today_total,
              w.week_total, tot.total, d.days_asc
       FROM today t, week w, total tot, days d`,
      [userId],
    );

    const row = res.rows[0];
    if (!row) {
      return { reviewedToday: 0, reviewedThisWeek: 0, currentStreak: 0, totalReviewed: 0, todayBreakdown: { again: 0, hard: 0, good: 0, easy: 0 } };
    }

    const currentStreak = computeStreak(row.days_asc ?? '');

    return {
      reviewedToday:    Number(row.today_total),
      reviewedThisWeek: Number(row.week_total),
      currentStreak,
      totalReviewed:    Number(row.total),
      todayBreakdown: {
        again: Number(row.again),
        hard:  Number(row.hard),
        good:  Number(row.good),
        easy:  Number(row.easy),
      },
    };
  }
}

function computeStreak(daysAsc: string): number {
  if (!daysAsc) return 0;
  const days = new Set(daysAsc.split(','));
  const today = new Date();
  let streak = 0;
  const d = new Date(today);
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
