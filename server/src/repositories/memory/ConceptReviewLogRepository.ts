import { randomUUID } from 'crypto';
import type { ReviewStats } from '../../types/index.js';
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
      return { reviewedToday: 0, reviewedThisWeek: 0, currentStreak: 0, totalReviewed: 0, todayBreakdown: { again: 0, hard: 0, good: 0, easy: 0 } };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAgo  = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

    const todayRows = userRows.filter((r) => r.reviewed_at.toISOString().slice(0, 10) === todayStr);
    const weekRows  = userRows.filter((r) => r.reviewed_at >= weekAgo);

    const breakdown = { again: 0, hard: 0, good: 0, easy: 0 };
    for (const r of todayRows) breakdown[r.result]++;

    const allDays = new Set(userRows.map((r) => r.reviewed_at.toISOString().slice(0, 10)));
    const currentStreak = computeStreak(allDays);

    const totalReviewed = new Set(userRows.map((r) => r.concept_id)).size;

    return {
      reviewedToday:    todayRows.length,
      reviewedThisWeek: weekRows.length,
      currentStreak,
      totalReviewed,
      todayBreakdown: breakdown,
    };
  }

  _clear(): void { this.rows = []; }
  _getAll(): LogRow[] { return [...this.rows]; }
}

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
