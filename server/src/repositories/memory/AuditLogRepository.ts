import type { AuditLogEntry, IAuditLogRepository } from '../interfaces.js';

export class InMemoryAuditLogRepository implements IAuditLogRepository {
  private readonly entries: AuditLogEntry[] = [];

  async log(entry: AuditLogEntry): Promise<void> {
    this.entries.push({ ...entry });
  }

  getAll(): AuditLogEntry[] {
    return this.entries;
  }
}
