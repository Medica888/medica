import type { Pool } from 'pg';
import type {
  ITaxonomyCandidatesRepository,
  TaxonomyCandidate,
  TaxonomyCandidateStatus,
} from '../interfaces.js';

function keyFor(rawLabel: string): string {
  return rawLabel.toLowerCase().replace(/\s+/g, ' ').trim();
}

function mapRow(row: Record<string, unknown>): TaxonomyCandidate {
  return {
    id: String(row.id),
    rawLabel: String(row.rawLabel),
    rawLabelKey: String(row.rawLabelKey),
    normalizedGuess: String(row.normalizedGuess),
    subject: String(row.subject || ''),
    system: String(row.system || ''),
    frequency: Number(row.frequency || 0),
    exampleQuestionFingerprint: row.exampleQuestionFingerprint == null ? null : String(row.exampleQuestionFingerprint),
    source: String(row.source || ''),
    status: row.status as TaxonomyCandidateStatus,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt as Date | string | undefined,
    updatedAt: row.updatedAt as Date | string | undefined,
    lastSeenAt: row.lastSeenAt as Date | string | undefined,
  };
}

export class PgTaxonomyCandidatesRepository implements ITaxonomyCandidatesRepository {
  constructor(private pool: Pool) {}

  async upsertUnknownTopicCandidate(data: {
    rawLabel: string;
    normalizedGuess: string;
    subject: string;
    system: string;
    exampleQuestionFingerprint?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TaxonomyCandidate> {
    const rawLabel = data.rawLabel.trim();
    const rawLabelKey = keyFor(rawLabel);
    const res = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO taxonomy_candidates
         (raw_label_key, raw_label, normalized_guess, subject, system, example_question_fingerprint, source, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (raw_label_key) DO UPDATE
         SET normalized_guess = COALESCE(NULLIF(EXCLUDED.normalized_guess, ''), taxonomy_candidates.normalized_guess),
             subject = COALESCE(NULLIF(EXCLUDED.subject, ''), taxonomy_candidates.subject),
             system = COALESCE(NULLIF(EXCLUDED.system, ''), taxonomy_candidates.system),
             example_question_fingerprint = COALESCE(EXCLUDED.example_question_fingerprint, taxonomy_candidates.example_question_fingerprint),
             source = COALESCE(NULLIF(EXCLUDED.source, ''), taxonomy_candidates.source),
             metadata = taxonomy_candidates.metadata || EXCLUDED.metadata,
             frequency = taxonomy_candidates.frequency + 1,
             updated_at = now(),
             last_seen_at = now()
       RETURNING id,
                 raw_label AS "rawLabel",
                 raw_label_key AS "rawLabelKey",
                 normalized_guess AS "normalizedGuess",
                 subject,
                 system,
                 frequency,
                 example_question_fingerprint AS "exampleQuestionFingerprint",
                 source,
                 status,
                 metadata,
                 created_at AS "createdAt",
                 updated_at AS "updatedAt",
                 last_seen_at AS "lastSeenAt"`,
      [
        rawLabelKey,
        rawLabel,
        data.normalizedGuess,
        data.subject,
        data.system,
        data.exampleQuestionFingerprint ?? null,
        data.source || 'unknown_topic',
        JSON.stringify(data.metadata ?? {}),
      ],
    );
    return mapRow(res.rows[0]);
  }

  async findUnknownTopicCandidates(params: {
    status?: TaxonomyCandidateStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<TaxonomyCandidate[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (params.status) {
      values.push(params.status);
      clauses.push(`status = $${values.length}`);
    }
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    const offset = Math.max(0, Number(params.offset) || 0);
    values.push(limit, offset);
    const limitIndex = values.length - 1;
    const offsetIndex = values.length;

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT id,
              raw_label AS "rawLabel",
              raw_label_key AS "rawLabelKey",
              normalized_guess AS "normalizedGuess",
              subject,
              system,
              frequency,
              example_question_fingerprint AS "exampleQuestionFingerprint",
              source,
              status,
              metadata,
              created_at AS "createdAt",
              updated_at AS "updatedAt",
              last_seen_at AS "lastSeenAt"
       FROM taxonomy_candidates
       ${where}
       ORDER BY frequency DESC, last_seen_at DESC
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      values,
    );
    return res.rows.map(mapRow);
  }

  async updateUnknownTopicCandidateStatus(
    id: string,
    data: {
      status: TaxonomyCandidateStatus;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TaxonomyCandidate | null> {
    const res = await this.pool.query<Record<string, unknown>>(
      `UPDATE taxonomy_candidates
       SET status = $2,
           metadata = metadata || $3::jsonb,
           updated_at = now()
       WHERE id = $1
       RETURNING id,
                 raw_label AS "rawLabel",
                 raw_label_key AS "rawLabelKey",
                 normalized_guess AS "normalizedGuess",
                 subject,
                 system,
                 frequency,
                 example_question_fingerprint AS "exampleQuestionFingerprint",
                 source,
                 status,
                 metadata,
                 created_at AS "createdAt",
                 updated_at AS "updatedAt",
                 last_seen_at AS "lastSeenAt"`,
      [id, data.status, JSON.stringify(data.metadata ?? {})],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }
}
