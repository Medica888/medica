import { randomUUID } from 'crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { ExamSessionReservation, ExamSessionReservationSource, Question } from '../../types/index.js';
import type { IExamSessionReservationsRepository } from '../interfaces.js';

interface ReservationRow extends QueryResultRow {
  id: string;
  user_id: string;
  client_session_id: string;
  questions: Question[];
  source: ExamSessionReservationSource;
  created_at: Date;
}

function toReservation(row: ReservationRow): ExamSessionReservation {
  return {
    id: row.id,
    user_id: row.user_id,
    client_session_id: row.client_session_id,
    questions: row.questions,
    source: row.source,
    created_at: row.created_at,
  };
}

export class PgExamSessionReservationsRepository implements IExamSessionReservationsRepository {
  constructor(private pool: Pool) {}

  async create(
    reservation: { userId: string; clientSessionId: string; questions: Question[]; source: ExamSessionReservationSource },
    tx?: unknown,
  ): Promise<ExamSessionReservation> {
    const q = (tx as PoolClient | undefined) ?? this.pool;
    const res = await q.query<ReservationRow>(
      `INSERT INTO exam_session_reservations (id, user_id, client_session_id, questions, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, client_session_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING *`,
      [randomUUID(), reservation.userId, reservation.clientSessionId, JSON.stringify(reservation.questions), reservation.source],
    );
    return toReservation(res.rows[0]!);
  }

  async findByClientSessionId(userId: string, clientSessionId: string): Promise<ExamSessionReservation | null> {
    const res = await this.pool.query<ReservationRow>(
      'SELECT * FROM exam_session_reservations WHERE user_id = $1 AND client_session_id = $2',
      [userId, clientSessionId],
    );
    return res.rows[0] ? toReservation(res.rows[0]) : null;
  }
}
