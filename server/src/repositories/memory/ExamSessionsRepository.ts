import { randomUUID } from 'crypto';
import type { ExamSession, PaginationParams, PaginatedResult } from '../../types/index.js';
import type { IExamSessionsRepository } from '../interfaces.js';

export class InMemoryExamSessionsRepository implements IExamSessionsRepository {
  private store = new Map<string, ExamSession>();
  private linkStore = new Map<string, { questionId: string; position: number }[]>();

  async findById(id: string): Promise<ExamSession | null> {
    return this.store.get(id) ?? null;
  }

  async findByUserId(
    userId: string,
    params: PaginationParams = { page: 1, limit: 20 },
  ): Promise<PaginatedResult<ExamSession>> {
    const all = [...this.store.values()]
      .filter((s) => s.user_id === userId)
      .sort((a, b) => b.completed_at.getTime() - a.completed_at.getTime());

    const total = all.length;
    const start = (params.page - 1) * params.limit;
    const data = all.slice(start, start + params.limit);

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
  }

  async create(session: Omit<ExamSession, 'id'>, _tx?: unknown): Promise<ExamSession> {
    const id = randomUUID();
    const newSession: ExamSession = { id, ...session };
    this.store.set(id, newSession);
    return newSession;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async createQuestionLinks(
    sessionId: string,
    links: { questionId: string; position: number }[],
    _tx?: unknown,
  ): Promise<void> {
    if (!links.length) return;
    this.linkStore.set(sessionId, [...links]);
  }

  _getQuestionLinks(sessionId: string): { questionId: string; position: number }[] {
    return this.linkStore.get(sessionId) ?? [];
  }

  _clear(): void {
    this.store.clear();
    this.linkStore.clear();
  }
}
