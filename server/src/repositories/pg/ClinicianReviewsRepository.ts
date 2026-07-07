import type { Pool } from 'pg';
import type { ClinicianReviewCreateData, IClinicianReviewsRepository } from '../interfaces.js';
import type {
  ClinicianReview,
  ClinicianReviewMetrics,
  ClinicianReviewPriority,
  ClinicianReviewStatus,
} from '../../types/index.js';

const REVIEW_COLS = `
  id,
  question_id,
  report_fingerprint,
  review_priority,
  review_reason,
  review_due_at,
  review_status,
  assigned_reviewer_id,
  assigned_at,
  reviewed_at,
  reviewer_notes,
  created_at,
  updated_at
`;

function mapRow(row: Record<string, unknown>): ClinicianReview {
  return {
    id:                   String(row['id']),
    question_id:          row['question_id'] != null ? String(row['question_id']) : null,
    report_fingerprint:   row['report_fingerprint'] != null ? String(row['report_fingerprint']) : null,
    review_priority:      row['review_priority'] as ClinicianReviewPriority,
    review_reason:        String(row['review_reason']),
    review_due_at:        new Date(row['review_due_at'] as string),
    review_status:        row['review_status'] as ClinicianReviewStatus,
    assigned_reviewer_id: row['assigned_reviewer_id'] ? String(row['assigned_reviewer_id']) : null,
    assigned_at:          row['assigned_at'] ? new Date(row['assigned_at'] as string) : null,
    reviewed_at:          row['reviewed_at']  ? new Date(row['reviewed_at']  as string) : null,
    reviewer_notes:       row['reviewer_notes'] ? String(row['reviewer_notes']) : null,
    created_at:           new Date(row['created_at'] as string),
    updated_at:           new Date(row['updated_at'] as string),
  };
}

export class PgClinicianReviewsRepository implements IClinicianReviewsRepository {
  constructor(private pool: Pool) {}

  async create(data: ClinicianReviewCreateData): Promise<ClinicianReview> {
    const res = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO clinician_reviews
         (question_id, report_fingerprint, review_priority, review_reason, review_due_at, review_status, assigned_reviewer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${REVIEW_COLS}`,
      [
        data.question_id,
        data.report_fingerprint ?? null,
        data.review_priority,
        data.review_reason,
        data.review_due_at,
        data.review_status ?? 'pending',
        data.assigned_reviewer_id ?? null,
      ],
    );
    return mapRow(res.rows[0]);
  }

  async createIfAbsent(data: ClinicianReviewCreateData): Promise<ClinicianReview | null> {
    // Atomic insert-or-conflict: the partial unique indexes (migration
    // 1749800000002) make this a single round trip with no race window between
    // "check if active" and "create" — two concurrent callers can never both win.
    const onConflict = data.question_id != null
      ? `ON CONFLICT (question_id) WHERE review_status IN ('pending', 'in_review') AND question_id IS NOT NULL DO NOTHING`
      : `ON CONFLICT (report_fingerprint) WHERE review_status IN ('pending', 'in_review') AND question_id IS NULL AND report_fingerprint IS NOT NULL DO NOTHING`;
    const res = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO clinician_reviews
         (question_id, report_fingerprint, review_priority, review_reason, review_due_at, review_status, assigned_reviewer_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ${onConflict}
       RETURNING ${REVIEW_COLS}`,
      [
        data.question_id,
        data.report_fingerprint ?? null,
        data.review_priority,
        data.review_reason,
        data.review_due_at,
        data.review_status ?? 'pending',
        data.assigned_reviewer_id ?? null,
      ],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async findLatestActiveByQuestionId(questionId: string): Promise<ClinicianReview | null> {
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT ${REVIEW_COLS}
       FROM clinician_reviews
       WHERE question_id = $1
         AND review_status IN ('pending', 'in_review')
       ORDER BY created_at DESC
       LIMIT 1`,
      [questionId],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async findLatestActiveByFingerprint(fingerprint: string): Promise<ClinicianReview | null> {
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT ${REVIEW_COLS}
       FROM clinician_reviews
       WHERE report_fingerprint = $1
         AND question_id IS NULL
         AND review_status IN ('pending', 'in_review')
       ORDER BY created_at DESC
       LIMIT 1`,
      [fingerprint],
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async findQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
    limit?:    number;
    offset?:   number;
  }): Promise<ClinicianReview[]> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (params.status) {
      values.push(params.status);
      clauses.push(`review_status = $${values.length}`);
    }
    if (params.priority) {
      values.push(params.priority);
      clauses.push(`review_priority = $${values.length}`);
    }
    if (params.overdue === true) {
      clauses.push(`review_status IN ('pending', 'in_review') AND review_due_at < now()`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit  = Math.max(1, Math.min(Number(params.limit)  || 50,  200));
    const offset = Math.max(0, Number(params.offset) || 0);
    values.push(limit, offset);
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT ${REVIEW_COLS}
       FROM clinician_reviews
       ${where}
       ORDER BY
         CASE review_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ASC,
         review_due_at ASC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return res.rows.map(mapRow);
  }

  async countQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
  }): Promise<number> {
    const values: unknown[] = [];
    const clauses: string[] = [];
    if (params.status) {
      values.push(params.status);
      clauses.push(`review_status = $${values.length}`);
    }
    if (params.priority) {
      values.push(params.priority);
      clauses.push(`review_priority = $${values.length}`);
    }
    if (params.overdue === true) {
      clauses.push(`review_status IN ('pending', 'in_review') AND review_due_at < now()`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM clinician_reviews ${where}`,
      values,
    );
    return Number(res.rows[0]?.count || 0);
  }

  async update(id: string, data: {
    review_status?:       ClinicianReviewStatus;
    review_priority?:     ClinicianReviewPriority;
    review_reason?:       string;
    review_due_at?:       Date;
    assigned_reviewer_id?: string | null;
    reviewed_at?:         Date | null;
    assigned_at?:         Date | null;
    reviewer_notes?:      string | null;
  }): Promise<ClinicianReview | null> {
    const sets: string[] = ['updated_at = now()'];
    const values: unknown[] = [];
    const push = (col: string, val: unknown) => { values.push(val); sets.push(`${col} = $${values.length}`); };
    if (data.review_status        !== undefined) push('review_status',        data.review_status);
    if (data.review_priority      !== undefined) push('review_priority',      data.review_priority);
    if (data.review_reason        !== undefined) push('review_reason',        data.review_reason);
    if (data.review_due_at        !== undefined) push('review_due_at',        data.review_due_at);
    if (data.assigned_reviewer_id !== undefined) push('assigned_reviewer_id', data.assigned_reviewer_id);
    if (data.reviewed_at          !== undefined) push('reviewed_at',          data.reviewed_at);
    if (data.assigned_at          !== undefined) push('assigned_at',          data.assigned_at);
    if (data.reviewer_notes       !== undefined) push('reviewer_notes',       data.reviewer_notes);
    values.push(id);
    const res = await this.pool.query<Record<string, unknown>>(
      `UPDATE clinician_reviews SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${REVIEW_COLS}`,
      values,
    );
    return res.rows[0] ? mapRow(res.rows[0]) : null;
  }

  async getMetrics(): Promise<ClinicianReviewMetrics> {
    const res = await this.pool.query<{
      pending:          string;
      in_review:        string;
      overdue:          string;
      due_in_24h:       string;
      critical_overdue: string;
      high_overdue:     string;
      completed:        string;
      total:            string;
      avg_age_secs:     string | null;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE review_status = 'pending')::text                                                                          AS pending,
         COUNT(*) FILTER (WHERE review_status = 'in_review')::text                                                                        AS in_review,
         COUNT(*) FILTER (WHERE review_status IN ('pending','in_review') AND review_due_at < now())::text                                 AS overdue,
         COUNT(*) FILTER (WHERE review_status IN ('pending','in_review') AND review_due_at >= now() AND review_due_at <= now() + interval '24 hours')::text AS due_in_24h,
         COUNT(*) FILTER (WHERE review_status IN ('pending','in_review') AND review_priority = 'critical' AND review_due_at < now())::text AS critical_overdue,
         COUNT(*) FILTER (WHERE review_status IN ('pending','in_review') AND review_priority = 'high'     AND review_due_at < now())::text AS high_overdue,
         COUNT(*) FILTER (WHERE review_status IN ('approved','changes_requested','rejected'))::text                                        AS completed,
         COUNT(*)::text                                                                                                                    AS total,
         ROUND(AVG(EXTRACT(EPOCH FROM (now() - created_at))) FILTER (WHERE review_status IN ('pending','in_review'))::numeric, 2)::text   AS avg_age_secs
       FROM clinician_reviews`,
    );
    const row = res.rows[0];
    const total     = Number(row?.total     || 0);
    const completed = Number(row?.completed || 0);
    const avgSecs   = row?.avg_age_secs != null ? Number(row.avg_age_secs) : null;
    return {
      pending:          Number(row?.pending          || 0),
      in_review:        Number(row?.in_review        || 0),
      overdue:          Number(row?.overdue           || 0),
      due_in_24h:       Number(row?.due_in_24h        || 0),
      average_age_days: avgSecs !== null ? Math.round((avgSecs / 86400) * 100) / 100 : null,
      critical_overdue: Number(row?.critical_overdue  || 0),
      high_overdue:     Number(row?.high_overdue       || 0),
      completion_rate:  total > 0 ? Math.round((completed / total) * 10000) / 100 : null,
    };
  }
}
