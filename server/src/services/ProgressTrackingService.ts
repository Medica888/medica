import type { IUserConceptMasteryRepository, IMasterySnapshotsRepository } from '../repositories/interfaces.js';
import type { MasteryProgress, MasteryTrendPoint, MasterySnapshot } from '../types/index.js';

// Thresholds match adaptiveMasteryUtils.ts and AnalyticsDashboard.jsx
const TIER_PRIORITY_MAX   = 0.65; // priorityConcepts: mastery < 0.65
const TIER_FOCUS_MAX      = 0.75; // weakConcepts includes priority+focus: mastery < 0.75
const TIER_REINFORCED_MAX = 0.85;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function batchToTrendPoint(sessionId: string, rows: MasterySnapshot[]): MasteryTrendPoint {
  if (!rows.length) {
    return {
      sessionId, date: new Date().toISOString(),
      avgMastery: 0, totalConcepts: 0,
      priorityCount: 0, focusCount: 0, reinforcedCount: 0, ontrkCount: 0,
    };
  }
  const date = rows[0]!.created_at.toISOString();
  let sum = 0, priority = 0, focus = 0, reinforced = 0, ontrk = 0;
  for (const r of rows) {
    sum += r.mastery_score;
    const s = r.mastery_score;
    if      (s < TIER_PRIORITY_MAX)   priority++;
    else if (s < TIER_FOCUS_MAX)      focus++;
    else if (s < TIER_REINFORCED_MAX) reinforced++;
    else                               ontrk++;
  }
  return {
    sessionId,
    date,
    avgMastery:      round4(sum / rows.length),
    totalConcepts:   rows.length,
    priorityCount:   priority,
    focusCount:      focus,
    reinforcedCount: reinforced,
    ontrkCount:      ontrk,
  };
}

export class ProgressTrackingService {
  constructor(
    private mastery:   IUserConceptMasteryRepository,
    private snapshots: IMasterySnapshotsRepository,
  ) {}

  /**
   * Snapshot the user's full current mastery state after an exam.
   * One row per concept, all tagged with the same session_id.
   * Called fire-and-forget from the exam route — never throws to the caller.
   */
  async takeSnapshot(userId: string, sessionId: string): Promise<void> {
    const rows = await this.mastery.findByUserId(userId);
    if (!rows.length) return;
    await this.snapshots.insertBatch(
      rows.map((r) => ({
        userId,
        conceptId:    r.concept_id,
        sessionId,
        masteryScore: r.mastery_score,
        confidence:   r.confidence_score,
        attemptCount: r.attempts,
      })),
    );
  }

  /** Returns aggregate progress comparing the latest two batches. */
  async getProgress(userId: string): Promise<MasteryProgress> {
    const batchIds = await this.snapshots.findBatchIds(userId);
    const sessionCount = batchIds.length;

    if (sessionCount === 0) {
      return {
        currentMastery:   0,
        previousMastery:  null,
        improvement:      null,
        priorityConcepts: { current: 0, previous: null },
        weakConcepts:     { current: 0, previous: null },
        sessionCount:     0,
      };
    }

    const currentId  = batchIds[batchIds.length - 1]!;
    const previousId = batchIds.length >= 2 ? batchIds[batchIds.length - 2] : null;

    const [currentRows, previousRows] = await Promise.all([
      this.snapshots.findByBatch(userId, currentId),
      previousId ? this.snapshots.findByBatch(userId, previousId) : Promise.resolve([]),
    ]);

    const current  = batchToTrendPoint(currentId,  currentRows);
    const previous = previousId ? batchToTrendPoint(previousId, previousRows) : null;

    return {
      currentMastery:  current.avgMastery,
      previousMastery: previous ? previous.avgMastery : null,
      improvement:     previous ? round4(current.avgMastery - previous.avgMastery) : null,
      priorityConcepts: {
        current:  current.priorityCount,
        previous: previous ? previous.priorityCount : null,
      },
      weakConcepts: {
        current:  current.priorityCount + current.focusCount,
        previous: previous ? previous.priorityCount + previous.focusCount : null,
      },
      sessionCount,
    };
  }

  /** Chronological trend of aggregate mastery per exam batch. */
  async getMasteryTrend(userId: string): Promise<MasteryTrendPoint[]> {
    const batchIds = await this.snapshots.findBatchIds(userId);
    if (!batchIds.length) return [];
    const batches = await Promise.all(
      batchIds.map((id) => this.snapshots.findByBatch(userId, id)),
    );
    return batchIds.map((id, i) => batchToTrendPoint(id, batches[i]!));
  }

  /** Per-session weak (priority+focus) and priority concept counts. */
  async getWeakConceptTrend(userId: string): Promise<{ date: string; weakCount: number; priorityCount: number }[]> {
    const trend = await this.getMasteryTrend(userId);
    return trend.map((p) => ({
      date:          p.date,
      weakCount:     p.priorityCount + p.focusCount,
      priorityCount: p.priorityCount,
    }));
  }

  /**
   * Average mastery improvement per session (0 when < 2 sessions).
   * Positive = improving.
   */
  getImprovementRate(trend: MasteryTrendPoint[]): number {
    if (trend.length < 2) return 0;
    const first = trend[0]!.avgMastery;
    const last  = trend[trend.length - 1]!.avgMastery;
    return round4((last - first) / (trend.length - 1));
  }

  /**
   * Average change in priority concept count per session (negative = improving).
   * Tells the student how fast they're graduating concepts out of "needs work."
   */
  getLearningVelocity(trend: MasteryTrendPoint[]): number {
    if (trend.length < 2) return 0;
    const first = trend[0]!.priorityCount;
    const last  = trend[trend.length - 1]!.priorityCount;
    return round4((last - first) / (trend.length - 1));
  }
}
