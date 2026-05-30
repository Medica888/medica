import type { UserConceptMastery } from '../../types/index.js';
import type { IUserConceptMasteryRepository } from '../interfaces.js';

function computeScores(attempts: number, correct: number) {
  return {
    mastery_score:          attempts > 0 ? Math.round((correct / attempts) * 10000) / 10000 : 0,
    confidence_score:       Math.round(Math.min(attempts / 5, 1.0) * 10000) / 10000,
    recent_incorrect_count: attempts - correct,
  };
}

export class InMemoryUserConceptMasteryRepository implements IUserConceptMasteryRepository {
  // Key: "userId:conceptId"
  private store = new Map<string, UserConceptMastery>();

  async upsertMany(
    records: { userId: string; conceptId: string; attempted: number; correct: number }[],
    _tx?: unknown,
  ): Promise<void> {
    for (const rec of records) {
      const key = `${rec.userId}:${rec.conceptId}`;
      const existing = this.store.get(key);
      if (existing) {
        const newAttempts = existing.attempts + rec.attempted;
        const newCorrect  = existing.correct  + rec.correct;
        this.store.set(key, {
          ...existing,
          attempts: newAttempts,
          correct:  newCorrect,
          ...computeScores(newAttempts, newCorrect),
          last_seen_at: new Date(),
          updated_at:   new Date(),
        });
      } else {
        this.store.set(key, {
          user_id:    rec.userId,
          concept_id: rec.conceptId,
          attempts:   rec.attempted,
          correct:    rec.correct,
          ...computeScores(rec.attempted, rec.correct),
          last_seen_at: new Date(),
          created_at:   new Date(),
          updated_at:   new Date(),
        });
      }
    }
  }

  async findByUserId(userId: string): Promise<UserConceptMastery[]> {
    return [...this.store.values()]
      .filter((m) => m.user_id === userId)
      .sort((a, b) => b.mastery_score - a.mastery_score);
  }

  async findByUserAndConcept(userId: string, conceptId: string): Promise<UserConceptMastery | null> {
    return this.store.get(`${userId}:${conceptId}`) ?? null;
  }

  _getAll(): UserConceptMastery[] {
    return [...this.store.values()];
  }

  _clear(): void {
    this.store.clear();
  }
}
