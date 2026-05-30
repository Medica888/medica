import type {
  UserConceptMastery,
  MasteryTier,
  MasteryOverview,
  EnrichedConceptMastery,
  ConceptMasteryDetail,
} from '../types/index.js';
import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { ConceptHierarchyService } from './ConceptHierarchyService.js';

// Thresholds mirror AnalyticsDashboard.jsx SUBJECT_STATUS (pct → score / 100)
const TIER_PRIORITY   = 0.65;
const TIER_FOCUS      = 0.75;
const TIER_REINFORCED = 0.85;

const DEFAULT_LIMIT        = 10;
const DEFAULT_MIN_ATTEMPTS = 2;
const CONFIDENT_THRESHOLD  = 5; // attempts needed for confidence_score to saturate

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
    userId:      string,
    limit       = DEFAULT_LIMIT,
    minAttempts = DEFAULT_MIN_ATTEMPTS,
  ): Promise<EnrichedConceptMastery[]> {
    const rows = await this.mastery.findByUserId(userId);
    const filtered = rows
      .filter((r) => r.attempts >= minAttempts)
      .sort((a, b) => a.mastery_score - b.mastery_score)
      .slice(0, limit);
    return this._enrich(filtered);
  }

  async getStrongest(
    userId:      string,
    limit       = DEFAULT_LIMIT,
    minAttempts = DEFAULT_MIN_ATTEMPTS,
  ): Promise<EnrichedConceptMastery[]> {
    const rows = await this.mastery.findByUserId(userId);
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

  private async _enrich(rows: UserConceptMastery[]): Promise<EnrichedConceptMastery[]> {
    const concepts = await Promise.all(rows.map((r) => this.concepts.findById(r.concept_id)));
    return rows
      .map((row, i) => {
        const concept = concepts[i];
        return concept ? { concept, mastery: row, tier: masteryTier(row.mastery_score) } : null;
      })
      .filter((x): x is EnrichedConceptMastery => x !== null);
  }
}
