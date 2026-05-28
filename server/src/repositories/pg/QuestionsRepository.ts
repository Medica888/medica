import type { Pool, PoolClient } from 'pg';
import type { IQuestionsRepository } from '../interfaces.js';

export class PgQuestionsRepository implements IQuestionsRepository {
  constructor(private pool: Pool) {}

  async upsertByExternalId(
    externalId: string,
    data: { subject: string; system: string; body: Record<string, unknown> },
    tx?: unknown,
  ): Promise<{ id: string }> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    const res = await q.query<{ id: string }>(
      `INSERT INTO questions (external_id, subject, system, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (external_id) DO UPDATE
         SET subject = EXCLUDED.subject,
             system  = EXCLUDED.system,
             body    = EXCLUDED.body
       RETURNING id`,
      [externalId, data.subject, data.system, JSON.stringify(data.body)],
    );
    return res.rows[0];
  }

  async findByExternalId(externalId: string): Promise<{ id: string } | null> {
    const res = await this.pool.query<{ id: string }>(
      'SELECT id FROM questions WHERE external_id = $1',
      [externalId],
    );
    return res.rows[0] ?? null;
  }
}
