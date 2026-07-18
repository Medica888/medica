import { randomUUID } from 'crypto';
import type { ExamSessionReservation, ExamSessionReservationSource, Question } from '../../types/index.js';
import type { IExamSessionReservationsRepository } from '../interfaces.js';

function key(userId: string, clientSessionId: string): string {
  return `${userId}:${clientSessionId}`;
}

export class InMemoryExamSessionReservationsRepository implements IExamSessionReservationsRepository {
  private store = new Map<string, ExamSessionReservation>();

  async create(
    reservation: { userId: string; clientSessionId: string; questions: Question[]; source: ExamSessionReservationSource },
    _tx?: unknown,
  ): Promise<ExamSessionReservation> {
    const k = key(reservation.userId, reservation.clientSessionId);
    const existing = this.store.get(k);
    if (existing) return existing;

    const created: ExamSessionReservation = {
      id: randomUUID(),
      user_id: reservation.userId,
      client_session_id: reservation.clientSessionId,
      questions: reservation.questions,
      source: reservation.source,
      created_at: new Date(),
    };
    this.store.set(k, created);
    return created;
  }

  async findByClientSessionId(userId: string, clientSessionId: string): Promise<ExamSessionReservation | null> {
    return this.store.get(key(userId, clientSessionId)) ?? null;
  }

  _clear(): void {
    this.store.clear();
  }
}
