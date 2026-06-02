import type { Pool, PoolClient } from 'pg';
import type { ReviewStats, ConceptReviewEntry } from '../../types/index.js';
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
    // Single query: all stats in one round-trip via cross-joined CTEs.
    // activity_30 uses COALESCE so json_agg never returns null.
    const res = await this.pool.query<{
      again:         string;
      hard:          string;
      good:          string;
      easy:          string;
      today_total:   string;
      week_total:    string;
      total:         string;
      days_asc:      string | null;
      active_days:   string;
      activity_json: { date: string; reviews: number }[];
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
       ),
       active_days_week AS (
         SELECT COUNT(DISTINCT review_date) AS active_days
         FROM log
         WHERE review_date >= CURRENT_DATE - 6
       ),
       activity_30 AS (
         SELECT COALESCE(
           json_agg(
             json_build_object('date', review_date::text, 'reviews', cnt::int)
             ORDER BY review_date
           ),
           '[]'::json
         ) AS activity_json
         FROM (
           SELECT review_date, COUNT(*) AS cnt
           FROM log
           WHERE review_date >= CURRENT_DATE - 29
           GROUP BY review_date
         ) d
       )
       SELECT t.again, t.hard, t.good, t.easy, t.today_total,
              w.week_total, tot.total, d.days_asc,
              adw.active_days, a30.activity_json
       FROM today t, week w, total tot, days d, active_days_week adw, activity_30 a30`,
      [userId],
    );

    const row = res.rows[0];
    if (!row) {
      return {
        reviewedToday: 0, reviewedThisWeek: 0, currentStreak: 0, totalReviewed: 0,
        todayBreakdown: { again: 0, hard: 0, good: 0, easy: 0 },
        longestStreak: 0, activeDaysThisWeek: 0,
        dailyGoal: DAILY_GOAL, goalProgress: 0, activity30Days: [],
      };
    }

    const daysAsc       = row.days_asc ?? '';
    const currentStreak = computeStreak(daysAsc);
    const longestStreak = computeLongestStreak(daysAsc);

    return {
      reviewedToday:      Number(row.today_total),
      reviewedThisWeek:   Number(row.week_total),
      currentStreak,
      totalReviewed:      Number(row.total),
      todayBreakdown: {
        again: Number(row.again),
        hard:  Number(row.hard),
        good:  Number(row.good),
        easy:  Number(row.easy),
      },
      longestStreak,
      activeDaysThisWeek: Number(row.active_days),
      dailyGoal:          DAILY_GOAL,
      goalProgress:       Number(row.today_total),
      activity30Days:     row.activity_json ?? [],
    };
  }

  async getConceptHistory(
    userId:    string,
    conceptId: string,
    limit = 50,
  ): Promise<ConceptReviewEntry[]> {
    const res = await this.pool.query<{
      result:          string;
      reviewed_at:     Date;
      interval_before: number;
      interval_after:  number;
    }>(
      `SELECT result, reviewed_at, interval_before, interval_after
       FROM concept_review_log
       WHERE user_id = $1 AND concept_id = $2
       ORDER BY reviewed_at DESC
       LIMIT $3`,
      [userId, conceptId, limit],
    );
    return res.rows.map((r) => ({
      result:         r.result as ConceptReviewEntry['result'],
      reviewedAt:     r.reviewed_at.toISOString(),
      intervalBefore: Number(r.interval_before),
      intervalAfter:  Number(r.interval_after),
    }));
  }
}

const DAILY_GOAL = 20;

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

function computeLongestStreak(daysAsc: string): number {
  if (!daysAsc) return 0;
  const dates = daysAsc.split(','); // already sorted ASC by the query
  let longest = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]!);
    const curr = new Date(dates[i]!);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
    if (diff === 1) {
      current++;
      if (current > longest) longest = current;
    } else {
      current = 1;
    }
  }
  return longest;
}
