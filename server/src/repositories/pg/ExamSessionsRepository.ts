import { randomUUID } from 'crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { ExamSession, PaginationParams, PaginatedResult } from '../../types/index.js';
import type { IExamSessionsRepository } from '../interfaces.js';

interface SessionRow extends QueryResultRow {
  id: string;
  user_id: string;
  mode: string;
  questions: ExamSession['questions'];
  answers: ExamSession['answers'];
  score: number;
  percentage: number;
  medica_score: number;
  readiness_label: string;
  subject_breakdown: ExamSession['subject_breakdown'];
  system_breakdown: ExamSession['system_breakdown'];
  missed_questions: ExamSession['missed_questions'];
  completed_at: Date;
  duration_seconds: number;
  difficulty: string;
}

function toSession(row: SessionRow): ExamSession {
  return {
    id: row.id,
    user_id: row.user_id,
    mode: row.mode as ExamSession['mode'],
    questions: row.questions,
    answers: row.answers,
    score: Number(row.score),
    percentage: Number(row.percentage),
    medica_score: Number(row.medica_score),
    readiness_label: row.readiness_label,
    subject_breakdown: row.subject_breakdown,
    system_breakdown: row.system_breakdown,
    missed_questions: row.missed_questions,
    completed_at: row.completed_at,
    duration_seconds: Number(row.duration_seconds),
    difficulty: row.difficulty,
  };
}

export class PgExamSessionsRepository implements IExamSessionsRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<ExamSession | null> {
    const res = await this.pool.query<SessionRow>(
      'SELECT * FROM exam_sessions WHERE id = $1',
      [id],
    );
    return res.rows[0] ? toSession(res.rows[0]) : null;
  }

  async findByUserId(
    userId: string,
    params: PaginationParams = { page: 1, limit: 20 },
  ): Promise<PaginatedResult<ExamSession>> {
    const offset = (params.page - 1) * params.limit;

    const [dataRes, countRes] = await Promise.all([
      this.pool.query<SessionRow>(
        `SELECT * FROM exam_sessions
         WHERE user_id = $1
         ORDER BY completed_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, params.limit, offset],
      ),
      this.pool.query<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM exam_sessions WHERE user_id = $1',
        [userId],
      ),
    ]);

    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);
    return {
      data: dataRes.rows.map(toSession),
      total,
      page: params.page,
      limit: params.limit,
      totalPages: Math.ceil(total / params.limit),
    };
  }

  async create(session: Omit<ExamSession, 'id'>, tx?: unknown): Promise<ExamSession> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    const id = randomUUID();
    const res = await q.query<SessionRow>(
      `INSERT INTO exam_sessions
         (id, user_id, mode, questions, answers, score, percentage, medica_score,
          readiness_label, subject_breakdown, system_breakdown, missed_questions,
          completed_at, duration_seconds, difficulty)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        id,
        session.user_id,
        session.mode,
        JSON.stringify(session.questions),
        JSON.stringify(session.answers),
        session.score,
        session.percentage,
        session.medica_score,
        session.readiness_label,
        JSON.stringify(session.subject_breakdown),
        JSON.stringify(session.system_breakdown),
        JSON.stringify(session.missed_questions),
        session.completed_at,
        session.duration_seconds,
        session.difficulty,
      ],
    );
    return toSession(res.rows[0]!);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM exam_sessions WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async createQuestionLinks(
    sessionId: string,
    links: { questionId: string; position: number }[],
    tx?: unknown,
  ): Promise<void> {
    if (!links.length) return;
    const q = (tx as PoolClient | undefined) ?? this.pool;
    await q.query(
      `INSERT INTO exam_session_questions (session_id, question_id, position)
       SELECT unnest($1::uuid[]), unnest($2::uuid[]), unnest($3::integer[])
       ON CONFLICT (session_id, question_id) DO NOTHING`,
      [
        links.map(() => sessionId),
        links.map((l) => l.questionId),
        links.map((l) => l.position),
      ],
    );
  }
}
