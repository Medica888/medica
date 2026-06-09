import type { Pool } from 'pg';
import type { AuditLogEntry, IAuditLogRepository } from '../interfaces.js';
import { getPool } from '../../config/db.js';

export class PgAuditLogRepository implements IAuditLogRepository {
  constructor(private pool: Pool) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO generated_bank_audit_log
         (user_id, action, question_id, previous_status, new_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.userId, entry.action, entry.questionId, entry.previousStatus, entry.newStatus],
    );
  }

  getAll(): AuditLogEntry[] {
    return [];
  }
}

export class NullAuditLogRepository implements IAuditLogRepository {
  async log(_entry: AuditLogEntry): Promise<void> {
    // No-op: used when DATABASE_URL is unset (in-memory mode without an explicit repo override).
  }

  getAll(): AuditLogEntry[] {
    return [];
  }
}

export function createAuditLogRepository(): IAuditLogRepository {
  const pool = getPool();
  return pool ? new PgAuditLogRepository(pool) : new NullAuditLogRepository();
}
