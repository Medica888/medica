import type { IUserConceptMasteryRepository, IQuestionConceptsRepository } from '../repositories/interfaces.js';
import type { UserConceptMastery } from '../types/index.js';

export class ConceptMasteryService {
  constructor(
    private mastery: IUserConceptMasteryRepository,
    private questionConcepts: IQuestionConceptsRepository,
  ) {}

  /**
   * Records attempt outcomes for every concept directly linked to each answered question.
   * Uses direct question_concepts links only — no hierarchy roll-up, no ancestor traversal.
   *
   * Multiple questions in the same session that share a concept are pre-aggregated into
   * a single upsert record so the DB ON CONFLICT sees one increment per concept.
   */
  async updateFromSession(
    userId: string,
    answeredQuestions: { questionDbId: string; isCorrect: boolean }[],
    tx?: unknown,
  ): Promise<void> {
    // (userId:conceptId) → accumulated counters
    const aggregated = new Map<string, { userId: string; conceptId: string; attempted: number; correct: number }>();

    for (const { questionDbId, isCorrect } of answeredQuestions) {
      if (!questionDbId) continue;
      const links = await this.questionConcepts.findByQuestionId(questionDbId, tx);
      for (const link of links) {
        const key = `${userId}:${link.concept_id}`;
        const existing = aggregated.get(key);
        if (existing) {
          existing.attempted += 1;
          existing.correct   += isCorrect ? 1 : 0;
        } else {
          aggregated.set(key, {
            userId,
            conceptId: link.concept_id,
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
