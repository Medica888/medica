import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { QuestionReport, FingerprintCountRow } from '../../types/index.js';
import type { IQuestionReportsRepository } from '../interfaces.js';

export class PgQuestionReportsRepository implements IQuestionReportsRepository {
  constructor(private pool: Pool) {}

  async create(report: Omit<QuestionReport, 'id' | 'created_at'>): Promise<QuestionReport> {
    const id = randomUUID();
    const res = await this.pool.query<QuestionReport>(
      `INSERT INTO question_reports
         (id, user_id, question_id, fingerprint, reason, source, mode, difficulty,
          requested_subject, requested_system, requested_topic,
          actual_subject, actual_system, actual_topic,
          tested_concept, usmle_content_area, physician_task, stem_preview)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
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
      ],
    );
    return res.rows[0]!;
  }

  async getCountsByFingerprint(limit: number): Promise<{
    globalTotal:       number;
    globalWrongAnswer: number;
    globalBadExpl:     number;
    globalOffTopic:    number;
    fingerprints:      FingerprintCountRow[];
  }> {
    type GlobalRow = { total: string; wrong_answer: string; bad_explanation: string; off_topic: string };
    type FpRow    = GlobalRow & { fingerprint: string; unique_users: string };

    const [totals, fps] = await Promise.all([
      this.pool.query<GlobalRow>(`
        SELECT
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE reason = 'wrong_answer')   AS wrong_answer,
          COUNT(*) FILTER (WHERE reason = 'bad_explanation') AS bad_explanation,
          COUNT(*) FILTER (WHERE reason = 'off_topic')       AS off_topic
        FROM question_reports
      `),
      this.pool.query<FpRow>(`
        SELECT
          fingerprint,
          COUNT(*)                                          AS total,
          COUNT(*) FILTER (WHERE reason = 'wrong_answer')   AS wrong_answer,
          COUNT(*) FILTER (WHERE reason = 'bad_explanation') AS bad_explanation,
          COUNT(*) FILTER (WHERE reason = 'off_topic')       AS off_topic,
          COUNT(DISTINCT user_id)                            AS unique_users
        FROM question_reports
        GROUP BY fingerprint
        ORDER BY total DESC, fingerprint ASC
        LIMIT $1
      `, [limit]),
    ]);

    const g = totals.rows[0] ?? { total: '0', wrong_answer: '0', bad_explanation: '0', off_topic: '0' };

    return {
      globalTotal:       parseInt(g.total, 10),
      globalWrongAnswer: parseInt(g.wrong_answer, 10),
      globalBadExpl:     parseInt(g.bad_explanation, 10),
      globalOffTopic:    parseInt(g.off_topic, 10),
      fingerprints: fps.rows.map(r => ({
        fingerprint:    r.fingerprint,
        total:          parseInt(r.total, 10),
        wrong_answer:   parseInt(r.wrong_answer, 10),
        bad_explanation: parseInt(r.bad_explanation, 10),
        off_topic:      parseInt(r.off_topic, 10),
        unique_users:   parseInt(r.unique_users, 10),
      })),
    };
  }

  async getCountsForFingerprint(fingerprint: string): Promise<FingerprintCountRow> {
    type Row = { total: string; wrong_answer: string; bad_explanation: string; off_topic: string; unique_users: string };
    const res = await this.pool.query<Row>(`
      SELECT
        COUNT(*)                                          AS total,
        COUNT(*) FILTER (WHERE reason = 'wrong_answer')   AS wrong_answer,
        COUNT(*) FILTER (WHERE reason = 'bad_explanation') AS bad_explanation,
        COUNT(*) FILTER (WHERE reason = 'off_topic')       AS off_topic,
        COUNT(DISTINCT user_id)                            AS unique_users
      FROM question_reports
      WHERE fingerprint = $1
    `, [fingerprint]);

    const r = res.rows[0]!;
    return {
      fingerprint,
      total:          parseInt(r.total, 10),
      wrong_answer:   parseInt(r.wrong_answer, 10),
      bad_explanation: parseInt(r.bad_explanation, 10),
      off_topic:      parseInt(r.off_topic, 10),
      unique_users:   parseInt(r.unique_users, 10),
    };
  }

  async getQuarantinedFingerprints(): Promise<Set<string>> {
    const res = await this.pool.query<{ fingerprint: string }>(`
      SELECT fingerprint
      FROM question_reports
      GROUP BY fingerprint
      HAVING
        COUNT(*) FILTER (WHERE reason = 'wrong_answer') >= 2 OR
        COUNT(*) FILTER (WHERE reason = 'off_topic')    >= 3 OR
        COUNT(*)                                        >= 5
    `);
    return new Set(res.rows.map(r => r.fingerprint));
  }
}
