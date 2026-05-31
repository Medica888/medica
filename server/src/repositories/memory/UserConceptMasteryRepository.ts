import type { UserConceptMastery } from '../../types/index.js';
import type { IUserConceptMasteryRepository } from '../interfaces.js';

function computeScores(attempts: number, correct: number) {
  return {
    mastery_score:          attempts > 0 ? Math.round((correct / attempts) * 10000) / 10000 : 0,
    confidence_score:       Math.round(Math.min(attempts / 5, 1.0) * 10000) / 10000,
    recent_incorrect_count: attempts - correct,
  };
}

function intervalFor(masteryScore: number, batchAttempted: number, batchCorrect: number): number {
  if (batchCorrect < batchAttempted) return 1;
  if (masteryScore < 0.65) return 1;
  if (masteryScore < 0.75) return 2;
  if (masteryScore < 0.85) return 4;
  return 7;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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
      const now = new Date();
      if (existing) {
        const newAttempts = existing.attempts + rec.attempted;
        const newCorrect  = existing.correct  + rec.correct;
        const scores = computeScores(newAttempts, newCorrect);
        const reviewInterval = intervalFor(scores.mastery_score, rec.attempted, rec.correct);
        this.store.set(key, {
          ...existing,
          attempts: newAttempts,
          correct:  newCorrect,
          ...scores,
          review_interval_days: reviewInterval,
          next_review_at:       addDays(now, reviewInterval),
          last_reviewed_at:     now,
          last_seen_at:         now,
          updated_at:           now,
        });
      } else {
        const scores = computeScores(rec.attempted, rec.correct);
        const reviewInterval = intervalFor(scores.mastery_score, rec.attempted, rec.correct);
        this.store.set(key, {
          user_id:    rec.userId,
          concept_id: rec.conceptId,
          attempts:   rec.attempted,
          correct:    rec.correct,
          ...scores,
          review_interval_days: reviewInterval,
          next_review_at:       addDays(now, reviewInterval),
          last_reviewed_at:     now,
          last_seen_at:         now,
          created_at:           now,
          updated_at:           now,
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
