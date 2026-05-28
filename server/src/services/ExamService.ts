import { withTransaction } from '../config/db.js';
import type { IExamSessionsRepository, IQuestionAttemptsRepository, IQuestionsRepository } from '../repositories/interfaces.js';
import type { ExamSession, Question, SubjectStats, PaginationParams, PaginatedResult } from '../types/index.js';
import type { CreateSessionInput } from '../schemas/exam.js';

function _fingerprint(stem: string): string {
  return (stem || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export class ExamService {
  constructor(
    private sessions: IExamSessionsRepository,
    private attempts: IQuestionAttemptsRepository,
    private questions?: IQuestionsRepository,
  ) {}

  async createSession(userId: string, input: CreateSessionInput): Promise<ExamSession> {
    const sessionData = {
      user_id: userId,
      mode: input.mode,
      questions: input.questions as Question[],
      answers: input.answers,
      score: input.score,
      percentage: input.percentage,
      medica_score: input.medica_score,
      readiness_label: input.readiness_label,
      subject_breakdown: input.subject_breakdown as Record<string, SubjectStats>,
      system_breakdown: input.system_breakdown as Record<string, SubjectStats>,
      missed_questions: input.missed_questions as Question[],
      completed_at: new Date(input.completed_at),
      duration_seconds: input.duration_seconds,
      difficulty: input.difficulty,
    };

    const session = await withTransaction(async (tx) => {
      const s = await this.sessions.create(sessionData, tx);

      const attempts = input.questions.map((q) => ({
        user_id: userId,
        session_id: s.id,
        question_id: q.id,
        selected_answer: input.answers[q.id] ?? '',
        is_correct: input.answers[q.id] === q.correct_answer,
        time_spent_seconds: input.time_spent?.[q.id] ?? 0,
        attempted_at: new Date(input.completed_at),
      }));
      await this.attempts.createMany(attempts, tx);

      return s;
    });

    // Fire-and-forget: persist question bank entries for cross-session dedup
    if (this.questions) {
      this._persistQuestions(session.id, input.questions).catch(
        (err) => console.error('[ExamService] question bank persistence failed:', err.message),
      );
    }

    return session;
  }

  async getSessions(
    userId: string,
    params?: PaginationParams,
  ): Promise<PaginatedResult<ExamSession>> {
    return this.sessions.findByUserId(userId, params);
  }

  async getSession(id: string, userId: string): Promise<ExamSession> {
    const session = await this.sessions.findById(id);
    if (!session) throw new Error('NOT_FOUND');
    if (session.user_id !== userId) throw new Error('FORBIDDEN');
    return session;
  }

  async deleteSession(id: string, userId: string): Promise<void> {
    const session = await this.sessions.findById(id);
    if (!session) throw new Error('NOT_FOUND');
    if (session.user_id !== userId) throw new Error('FORBIDDEN');
    await this.sessions.delete(id);
  }

  private async _persistQuestions(
    sessionId: string,
    questions: CreateSessionInput['questions'],
  ): Promise<void> {
    if (!this.questions) return;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const externalId = _fingerprint(q.text);
      if (!externalId) continue;
      await this.questions.upsertByExternalId(externalId, {
        subject: q.subject ?? '',
        system:  q.system  ?? '',
        body:    q as unknown as Record<string, unknown>,
      });
    }
  }
}
