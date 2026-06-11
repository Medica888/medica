import type { IUserConceptMasteryRepository, IQuestionConceptsRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { UserConceptMastery } from '../types/index.js';
import { canonicalConceptsToMasteryKeys } from '../lib/conceptBridgeUtils.js';

export class ConceptMasteryService {
  constructor(
    private mastery: IUserConceptMasteryRepository,
    private questionConcepts: IQuestionConceptsRepository,
    private concepts?: IConceptsRepository,
  ) {}

  /**
   * Records attempt outcomes for every concept linked to each answered question.
   *
   * Two concept sources are merged per question before incrementing counters:
   *   1. Legacy: question_concepts join-table links (slug-keyed UUID graph)
   *   2. Canonical bridge: canonicalConcepts[] from the v8.0.0 taxonomy, if present
   *
   * A per-question Set deduplicates concept IDs across both sources so a concept
   * that appears in both paths is counted exactly once per question.
   *
   * Multiple questions in the same session that share a concept are pre-aggregated
   * into a single upsert record so the DB ON CONFLICT sees one increment per concept.
   */
  async updateFromSession(
    userId: string,
    answeredQuestions: { questionDbId: string; isCorrect: boolean; canonicalConcepts?: string[] }[],
    tx?: unknown,
  ): Promise<void> {
    // (userId:conceptId) → accumulated counters
    const aggregated = new Map<string, { userId: string; conceptId: string; attempted: number; correct: number }>();

    for (const { questionDbId, isCorrect, canonicalConcepts } of answeredQuestions) {
      if (!questionDbId) continue;

      // Per-question concept ID set — prevents double-counting across legacy+canonical paths
      const questionConceptIds = new Set<string>();

      // Legacy: concept links from question_concepts join table
      const links = await this.questionConcepts.findByQuestionId(questionDbId, tx);
      for (const link of links) {
        questionConceptIds.add(link.concept_id);
      }

      // Canonical bridge: slugify → upsert with source='canonical' → get UUIDs
      if (this.concepts && canonicalConcepts?.length) {
        const canonicalIds = await canonicalConceptsToMasteryKeys(canonicalConcepts, this.concepts, tx);
        for (const id of canonicalIds) {
          questionConceptIds.add(id);
        }
      }

      // Aggregate once per unique concept ID for this question
      for (const conceptId of questionConceptIds) {
        const key = `${userId}:${conceptId}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.attempted += 1;
          existing.correct   += isCorrect ? 1 : 0;
        } else {
          aggregated.set(key, {
            userId,
            conceptId,
            attempted: 1,
            correct:   isCorrect ? 1 : 0,
          });
        }
      }
    }

    const records = [...aggregated.values()];
    if (records.length > 0) {
      await this.mastery.upsertMany(records, tx);
    }
  }

  async getMasteryForUser(userId: string): Promise<UserConceptMastery[]> {
    return this.mastery.findByUserId(userId);
  }
}
