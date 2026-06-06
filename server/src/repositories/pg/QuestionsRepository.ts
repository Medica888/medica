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

  async findGeneratedBankQuestions(params: {
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const values: unknown[] = [];
    const clauses = [
      "body->>'source' = 'ai'",
      "body->>'bankStatus' = 'validated_generated'",
    ];

    const addExact = (field: string, value?: string) => {
      const trimmed = String(value || '').trim();
      if (!trimmed || trimmed === 'All Subjects' || trimmed === 'Mixed / All Systems' || trimmed === 'All Systems' || trimmed === 'Balanced') return;
      values.push(trimmed);
      clauses.push(`COALESCE(body->>'${field}', '') = $${values.length}`);
    };

    addExact('subject', params.subject);
    addExact('system', params.system);
    addExact('difficulty', params.difficulty);
    addExact('mode', params.mode);

    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    values.push(limit);

    const res = await this.pool.query<{ body: Record<string, unknown> }>(
      `SELECT body
       FROM questions
       WHERE ${clauses.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return res.rows.map(r => r.body);
  }
}
