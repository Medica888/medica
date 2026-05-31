import type {
  UserConceptMastery,
  MasteryTier,
  MasteryOverview,
  EnrichedConceptMastery,
  ConceptMasteryDetail,
  SubjectRollup,
} from '../types/index.js';
import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { ConceptHierarchyService } from './ConceptHierarchyService.js';
import {
  TIER_WEAK as TIER_PRIORITY,
  TIER_MEDIUM as TIER_FOCUS,
  TIER_REINFORCED,
} from './adaptiveMasteryUtils.js';

const DEFAULT_LIMIT        = 10;
const DEFAULT_MIN_ATTEMPTS = 2;
const CONFIDENT_THRESHOLD  = 5; // attempts needed for confidence_score to saturate

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function masteryTier(masteryScore: number): MasteryTier {
  if (masteryScore < TIER_PRIORITY)   return 'priority';
  if (masteryScore < TIER_FOCUS)      return 'focus';
  if (masteryScore < TIER_REINFORCED) return 'reinforced';
  return 'ontrack';
}

export class MasteryQueryService {
  constructor(
    private mastery:   IUserConceptMasteryRepository,
    private concepts:  IConceptsRepository,
    private hierarchy: ConceptHierarchyService,
  ) {}

  async getOverview(userId: string): Promise<MasteryOverview> {
    const rows = await this.mastery.findByUserId(userId);
    if (!rows.length) {
      return {
        total_concepts:     0,
        avg_mastery_score:  0,
        avg_confidence:     0,
        distribution:       { priority: 0, focus: 0, reinforced: 0, ontrack: 0 },
        confident_concepts: 0,
      };
    }

    const dist: MasteryOverview['distribution'] = { priority: 0, focus: 0, reinforced: 0, ontrack: 0 };
    let totalMastery = 0;
    let totalConf    = 0;
    let confident    = 0;

    for (const r of rows) {
      totalMastery += r.mastery_score;
      totalConf    += r.confidence_score;
      dist[masteryTier(r.mastery_score)]++;
      if (r.attempts >= CONFIDENT_THRESHOLD) confident++;
    }

    const n = rows.length;
    return {
      total_concepts:     n,
      avg_mastery_score:  Math.round((totalMastery / n) * 10000) / 10000,
      avg_confidence:     Math.round((totalConf    / n) * 10000) / 10000,
      distribution:       dist,
      confident_concepts: confident,
    };
  }

  async getWeakest(
    userId:       string,
    limit        = DEFAULT_LIMIT,
    minAttempts  = DEFAULT_MIN_ATTEMPTS,
    prefetchedRows?: UserConceptMastery[],
  ): Promise<EnrichedConceptMastery[]> {
    const rows = prefetchedRows ?? await this.mastery.findByUserId(userId);
    const filtered = rows
      .filter((r) => r.attempts >= minAttempts)
      .sort((a, b) => a.mastery_score - b.mastery_score)
      .slice(0, limit);
    return this._enrich(filtered);
  }

  async getStrongest(
    userId:       string,
    limit        = DEFAULT_LIMIT,
    minAttempts  = DEFAULT_MIN_ATTEMPTS,
    prefetchedRows?: UserConceptMastery[],
  ): Promise<EnrichedConceptMastery[]> {
    const rows = prefetchedRows ?? await this.mastery.findByUserId(userId);
    const filtered = rows
      .filter((r) => r.attempts >= minAttempts)
      .sort((a, b) => b.mastery_score - a.mastery_score)
      .slice(0, limit);
    return this._enrich(filtered);
  }

  async getConceptDetail(userId: string, conceptId: string): Promise<ConceptMasteryDetail | null> {
    const concept = await this.concepts.findById(conceptId);
    if (!concept) return null;

    const [mastery, ancestorPath] = await Promise.all([
      this.mastery.findByUserAndConcept(userId, conceptId),
      this.hierarchy.getPath(conceptId),
    ]);

    return {
      concept,
      mastery,
      tier:          mastery ? masteryTier(mastery.mastery_score) : null,
      ancestor_path: ancestorPath,
    };
  }

  /**
   * Attempt-weighted subject rollup.
   * Groups all mastery rows by concept.subject and computes:
   *   rollupMastery    = Σ(mastery_score    × attempts) / Σ(attempts)
   *   rollupConfidence = Σ(confidence_score × attempts) / Σ(attempts)
   * weakConceptCount counts rows where mastery_score < TIER_PRIORITY (0.65).
   * Returns sorted by rollupMastery ASC (weakest subjects first).
   */
  async getSubjectBreakdown(
    userId:          string,
    prefetchedRows?: UserConceptMastery[],
  ): Promise<SubjectRollup[]> {
    const rows = prefetchedRows ?? await this.mastery.findByUserId(userId);
    if (!rows.length) return [];

    // _enrich() performs one batch findManyById call; reuse it to avoid a separate loop
    const enriched = await this._enrich(rows);

    const acc = new Map<string, {
      masteryWeightedSum: number;
      confWeightedSum:    number;
      totalAttempts:      number;
      weakConceptCount:   number;
    }>();

    for (const e of enriched) {
      const subject = e.concept.subject;
      if (!subject) continue;
      const row     = e.mastery;
      const w       = row.attempts;
      const existing = acc.get(subject);
      if (existing) {
        existing.masteryWeightedSum += row.mastery_score    * w;
        existing.confWeightedSum    += row.confidence_score * w;
        existing.totalAttempts      += w;
        if (row.mastery_score < TIER_PRIORITY) existing.weakConceptCount++;
      } else {
        acc.set(subject, {
          masteryWeightedSum: row.mastery_score    * w,
          confWeightedSum:    row.confidence_score * w,
          totalAttempts:      w,
          weakConceptCount:   row.mastery_score < TIER_PRIORITY ? 1 : 0,
        });
      }
    }

    return [...acc.entries()]
      .map(([subject, g]): SubjectRollup => {
        const rollupMastery    = g.totalAttempts > 0 ? round4(g.masteryWeightedSum / g.totalAttempts) : 0;
        const rollupConfidence = g.totalAttempts > 0 ? round4(g.confWeightedSum    / g.totalAttempts) : 0;
        return {
          subject,
          rollupMastery,
          rollupConfidence,
          totalAttempts:    g.totalAttempts,
          weakConceptCount: g.weakConceptCount,
          tier:             masteryTier(rollupMastery),
        };
      })
      .sort((a, b) => a.rollupMastery - b.rollupMastery);
  }

  /**
   * All mastery rows for a user filtered to one subject, sorted weakest-first.
   * Reuses _enrich() so concept name + tier are resolved in one Promise.all.
   */
  async getConceptsBySubject(
    userId:          string,
    subject:         string,
    prefetchedRows?: UserConceptMastery[],
  ): Promise<EnrichedConceptMastery[]> {
    const rows     = prefetchedRows ?? await this.mastery.findByUserId(userId);
    const enriched = await this._enrich(rows);
    return enriched
      .filter((e) => e.concept.subject === subject)
      .sort((a, b) => a.mastery.mastery_score - b.mastery.mastery_score);
  }

  private async _enrich(rows: UserConceptMastery[]): Promise<EnrichedConceptMastery[]> {
    if (!rows.length) return [];
    const fetched    = await this.concepts.findManyById(rows.map((r) => r.concept_id));
    const conceptMap = new Map(fetched.map((c) => [c.id, c]));
    return rows
      .map((row) => {
        const concept = conceptMap.get(row.concept_id);
        return concept ? { concept, mastery: row, tier: masteryTier(row.mastery_score) } : null;
      })
      .filter((x): x is EnrichedConceptMastery => x !== null);
  }
}
