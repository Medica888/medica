import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { QuestionReport, FingerprintCountRow } from '../../types/index.js';
import type { IQuestionReportsRepository } from '../interfaces.js';
import { QUARANTINE_THRESHOLDS } from '../../lib/quarantinePolicy.js';

export class PgQuestionReportsRepository implements IQuestionReportsRepository {
  constructor(private pool: Pool) {}

  async create(report: Omit<QuestionReport, 'id' | 'created_at'>): Promise<{ report: QuestionReport; inserted: boolean }> {
    const id = randomUUID();
    const clientReportId = report.client_report_id ?? null;
    // `xmax = 0` is true only for a tuple created by the INSERT branch of this
    // statement — the ON CONFLICT DO UPDATE branch always produces a tuple with a
    // non-zero xmax, even though the SET clause is a same-value no-op. This lets a
    // single round trip distinguish "brand new report" from "idempotent replay"
    // without a separate SELECT (which would itself race with a concurrent insert).
    const res = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO question_reports
         (id, user_id, question_id, fingerprint, reason, source, mode, difficulty,
          requested_subject, requested_system, requested_topic,
          actual_subject, actual_system, actual_topic,
          tested_concept, usmle_content_area, physician_task, stem_preview, client_report_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (user_id, client_report_id) WHERE client_report_id IS NOT NULL
       DO UPDATE SET client_report_id = EXCLUDED.client_report_id
       RETURNING *, (xmax = 0) AS inserted`,
      [
        id,
        report.user_id,
        report.question_id,
        report.fingerprint,
        report.reason,
        report.source,
        report.mode,
        report.difficulty,
        report.requested_subject,
        report.requested_system,
        report.requested_topic,
        report.actual_subject,
        report.actual_system,
        report.actual_topic,
        report.tested_concept,
        report.usmle_content_area,
        report.physician_task,
        report.stem_preview,
        clientReportId,
      ],
    );
    const row = res.rows[0]!;
    const inserted = row['inserted'] === true;
    const { inserted: _inserted, ...rest } = row;
    return { report: rest as unknown as QuestionReport, inserted };
  }

  async getCountsByFingerprint(limit: number): Promise<{
    globalTotal:          number;
    globalWrongAnswer:    number;
    globalBadExpl:        number;
    globalOffTopic:       number;
    globalAmbiguous:      number;
    globalDuplicate:      number;
    globalTechnicalIssue: number;
    fingerprints:         FingerprintCountRow[];
  }> {
    type GlobalRow = {
      total: string; wrong_answer: string; bad_explanation: string;
      off_topic: string; ambiguous_or_insufficient_clues: string;
      duplicate: string; technical_issue: string;
    };
    type FpRow = GlobalRow & {
      fingerprint: string;
      unique_users: string;
      unique_wrong_answer_users: string;
      unique_off_topic_users: string;
      unique_duplicate_users: string;
    };

    const [totals, fps] = await Promise.all([
      this.pool.query<GlobalRow>(`
        SELECT
          COUNT(*)                                                                       AS total,
          COUNT(*) FILTER (WHERE reason = 'wrong_answer')                               AS wrong_answer,
          COUNT(*) FILTER (WHERE reason = 'bad_explanation')                            AS bad_explanation,
          COUNT(*) FILTER (WHERE reason = 'off_topic')                                  AS off_topic,
          COUNT(*) FILTER (WHERE reason = 'ambiguous_or_insufficient_clues')            AS ambiguous_or_insufficient_clues,
          COUNT(*) FILTER (WHERE reason = 'duplicate')                                  AS duplicate,
          COUNT(*) FILTER (WHERE reason = 'technical_issue')                            AS technical_issue
        FROM question_reports
      `),
      this.pool.query<FpRow>(`
        SELECT
          fingerprint,
          COUNT(*)                                                                       AS total,
          COUNT(*) FILTER (WHERE reason = 'wrong_answer')                               AS wrong_answer,
          COUNT(*) FILTER (WHERE reason = 'bad_explanation')                            AS bad_explanation,
          COUNT(*) FILTER (WHERE reason = 'off_topic')                                  AS off_topic,
          COUNT(*) FILTER (WHERE reason = 'ambiguous_or_insufficient_clues')            AS ambiguous_or_insufficient_clues,
          COUNT(*) FILTER (WHERE reason = 'duplicate')                                  AS duplicate,
          COUNT(*) FILTER (WHERE reason = 'technical_issue')                            AS technical_issue,
          COUNT(DISTINCT user_id)                                                        AS unique_users,
          COUNT(DISTINCT user_id) FILTER (WHERE reason = 'wrong_answer')                AS unique_wrong_answer_users,
          COUNT(DISTINCT user_id) FILTER (WHERE reason = 'off_topic')                   AS unique_off_topic_users,
          COUNT(DISTINCT user_id) FILTER (WHERE reason = 'duplicate')                   AS unique_duplicate_users
        FROM question_reports
        GROUP BY fingerprint
        ORDER BY total DESC, fingerprint ASC
        LIMIT $1
      `, [limit]),
    ]);

    const g = totals.rows[0] ?? {
      total: '0', wrong_answer: '0', bad_explanation: '0',
      off_topic: '0', ambiguous_or_insufficient_clues: '0',
      duplicate: '0', technical_issue: '0',
    };

    return {
      globalTotal:          parseInt(g.total, 10),
      globalWrongAnswer:    parseInt(g.wrong_answer, 10),
      globalBadExpl:        parseInt(g.bad_explanation, 10),
      globalOffTopic:       parseInt(g.off_topic, 10),
      globalAmbiguous:      parseInt(g.ambiguous_or_insufficient_clues, 10),
      globalDuplicate:      parseInt(g.duplicate, 10),
      globalTechnicalIssue: parseInt(g.technical_issue, 10),
      fingerprints: fps.rows.map(r => ({
        fingerprint:                    r.fingerprint,
        total:                          parseInt(r.total, 10),
        wrong_answer:                   parseInt(r.wrong_answer, 10),
        bad_explanation:                parseInt(r.bad_explanation, 10),
        off_topic:                      parseInt(r.off_topic, 10),
        ambiguous_or_insufficient_clues: parseInt(r.ambiguous_or_insufficient_clues, 10),
        duplicate:                      parseInt(r.duplicate, 10),
        technical_issue:                parseInt(r.technical_issue, 10),
        unique_users:                   parseInt(r.unique_users, 10),
        unique_wrong_answer_users:      parseInt(r.unique_wrong_answer_users, 10),
        unique_off_topic_users:         parseInt(r.unique_off_topic_users, 10),
        unique_duplicate_users:         parseInt(r.unique_duplicate_users, 10),
      })),
    };
  }

  async getCountsForFingerprint(fingerprint: string): Promise<FingerprintCountRow> {
    type Row = {
      total: string; wrong_answer: string; bad_explanation: string;
      off_topic: string; ambiguous_or_insufficient_clues: string;
      duplicate: string; technical_issue: string; unique_users: string;
      unique_wrong_answer_users: string; unique_off_topic_users: string;
      unique_duplicate_users: string;
    };
    const res = await this.pool.query<Row>(`
      SELECT
        COUNT(*)                                                                     AS total,
        COUNT(*) FILTER (WHERE reason = 'wrong_answer')                             AS wrong_answer,
        COUNT(*) FILTER (WHERE reason = 'bad_explanation')                          AS bad_explanation,
        COUNT(*) FILTER (WHERE reason = 'off_topic')                                AS off_topic,
        COUNT(*) FILTER (WHERE reason = 'ambiguous_or_insufficient_clues')          AS ambiguous_or_insufficient_clues,
        COUNT(*) FILTER (WHERE reason = 'duplicate')                                AS duplicate,
        COUNT(*) FILTER (WHERE reason = 'technical_issue')                          AS technical_issue,
        COUNT(DISTINCT user_id)                                                      AS unique_users,
        COUNT(DISTINCT user_id) FILTER (WHERE reason = 'wrong_answer')              AS unique_wrong_answer_users,
        COUNT(DISTINCT user_id) FILTER (WHERE reason = 'off_topic')                 AS unique_off_topic_users,
        COUNT(DISTINCT user_id) FILTER (WHERE reason = 'duplicate')                 AS unique_duplicate_users
      FROM question_reports
      WHERE fingerprint = $1
    `, [fingerprint]);

    const r = res.rows[0]!;
    return {
      fingerprint,
      total:                          parseInt(r.total, 10),
      wrong_answer:                   parseInt(r.wrong_answer, 10),
      bad_explanation:                parseInt(r.bad_explanation, 10),
      off_topic:                      parseInt(r.off_topic, 10),
      ambiguous_or_insufficient_clues: parseInt(r.ambiguous_or_insufficient_clues, 10),
      duplicate:                      parseInt(r.duplicate, 10),
      technical_issue:                parseInt(r.technical_issue, 10),
      unique_users:                   parseInt(r.unique_users, 10),
      unique_wrong_answer_users:      parseInt(r.unique_wrong_answer_users, 10),
      unique_off_topic_users:         parseInt(r.unique_off_topic_users, 10),
      unique_duplicate_users:         parseInt(r.unique_duplicate_users, 10),
    };
  }

  async getQuarantinedFingerprints(): Promise<Set<string>> {
    // Thresholds are parameterized from the shared policy module (lib/quarantinePolicy.ts)
    // rather than hardcoded here, so this can never silently drift from the service/memory
    // repo's decision for the same data.
    const res = await this.pool.query<{ fingerprint: string }>(`
      SELECT fingerprint
      FROM question_reports
      GROUP BY fingerprint
      HAVING
        COUNT(DISTINCT user_id) FILTER (WHERE reason = 'wrong_answer') >= $1 OR
        COUNT(DISTINCT user_id) FILTER (WHERE reason = 'off_topic')    >= $2 OR
        COUNT(DISTINCT user_id) FILTER (WHERE reason = 'duplicate')    >= $3 OR
        COUNT(DISTINCT user_id)                                        >= $4
    `, [
      QUARANTINE_THRESHOLDS.wrongAnswerMin,
      QUARANTINE_THRESHOLDS.offTopicMin,
      QUARANTINE_THRESHOLDS.duplicateMin,
      QUARANTINE_THRESHOLDS.totalMin,
    ]);
    return new Set(res.rows.map(r => r.fingerprint));
  }
}
