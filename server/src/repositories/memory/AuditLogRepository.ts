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

  async getThroughput(windowHours: number): Promise<{ approved: number; quarantined: number }> {
    const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const relevant = this.entries.filter(e => {
      const ts = e.createdAt instanceof Date ? e.createdAt : new Date((e.createdAt as string | undefined) ?? 0);
      return ts >= cutoff;
    });
    return {
      approved: relevant.filter(e => e.action === 'approved').length,
      quarantined: relevant.filter(e => e.action === 'quarantined').length,
    };
  }
}
