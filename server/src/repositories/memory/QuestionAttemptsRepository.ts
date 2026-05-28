import { randomUUID } from 'crypto';
import type { QuestionAttempt } from '../../types/index.js';
import type { IQuestionAttemptsRepository } from '../interfaces.js';

export class InMemoryQuestionAttemptsRepository implements IQuestionAttemptsRepository {
  private store = new Map<string, QuestionAttempt>();

  async findBySessionId(sessionId: string): Promise<QuestionAttempt[]> {
    return [...this.store.values()].filter((a) => a.session_id === sessionId);
  }

  async findByUserId(userId: string, _limit?: number): Promise<QuestionAttempt[]> {
    return [...this.store.values()].filter((a) => a.user_id === userId);
  }

  async createMany(attempts: Omit<QuestionAttempt, 'id'>[], _tx?: unknown): Promise<QuestionAttempt[]> {
    return attempts.map((attempt) => {
      const id = randomUUID();
      const record: QuestionAttempt = { id, ...attempt };
      this.store.set(id, record);
      return record;
    });
  }

  _clear(): void {
    this.store.clear();
  }
}
