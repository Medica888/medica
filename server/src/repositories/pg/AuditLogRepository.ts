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

  async getByQuestionId(questionId: string, limit = 50, offset = 0): Promise<AuditLogEntry[]> {
    const res = await this.pool.query<AuditLogEntry>(
      `SELECT user_id AS "userId", action, question_id AS "questionId",
              previous_status AS "previousStatus", new_status AS "newStatus",
              created_at AS "createdAt"
       FROM generated_bank_audit_log
       WHERE question_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [questionId, limit, offset],
    );
    return res.rows;
  }

  async getRecentActions(actions: string[], limit: number): Promise<AuditLogEntry[]> {
    const res = await this.pool.query<AuditLogEntry>(
      `SELECT user_id AS "userId", action, question_id AS "questionId",
              previous_status AS "previousStatus", new_status AS "newStatus",
              created_at AS "createdAt"
       FROM generated_bank_audit_log
       WHERE action = ANY($1::text[])
       ORDER BY created_at DESC
       LIMIT $2`,
      [actions, limit],
    );
    return res.rows;
  }
}

export class NullAuditLogRepository implements IAuditLogRepository {
  async log(_entry: AuditLogEntry): Promise<void> {
    // No-op: used when DATABASE_URL is unset (in-memory mode without an explicit repo override).
  }

  getAll(): AuditLogEntry[] {
    return [];
  }

  async getByQuestionId(_questionId: string, _limit?: number, _offset?: number): Promise<AuditLogEntry[]> {
    return [];
  }

  async getRecentActions(_actions: string[], _limit: number): Promise<AuditLogEntry[]> {
    return [];
  }
}

export function createAuditLogRepository(): IAuditLogRepository {
  const pool = getPool();
  return pool ? new PgAuditLogRepository(pool) : new NullAuditLogRepository();
}
