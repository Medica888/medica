import type { IUserConceptMasteryRepository, IMasterySnapshotsRepository } from '../repositories/interfaces.js';
import type {
  MasteryProgress, MasteryTrendPoint, MasterySnapshot,
  ReadinessScore, ReadinessStatus, TopicReadiness, MasteryTierDistribution,
  UserConceptMastery,
} from '../types/index.js';
import {
  TIER_WEAK as TIER_PRIORITY_MAX,
  TIER_MEDIUM as TIER_FOCUS_MAX,
  TIER_REINFORCED as TIER_REINFORCED_MAX,
} from './adaptiveMasteryUtils.js';

// ── Readiness formula weights (tunable defaults) ──────────────────────────────
// Score = (mastery×W_M + confidence×W_C + trend×W_T + consistency×W_K) × 100 → clamp [0, 100]
const W_MASTERY     = 0.50;
const W_CONFIDENCE  = 0.20;
const W_TREND       = 0.15;
const W_CONSISTENCY = 0.15;

// Maximum meaningful improvement rate per session (±10%). Values outside this band are clamped.
const TREND_BAND = 0.10;

export function readinessStatus(score: number): ReadinessStatus {
  if (score >= 85) return 'Exam Ready';
  if (score >= 70) return 'Approaching Readiness';
  if (score >= 50) return 'Developing';
  return 'Needs Intensive Review';
}

/** Topic-level recommendation string. */
function topicRecommendation(readiness: number, trend: TopicReadiness['trend']): string {
  if (readiness < 50) return trend === 'down' ? 'Urgent — declining mastery detected. Review core mechanisms.' : 'Review mechanism and practice targeted questions.';
  if (readiness < 70) return 'Developing — continue practice with varied question angles.';
  if (readiness < 85) return trend === 'up' ? 'Good progress — maintain with spaced review.' : 'Solid — maintain with occasional review questions.';
  return 'Strong mastery — review periodically to prevent decay.';
}

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

  /**
   * Computes overall readiness score (0–100) from mastery, confidence, trend, and consistency.
   *
   * Formula weights (tunable defaults):
   *   mastery     × 0.50
   *   confidence  × 0.20
   *   trend       × 0.15   (improvement rate, normalized to ±10%/session band)
   *   consistency × 0.15   (fraction of concepts NOT in priority tier)
   */
  async getReadiness(userId: string, prefetchedRows?: UserConceptMastery[]): Promise<ReadinessScore> {
    const [rows, trend] = await Promise.all([
      prefetchedRows ?? this.mastery.findByUserId(userId),
      this.getMasteryTrend(userId),
    ]);

    const empty: ReadinessScore = {
      overallReadiness: 0,
      status:           'Needs Intensive Review',
      components:       { mastery: 0, confidence: 0, trend: 0, consistency: 0 },
      distribution:     { priority: 0, focus: 0, reinforced: 0, ontrack: 0 },
    };
    if (!rows.length) return empty;

    // Averages
    let sumMastery = 0, sumConf = 0;
    const dist: MasteryTierDistribution = { priority: 0, focus: 0, reinforced: 0, ontrack: 0 };
    for (const r of rows) {
      sumMastery += r.mastery_score;
      sumConf    += r.confidence_score;
      const s = r.mastery_score;
      if      (s < TIER_PRIORITY_MAX)   dist.priority++;
      else if (s < TIER_FOCUS_MAX)      dist.focus++;
      else if (s < TIER_REINFORCED_MAX) dist.reinforced++;
      else                               dist.ontrack++;
    }
    const n = rows.length;
    const avgMastery    = sumMastery / n;
    const avgConfidence = sumConf    / n;

    // Trend component: clamp improvementRate to ±TREND_BAND, map to [0, 1]
    const improvementRate  = this.getImprovementRate(trend);
    const normalizedTrend  = (Math.min(Math.max(improvementRate, -TREND_BAND), TREND_BAND) + TREND_BAND) / (2 * TREND_BAND);

    // Consistency: fraction of concepts NOT in priority tier
    const consistencyScore = (n - dist.priority) / n;

    const cMastery     = avgMastery    * W_MASTERY;
    const cConfidence  = avgConfidence * W_CONFIDENCE;
    const cTrend       = normalizedTrend  * W_TREND;
    const cConsistency = consistencyScore * W_CONSISTENCY;

    const raw = cMastery + cConfidence + cTrend + cConsistency;
    const overallReadiness = Math.min(100, Math.max(0, Math.round(raw * 100)));

    return {
      overallReadiness,
      status:     readinessStatus(overallReadiness),
      components: {
        mastery:     round4(cMastery * 100),
        confidence:  round4(cConfidence * 100),
        trend:       round4(cTrend * 100),
        consistency: round4(cConsistency * 100),
      },
      distribution: dist,
    };
  }

  /**
   * Readiness for a single concept, identified by its DB UUID.
   * Returns null when the user has no mastery row for that concept.
   * Topic formula: mastery×0.60 + confidence×0.25 + trend×0.15
   */
  async getTopicReadiness(userId: string, conceptId: string): Promise<Omit<TopicReadiness, 'conceptName'> | null> {
    const row = await this.mastery.findByUserAndConcept(userId, conceptId);
    if (!row) return null;

    // Trend: compare this concept's mastery across the last two snapshot batches
    const batchIds = await this.snapshots.findBatchIds(userId);
    let trendDir: TopicReadiness['trend'] = 'stable';
    if (batchIds.length >= 2) {
      const [currentBatch, prevBatch] = await Promise.all([
        this.snapshots.findByBatch(userId, batchIds[batchIds.length - 1]!),
        this.snapshots.findByBatch(userId, batchIds[batchIds.length - 2]!),
      ]);
      const cur  = currentBatch.find((r) => r.concept_id === conceptId);
      const prev = prevBatch.find((r)    => r.concept_id === conceptId);
      if (cur && prev) {
        // Only flag as changed when the delta is meaningful (>0.5pp)
        if      (cur.mastery_score > prev.mastery_score + 0.005) trendDir = 'up';
        else if (cur.mastery_score < prev.mastery_score - 0.005) trendDir = 'down';
      }
    }

    const normalizedTrend = trendDir === 'up' ? 1.0 : trendDir === 'down' ? 0.0 : 0.5;
    const raw = row.mastery_score * 0.60 + row.confidence_score * 0.25 + normalizedTrend * 0.15;
    const readiness = Math.min(100, Math.max(0, Math.round(raw * 100)));

    return {
      conceptId,
      readiness,
      status:         readinessStatus(readiness),
      trend:          trendDir,
      recommendation: topicRecommendation(readiness, trendDir),
    };
  }
}
