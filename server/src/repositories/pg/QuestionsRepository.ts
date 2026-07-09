import type { Pool, PoolClient } from 'pg';
import type { GeneratedBankStatus, IQuestionsRepository } from '../interfaces.js';
import type { CatalogQuestion, PaginatedResult } from '../../types/index.js';
import {
  difficultySearchLabels,
  isBroadTaxonomyValue,
  subjectSearchLabels,
  systemSearchLabels,
} from '../../lib/medicaTaxonomy.js';
import { computeQuestionFingerprint } from '../../lib/questionFingerprint.js';
import {
  isCommerciallyContentReady,
  mergeReviewedContentMetadataIntoBody,
  normalizeReviewedContentMetadata,
} from '../../lib/reviewedContentMetadata.js';

export class PgQuestionsRepository implements IQuestionsRepository {
  constructor(private pool: Pool) {}

  private withReviewMetadata(row: Record<string, unknown>): Record<string, unknown> {
    const body = row['body'] && typeof row['body'] === 'object'
      ? row['body'] as Record<string, unknown>
      : {};
    const reviewMetadata = normalizeReviewedContentMetadata(row['reviewMetadata'] ?? body.reviewMetadata, {
      bankStatus: row['bankStatus'] == null ? null : String(row['bankStatus']),
      source: row['source'] == null ? null : String(row['source']),
      aiModel: row['aiModel'] == null ? null : String(row['aiModel']),
      validatorVersion: row['validatorVersion'] == null ? null : String(row['validatorVersion']),
      body,
    });
    return {
      ...row,
      body: mergeReviewedContentMetadataIntoBody(body, reviewMetadata),
      reviewMetadata,
      commercialReady: isCommerciallyContentReady({
        bankStatus: row['bankStatus'] == null ? null : String(row['bankStatus']),
        difficulty: row['difficulty'] == null ? null : String(row['difficulty']),
        source: row['source'] == null ? null : String(row['source']),
        aiModel: row['aiModel'] == null ? null : String(row['aiModel']),
        validatorVersion: row['validatorVersion'] == null ? null : String(row['validatorVersion']),
        body,
        reviewMetadata,
      }),
    };
  }

  private commercialReadySql(): string {
    return `(
      bank_status IN ('approved', 'restored')
      AND jsonb_array_length(COALESCE(review_metadata->'sourceRefs', '[]'::jsonb)) > 0
      AND review_metadata->>'medicalAccuracyStatus' = 'pass'
      AND COALESCE(review_metadata->>'itemWritingStatus', 'unknown') NOT IN ('major_issue', 'fail')
      AND COALESCE(review_metadata->>'difficultyCalibrationStatus', 'unknown') NOT IN ('major_issue', 'fail')
      AND (
        CASE
          WHEN difficulty IN ('UWorld Challenge', 'NBME Difficult')
            THEN review_metadata->>'reviewStatus' = 'expert_reviewed'
          ELSE review_metadata->>'reviewStatus' IN ('source_checked', 'expert_reviewed')
        END
      )
    )`;
  }

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
      aiModel?: string | null;
      validatorVersion?: string | null;
      reviewMetadata?: Record<string, unknown> | null;
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
    const aiModel = data.aiModel ?? (typeof data.body.aiModel === 'string' ? data.body.aiModel : null);
    const validatorVersion = data.validatorVersion
      ?? (typeof data.body.validatorVersion === 'string' ? data.body.validatorVersion : null)
      ?? (typeof data.body.validationVersion === 'string' ? data.body.validationVersion : null);
    const fingerprint = computeQuestionFingerprint(data.body.stem, data.body.testedConcept);
    const reviewMetadata = normalizeReviewedContentMetadata(
      data.reviewMetadata ?? data.body.reviewMetadata,
      { bankStatus, source, aiModel, validatorVersion, body: data.body },
    );
    const body = mergeReviewedContentMetadataIntoBody(data.body, reviewMetadata);
    const res = await q.query<{ id: string }>(
      `INSERT INTO questions
         (external_id, subject, system, body, source, bank_status, mode, difficulty,
          validation_score, validated_at, ai_model, validator_version, fingerprint, review_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (external_id) DO UPDATE
         SET subject = EXCLUDED.subject,
             system  = EXCLUDED.system,
             body    = EXCLUDED.body,
             source = EXCLUDED.source,
             bank_status = EXCLUDED.bank_status,
             mode = EXCLUDED.mode,
             difficulty = EXCLUDED.difficulty,
             validation_score = EXCLUDED.validation_score,
             validated_at = EXCLUDED.validated_at,
             ai_model = EXCLUDED.ai_model,
             validator_version = EXCLUDED.validator_version,
             fingerprint = EXCLUDED.fingerprint,
             review_metadata = EXCLUDED.review_metadata
       RETURNING id`,
      [
        externalId,
        data.subject,
        data.system,
        JSON.stringify(body),
        source,
        bankStatus,
        mode,
        difficulty,
        validationScore,
        validatedAt,
        aiModel,
        validatorVersion,
        fingerprint,
        JSON.stringify(reviewMetadata),
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
    approvedOnly?: boolean;
  }): Promise<Record<string, unknown>[]> {
    const values: unknown[] = [];
    const bankStatusClause = params.approvedOnly
      ? "bank_status IN ('approved', 'restored')"
      : "bank_status IN ('validated_generated', 'approved', 'restored')";
    const clauses = [
      "source = 'ai'",
      bankStatusClause,
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
       ORDER BY CASE WHEN bank_status IN ('approved', 'restored') THEN 0 ELSE 1 END, created_at DESC
       LIMIT $${values.length}`,
      values,
    );
    return res.rows.map(r => r.body);
  }

  async findGeneratedBankReview(params: {
    externalId?: string;
    status?: GeneratedBankStatus;
    reviewStatus?: string;
    commercialReady?: boolean;
    limit?: number;
    offset?: number;
    sort?: 'priority' | 'newest' | 'score' | 'usage';
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
    if (params.reviewStatus) {
      values.push(params.reviewStatus);
      clauses.push(`review_metadata->>'reviewStatus' = $${values.length}`);
    }
    if (typeof params.commercialReady === 'boolean') {
      const commercialReadySql = this.commercialReadySql();
      clauses.push(params.commercialReady ? commercialReadySql : `NOT ${commercialReadySql}`);
    }
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    const offset = Math.max(0, Number(params.offset) || 0);
    values.push(limit, offset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;

    const orderBy = params.sort === 'newest'
      ? 'created_at DESC'
      : params.sort === 'score'
        ? 'validation_score DESC NULLS LAST, created_at DESC'
        : params.sort === 'usage'
          ? 'usage_count DESC, created_at DESC'
          : /* priority (default) */
            `CASE
               WHEN bank_status = 'validation_failed' THEN 0
               WHEN bank_status = 'validated_generated' THEN 1
               WHEN bank_status = 'rejected' THEN 3
               ELSE 2
             END ASC,
             COALESCE(validation_score, 100) ASC,
             usage_count DESC,
             report_count DESC,
             created_at DESC`;

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
              ai_model AS "aiModel",
              validator_version AS "validatorVersion",
              review_metadata AS "reviewMetadata",
              last_used_at AS "lastUsedAt",
              usage_count AS "usageCount",
              report_count AS "reportCount",
              created_at AS "createdAt",
              body
       FROM questions
       WHERE ${clauses.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values,
    );
    return res.rows.map(row => this.withReviewMetadata(row));
  }

  async countGeneratedBankReview(params: {
    status?: GeneratedBankStatus;
    reviewStatus?: string;
    commercialReady?: boolean;
  }): Promise<number> {
    const values: unknown[] = [];
    const clauses = ["source = 'ai'"];
    if (params.status) {
      values.push(params.status);
      clauses.push(`bank_status = $${values.length}`);
    }
    if (params.reviewStatus) {
      values.push(params.reviewStatus);
      clauses.push(`review_metadata->>'reviewStatus' = $${values.length}`);
    }
    if (typeof params.commercialReady === 'boolean') {
      const commercialReadySql = this.commercialReadySql();
      clauses.push(params.commercialReady ? commercialReadySql : `NOT ${commercialReadySql}`);
    }
    const res = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM questions WHERE ${clauses.join(' AND ')}`,
      values,
    );
    return Number(res.rows[0]?.count || 0);
  }

  async updateGeneratedBankStatus(
    externalId: string,
    status: GeneratedBankStatus,
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
                 ai_model AS "aiModel",
                 validator_version AS "validatorVersion",
                 review_metadata AS "reviewMetadata",
                 last_used_at AS "lastUsedAt",
                 usage_count AS "usageCount",
                 report_count AS "reportCount",
                 created_at AS "createdAt",
                 body`,
      [externalId, status],
    );
    return res.rows[0] ? this.withReviewMetadata(res.rows[0]) : null;
  }

  async updateReviewedContentMetadata(
    externalId: string,
    metadata: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const existingRows = await this.findGeneratedBankReview({ externalId, limit: 1 });
    const existing = existingRows[0];
    if (!existing) return null;

    const body = existing['body'] && typeof existing['body'] === 'object'
      ? existing['body'] as Record<string, unknown>
      : {};
    const normalized = normalizeReviewedContentMetadata(metadata, {
      bankStatus: existing['bankStatus'] == null ? null : String(existing['bankStatus']),
      source: existing['source'] == null ? null : String(existing['source']),
      aiModel: existing['aiModel'] == null ? null : String(existing['aiModel']),
      validatorVersion: existing['validatorVersion'] == null ? null : String(existing['validatorVersion']),
      body,
    });
    const updatedBody = mergeReviewedContentMetadataIntoBody(body, normalized);

    const res = await this.pool.query<Record<string, unknown>>(
      `UPDATE questions
       SET review_metadata = $2::jsonb,
           body = $3::jsonb
       WHERE external_id = $1
       RETURNING external_id AS "externalId",
                 subject,
                 system,
                 source,
                 bank_status AS "bankStatus",
                 mode,
                 difficulty,
                 validation_score AS "validationScore",
                 validated_at AS "validatedAt",
                 ai_model AS "aiModel",
                 validator_version AS "validatorVersion",
                 review_metadata AS "reviewMetadata",
                 last_used_at AS "lastUsedAt",
                 usage_count AS "usageCount",
                 report_count AS "reportCount",
                 created_at AS "createdAt",
                 body`,
      [externalId, JSON.stringify(normalized), JSON.stringify(updatedBody)],
    );
    return res.rows[0] ? this.withReviewMetadata(res.rows[0]) : null;
  }

  async getGeneratedBankMetrics(): Promise<{
    total: number;
    legacy: number;
    validatedGenerated: number;
    approved: number;
    restored: number;
    quarantined: number;
    validationFailed: number;
    rejected: number;
    used: number;
    totalUsage: number;
    approvalRate: number;
    quarantineRate: number;
    averageValidationScore: number | null;
    averagePendingAgeDays: number | null;
    generatedLast7d: number;
  }> {
    const res = await this.pool.query<{
      total: string;
      legacy: string;
      validatedGenerated: string;
      approved: string;
      restored: string;
      quarantined: string;
      validationFailed: string;
      rejected: string;
      used: string;
      totalUsage: string;
      averageValidationScore: string | null;
      averagePendingAgeDays: string | null;
      generatedLast7d: string;
    }>(
      `SELECT COUNT(*)::text AS "total",
              COUNT(*) FILTER (WHERE bank_status = 'legacy')::text AS "legacy",
              COUNT(*) FILTER (WHERE bank_status = 'validated_generated')::text AS "validatedGenerated",
              COUNT(*) FILTER (WHERE bank_status = 'approved')::text AS "approved",
              COUNT(*) FILTER (WHERE bank_status = 'restored')::text AS "restored",
              COUNT(*) FILTER (WHERE bank_status = 'quarantined')::text AS "quarantined",
              COUNT(*) FILTER (WHERE bank_status = 'validation_failed')::text AS "validationFailed",
              COUNT(*) FILTER (WHERE bank_status = 'rejected')::text AS "rejected",
              COUNT(*) FILTER (WHERE usage_count > 0)::text AS "used",
              COALESCE(SUM(usage_count), 0)::text AS "totalUsage",
              ROUND(AVG(validation_score)::numeric, 2)::text AS "averageValidationScore",
              ROUND((AVG(EXTRACT(EPOCH FROM (now() - created_at)) / 86400) FILTER (WHERE bank_status = 'validated_generated'))::numeric, 2)::text AS "averagePendingAgeDays",
              COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::text AS "generatedLast7d"
       FROM questions
       WHERE source = 'ai'`,
    );
    const row = res.rows[0];
    const approved = Number(row?.approved || 0);
    const restored = Number(row?.restored || 0);
    const quarantined = Number(row?.quarantined || 0);
    const validatedGenerated = Number(row?.validatedGenerated || 0);
    const validationFailed = Number(row?.validationFailed || 0);
    const rejected = Number(row?.rejected || 0);
    const reviewable = approved + restored + quarantined + validatedGenerated + validationFailed + rejected;
    return {
      total: Number(row?.total || 0),
      legacy: Number(row?.legacy || 0),
      validatedGenerated,
      approved,
      restored,
      quarantined,
      validationFailed,
      rejected,
      used: Number(row?.used || 0),
      totalUsage: Number(row?.totalUsage || 0),
      approvalRate: reviewable > 0 ? (approved + restored) / reviewable : 0,
      quarantineRate: reviewable > 0 ? quarantined / reviewable : 0,
      averageValidationScore: row?.averageValidationScore != null ? Number(row.averageValidationScore) : null,
      averagePendingAgeDays: row?.averagePendingAgeDays != null ? Number(row.averagePendingAgeDays) : null,
      generatedLast7d: Number(row?.generatedLast7d || 0),
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

  async getQuestionsByConcept(concept: string, limit = 500): Promise<Record<string, unknown>[]> {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 500));
    // CTE pre-filters to array-typed canonicalConcepts before the SRF runs,
    // preventing jsonb_array_elements_text from crashing on scalar values.
    const res = await this.pool.query<Record<string, unknown>>(
      `WITH array_rows AS (
         SELECT external_id, subject, system, source, bank_status, mode, difficulty,
                 validation_score, validated_at, ai_model, validator_version, review_metadata, last_used_at, usage_count,
                 report_count, created_at, body
         FROM questions
         WHERE source = 'ai'
           AND jsonb_typeof(body->'canonicalConcepts') = 'array'
       )
       SELECT external_id AS "externalId", subject, system, source,
               bank_status AS "bankStatus", mode, difficulty,
               validation_score AS "validationScore", validated_at AS "validatedAt",
               ai_model AS "aiModel", validator_version AS "validatorVersion",
               review_metadata AS "reviewMetadata",
               last_used_at AS "lastUsedAt", usage_count AS "usageCount",
              report_count AS "reportCount", created_at AS "createdAt", body
       FROM array_rows
       WHERE EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(body->'canonicalConcepts') AS elem
         WHERE elem = $1
       )
       ORDER BY created_at DESC
       LIMIT $2`,
      [concept, safeLimit],
    );
    return res.rows.map(row => this.withReviewMetadata(row));
  }

  async findStudentCatalog(params: {
    page?: number;
    limit?: number;
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    search?: string;
    excludeFingerprints?: string[];
  }): Promise<PaginatedResult<CatalogQuestion>> {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 20));
    const offset = (page - 1) * limit;

    const values: unknown[] = [];
    const clauses: string[] = ["source = 'authored'", "bank_status IN ('approved', 'restored')"];

    if (params.subject && params.subject.trim()) {
      values.push(params.subject.trim());
      clauses.push(`subject = $${values.length}`);
    }
    if (params.system && params.system.trim()) {
      values.push(params.system.trim());
      clauses.push(`system = $${values.length}`);
    }
    if (params.difficulty && params.difficulty.trim()) {
      values.push(params.difficulty.trim());
      clauses.push(`difficulty = $${values.length}`);
    }
    if (params.mode && params.mode.trim()) {
      values.push(params.mode.trim());
      clauses.push(`mode = $${values.length}`);
    }
    if (params.search && params.search.trim()) {
      values.push(`%${params.search.trim()}%`);
      const idx = values.length;
      clauses.push(
        `(body->>'stem' ILIKE $${idx} OR body->>'testedConcept' ILIKE $${idx} OR body->>'topic' ILIKE $${idx}
          OR subject ILIKE $${idx} OR system ILIKE $${idx})`,
      );
    }
    // Cross-user quarantine: excludes content whose fingerprint has crossed the report
    // thresholds in QuestionReportService, even when bank_status hasn't caught up yet.
    // `<> ALL` over an empty array is vacuously true, so this is safe to always include.
    // 'restored' rows are exempt — same precedent as the generated-bank status route
    // (ai.ts): restoring a question is an explicit admin override of quarantine, so a
    // stale report-driven fingerprint match must not silently re-hide it.
    values.push(params.excludeFingerprints ?? []);
    clauses.push(`(bank_status = 'restored' OR fingerprint <> ALL($${values.length}::text[]))`);

    const where = clauses.join(' AND ');

    const countRes = await this.pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM questions WHERE ${where}`,
      values,
    );
    const total = Number(countRes.rows[0]?.total || 0);

    values.push(limit, offset);
    const dataRes = await this.pool.query<CatalogQuestion & { bankStatus: string; source: string; aiModel: string | null; validatorVersion: string | null }>(
      `SELECT external_id AS id, subject, system, source, bank_status AS "bankStatus", difficulty, mode,
              ai_model AS "aiModel", validator_version AS "validatorVersion", review_metadata AS "reviewMetadata",
              body->>'topic' AS topic,
              body->>'testedConcept' AS "testedConcept",
              body->>'stem' AS stem,
              CASE WHEN jsonb_typeof(body->'options') = 'array' THEN
                COALESCE(
                  (SELECT jsonb_agg(jsonb_build_object('letter', elem.opt->>'letter', 'text', elem.opt->>'text') ORDER BY elem.ord)
                   FROM jsonb_array_elements(body->'options') WITH ORDINALITY AS elem(opt, ord)),
                  '[]'::jsonb
                )
              ELSE '[]'::jsonb END AS options
       FROM questions
       WHERE ${where}
       ORDER BY created_at DESC, external_id ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );

    const data = dataRes.rows.map((row) => {
      const enriched = this.withReviewMetadata({
        ...row,
        body: {},
      });
      return {
        ...row,
        reviewMetadata: enriched['reviewMetadata'] as Record<string, unknown>,
        commercialReady: Boolean(enriched['commercialReady']),
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findByExternalIds(
    ids: string[],
    excludeFingerprints: string[] = [],
  ): Promise<Array<{ id: string; body: Record<string, unknown> }>> {
    if (ids.length === 0) return [];
    const safe = [...new Set(ids.map(id => String(id || '').trim()).filter(Boolean))];
    const res = await this.pool.query<{
      id: string;
      body: Record<string, unknown>;
      source: string;
      bankStatus: string;
      difficulty: string;
      aiModel: string | null;
      validatorVersion: string | null;
      reviewMetadata: Record<string, unknown>;
    }>(
      `SELECT external_id AS id, body, source, bank_status AS "bankStatus", difficulty,
              ai_model AS "aiModel", validator_version AS "validatorVersion", review_metadata AS "reviewMetadata"
       FROM questions
       WHERE external_id = ANY($1::text[])
         AND source = 'authored'
         AND bank_status IN ('approved', 'restored')
         AND (bank_status = 'restored' OR fingerprint <> ALL($2::text[]))`,
      [safe, excludeFingerprints],
    );
    return res.rows.map((row) => {
      const reviewMetadata = normalizeReviewedContentMetadata(row.reviewMetadata, {
        bankStatus: row.bankStatus,
        source: row.source,
        aiModel: row.aiModel,
        validatorVersion: row.validatorVersion,
        body: row.body,
      });
      return {
        id: row.id,
        body: mergeReviewedContentMetadataIntoBody(row.body, reviewMetadata),
      };
    });
  }

  async getConceptCoverage(): Promise<Array<{ concept: string; count: number }>> {
    // CTE pre-filters to array-typed canonicalConcepts before the SRF runs,
    // preventing jsonb_array_elements_text from crashing on scalar values.
    const res = await this.pool.query<{ concept: string; count: string }>(
      `WITH array_rows AS (
         SELECT body FROM questions
         WHERE source = 'ai'
           AND jsonb_typeof(body->'canonicalConcepts') = 'array'
       )
       SELECT elem AS concept, COUNT(*)::text AS count
       FROM array_rows,
            jsonb_array_elements_text(body->'canonicalConcepts') AS elem
       GROUP BY elem
       ORDER BY COUNT(*) DESC
       LIMIT 500`,
    );
    return res.rows.map(r => ({ concept: r.concept, count: Number(r.count) }));
  }
}
