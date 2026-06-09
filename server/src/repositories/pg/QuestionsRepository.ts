import type { Pool, PoolClient } from 'pg';
import type { IQuestionsRepository } from '../interfaces.js';
import {
  difficultySearchLabels,
  isBroadTaxonomyValue,
  subjectSearchLabels,
  systemSearchLabels,
} from '../../lib/medicaTaxonomy.js';

export class PgQuestionsRepository implements IQuestionsRepository {
  constructor(private pool: Pool) {}

  async upsertByExternalId(
    externalId: string,
    data: {
      subject: string;
      system: string;
      body: Record<string, unknown>;
      source?: string;
      bankStatus?: string;
      mode?: string;
      difficulty?: string;
      validationScore?: number | null;
      validatedAt?: Date | string | null;
    },
    tx?: unknown,
  ): Promise<{ id: string }> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    const source = data.source ?? String(data.body.source || 'unknown');
    const bankStatus = data.bankStatus ?? String(data.body.bankStatus || 'legacy');
    const mode = data.mode ?? String(data.body.mode || '');
    const difficulty = data.difficulty ?? String(data.body.difficulty || '');
    const validationScore = data.validationScore ?? (
      data.body.validationScore == null ? null : Number(data.body.validationScore)
    );
    const validatedAt = data.validatedAt ?? data.body.validatedAt ?? null;
    const res = await q.query<{ id: string }>(
      `INSERT INTO questions
         (external_id, subject, system, body, source, bank_status, mode, difficulty, validation_score, validated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (external_id) DO UPDATE
         SET subject = EXCLUDED.subject,
             system  = EXCLUDED.system,
             body    = EXCLUDED.body,
             source = EXCLUDED.source,
             bank_status = EXCLUDED.bank_status,
             mode = EXCLUDED.mode,
             difficulty = EXCLUDED.difficulty,
             validation_score = EXCLUDED.validation_score,
             validated_at = EXCLUDED.validated_at
       RETURNING id`,
      [
        externalId,
        data.subject,
        data.system,
        JSON.stringify(data.body),
        source,
        bankStatus,
        mode,
        difficulty,
        validationScore,
        validatedAt,
      ],
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
      "source = 'ai'",
      "bank_status IN ('validated_generated', 'approved')",
    ];

    const addExact = (column: string, value?: string, allLabels: string[] = []) => {
      const trimmed = String(value || '').trim();
      if (!trimmed || allLabels.includes(trimmed)) return;
      values.push(trimmed);
      clauses.push(`${column} = $${values.length}`);
    };

    const addTaxonomyFilter = (
      column: string,
      value: string | undefined,
      labelsForValue: (v: unknown) => string[],
      allLabels: string[] = [],
    ) => {
      const trimmed = String(value || '').trim();
      if (!trimmed || allLabels.includes(trimmed) || isBroadTaxonomyValue(trimmed)) return;
      const labels = labelsForValue(trimmed);
      const searchLabels = labels.length > 0 ? labels : [trimmed];
      values.push(searchLabels);
      clauses.push(`${column} = ANY($${values.length}::text[])`);
    };

    addTaxonomyFilter('subject', params.subject, subjectSearchLabels, ['All Subjects']);
    addTaxonomyFilter('system', params.system, systemSearchLabels, ['Mixed / All Systems', 'All Systems']);
    addTaxonomyFilter('difficulty', params.difficulty, difficultySearchLabels);
    addExact('mode', params.mode);

    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    values.push(limit);

    const res = await this.pool.query<{ body: Record<string, unknown> }>(
      `SELECT body
       FROM questions
       WHERE ${clauses.join(' AND ')}
       ORDER BY CASE WHEN bank_status = 'approved' THEN 0 ELSE 1 END, created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return res.rows.map(r => r.body);
  }

  async findGeneratedBankReview(params: {
    externalId?: string;
    status?: 'validated_generated' | 'approved' | 'quarantined';
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]> {
    const values: unknown[] = [];
    const clauses = ["source = 'ai'"];
    if (params.externalId) {
      values.push(params.externalId);
      clauses.push(`external_id = $${values.length}`);
    }
    if (params.status) {
      values.push(params.status);
      clauses.push(`bank_status = $${values.length}`);
    }
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    const offset = Math.max(0, Number(params.offset) || 0);
    values.push(limit, offset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;

    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT external_id AS "externalId",
              subject,
              system,
              source,
              bank_status AS "bankStatus",
              mode,
              difficulty,
              validation_score AS "validationScore",
              validated_at AS "validatedAt",
              last_used_at AS "lastUsedAt",
              usage_count AS "usageCount",
              report_count AS "reportCount",
              created_at AS "createdAt",
              body
       FROM questions
       WHERE ${clauses.join(' AND ')}
       ORDER BY CASE WHEN bank_status = 'quarantined' THEN 0
                     WHEN bank_status = 'validated_generated' THEN 1
                     ELSE 2 END,
                created_at DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values,
    );
    return res.rows;
  }

  async updateGeneratedBankStatus(
    externalId: string,
    status: 'validated_generated' | 'approved' | 'quarantined',
  ): Promise<Record<string, unknown> | null> {
    const res = await this.pool.query<Record<string, unknown>>(
      `UPDATE questions
       SET bank_status = $2,
           body = jsonb_set(body, '{bankStatus}', to_jsonb($2::text), true)
       WHERE external_id = $1
         AND source = 'ai'
       RETURNING external_id AS "externalId",
                 subject,
                 system,
                 source,
                 bank_status AS "bankStatus",
                 mode,
                 difficulty,
                 validation_score AS "validationScore",
                 validated_at AS "validatedAt",
                 last_used_at AS "lastUsedAt",
                 usage_count AS "usageCount",
                 report_count AS "reportCount",
                 created_at AS "createdAt",
                 body`,
      [externalId, status],
    );
    return res.rows[0] ?? null;
  }

  async getGeneratedBankMetrics(): Promise<{
    total: number;
    validatedGenerated: number;
    approved: number;
    quarantined: number;
    used: number;
    totalUsage: number;
  }> {
    const res = await this.pool.query<{
      total: string;
      validatedGenerated: string;
      approved: string;
      quarantined: string;
      used: string;
      totalUsage: string;
    }>(
      `SELECT COUNT(*)::text AS "total",
              COUNT(*) FILTER (WHERE bank_status = 'validated_generated')::text AS "validatedGenerated",
              COUNT(*) FILTER (WHERE bank_status = 'approved')::text AS "approved",
              COUNT(*) FILTER (WHERE bank_status = 'quarantined')::text AS "quarantined",
              COUNT(*) FILTER (WHERE usage_count > 0)::text AS "used",
              COALESCE(SUM(usage_count), 0)::text AS "totalUsage"
       FROM questions
       WHERE source = 'ai'`,
    );
    const row = res.rows[0];
    return {
      total: Number(row?.total || 0),
      validatedGenerated: Number(row?.validatedGenerated || 0),
      approved: Number(row?.approved || 0),
      quarantined: Number(row?.quarantined || 0),
      used: Number(row?.used || 0),
      totalUsage: Number(row?.totalUsage || 0),
    };
  }

  async markUsedByExternalIds(externalIds: string[]): Promise<void> {
    const ids = [...new Set(externalIds.map(id => String(id || '').trim()).filter(Boolean))];
    if (ids.length === 0) return;
    await this.pool.query(
      `UPDATE questions
       SET usage_count = usage_count + 1,
           last_used_at = now()
       WHERE external_id = ANY($1::text[])`,
      [ids],
    );
  }
}
