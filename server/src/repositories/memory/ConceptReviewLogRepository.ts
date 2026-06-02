import { randomUUID } from 'crypto';
import type { ReviewStats, ConceptReviewEntry } from '../../types/index.js';
import type { IConceptReviewLogRepository } from '../interfaces.js';

interface LogRow {
  id:              string;
  user_id:         string;
  concept_id:      string;
  result:          'again' | 'hard' | 'good' | 'easy';
  interval_before: number;
  interval_after:  number;
  reviewed_at:     Date;
}

export class InMemoryConceptReviewLogRepository implements IConceptReviewLogRepository {
  private rows: LogRow[] = [];

  async insert(
    entry: {
      userId:         string;
      conceptId:      string;
      result:         'again' | 'hard' | 'good' | 'easy';
      intervalBefore: number;
      intervalAfter:  number;
    },
    _tx?: unknown,
  ): Promise<void> {
    this.rows.push({
      id:              randomUUID(),
      user_id:         entry.userId,
      concept_id:      entry.conceptId,
      result:          entry.result,
      interval_before: entry.intervalBefore,
      interval_after:  entry.intervalAfter,
      reviewed_at:     new Date(),
    });
  }

  async getStats(userId: string): Promise<ReviewStats> {
    const userRows = this.rows.filter((r) => r.user_id === userId);
    if (!userRows.length) {
      return {
        reviewedToday: 0, reviewedThisWeek: 0, currentStreak: 0, totalReviewed: 0,
        todayBreakdown: { again: 0, hard: 0, good: 0, easy: 0 },
        longestStreak: 0, activeDaysThisWeek: 0,
        dailyGoal: DAILY_GOAL, goalProgress: 0, activity30Days: [],
      };
    }

    const todayStr  = new Date().toISOString().slice(0, 10);
    const weekAgo   = new Date(Date.now() - 6  * 24 * 60 * 60 * 1000);
    const thirtyAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);

    const todayRows  = userRows.filter((r) => r.reviewed_at.toISOString().slice(0, 10) === todayStr);
    const weekRows   = userRows.filter((r) => r.reviewed_at >= weekAgo);
    const thirtyRows = userRows.filter((r) => r.reviewed_at >= thirtyAgo);

    const breakdown = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const r of todayRows) breakdown[r.result]++;

    const allDays = new Set(userRows.map((r) => r.reviewed_at.toISOString().slice(0, 10)));
    const currentStreak = computeStreak(allDays);
    const longestStreak = computeLongestStreak(allDays);

    const activeDaysThisWeek = new Set(
      weekRows.map((r) => r.reviewed_at.toISOString().slice(0, 10))
    ).size;

    const totalReviewed = new Set(userRows.map((r) => r.concept_id)).size;

    // Per-day counts for the last 30 days
    const actMap = new Map<string, number>();
    for (const r of thirtyRows) {
      const day = r.reviewed_at.toISOString().slice(0, 10);
      actMap.set(day, (actMap.get(day) ?? 0) + 1);
    }
    const activity30Days = [...actMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, reviews]) => ({ date, reviews }));

    return {
      reviewedToday:      todayRows.length,
      reviewedThisWeek:   weekRows.length,
      currentStreak,
      totalReviewed,
      todayBreakdown:     breakdown,
      longestStreak,
      activeDaysThisWeek,
      dailyGoal:          DAILY_GOAL,
      goalProgress:       todayRows.length,
      activity30Days,
    };
  }

  async getConceptHistory(
    userId:    string,
    conceptId: string,
    limit = 50,
  ): Promise<ConceptReviewEntry[]> {
    return this.rows
      .filter((r) => r.user_id === userId && r.concept_id === conceptId)
      .sort((a, b) => b.reviewed_at.getTime() - a.reviewed_at.getTime())
      .slice(0, limit)
      .map((r) => ({
        result:         r.result,
        reviewedAt:     r.reviewed_at.toISOString(),
        intervalBefore: r.interval_before,
        intervalAfter:  r.interval_after,
      }));
  }

  _clear(): void { this.rows = []; }
  _getAll(): LogRow[] { return [...this.rows]; }
}

const DAILY_GOAL = 20;

function computeStreak(days: Set<string>): number {
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

function computeLongestStreak(days: Set<string>): number {
  const sorted = [...days].sort();
  if (sorted.length === 0) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]!);
    const curr = new Date(sorted[i]!);
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
