import type { AuditLogEntry, IAuditLogRepository } from '../interfaces.js';

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private readonly entries: AuditLogEntry[] = [];

  async log(entry: AuditLogEntry): Promise<void> {
    this.entries.push({ ...entry, createdAt: entry.createdAt ?? new Date() });
  }

  getAll(): AuditLogEntry[] {
    return this.entries;
  }

  async getByQuestionId(questionId: string, limit = 50, offset = 0): Promise<AuditLogEntry[]> {
    return this.entries
      .filter(e => e.questionId === questionId)
      .slice()
      .reverse()
      .slice(offset, offset + limit);
  }

  async getRecentActions(actions: string[], limit: number): Promise<AuditLogEntry[]> {
    return this.entries
      .filter(e => actions.includes(e.action))
      .slice()
      .reverse()
      .slice(0, limit);
  }
}
