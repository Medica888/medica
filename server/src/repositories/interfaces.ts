import type {
  User,
  UserWithHash,
  ExamSession,
  QuestionAttempt,
  Flashcard,
  AnalyticsSnapshot,
  PaginationParams,
  PaginatedResult,
} from '../types/index.js';

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<UserWithHash | null>;
  create(data: { email: string; name: string; password_hash: string }): Promise<User>;
  updateName(id: string, name: string): Promise<User | null>;
  delete(id: string): Promise<boolean>;
}

export interface IExamSessionsRepository {
  findById(id: string): Promise<ExamSession | null>;
  findByUserId(userId: string, params?: PaginationParams): Promise<PaginatedResult<ExamSession>>;
  create(session: Omit<ExamSession, 'id'>, tx?: unknown): Promise<ExamSession>;
  delete(id: string): Promise<boolean>;
}

export interface IQuestionAttemptsRepository {
  findBySessionId(sessionId: string): Promise<QuestionAttempt[]>;
  findByUserId(userId: string, limit?: number): Promise<QuestionAttempt[]>;
  createMany(attempts: Omit<QuestionAttempt, 'id'>[], tx?: unknown): Promise<QuestionAttempt[]>;
}

export interface IFlashcardsRepository {
  findByUserId(userId: string): Promise<Flashcard[]>;
  findById(id: string): Promise<Flashcard | null>;
  create(flashcard: Omit<Flashcard, 'id' | 'created_at'>): Promise<Flashcard>;
  createMany(flashcards: Omit<Flashcard, 'id' | 'created_at'>[]): Promise<Flashcard[]>;
  updateStatus(id: string, userId: string, status: Flashcard['review_status']): Promise<Flashcard | null>;
  markReviewed(id: string, userId: string): Promise<Flashcard | null>;
  deleteByUserId(userId: string): Promise<number>;
}

export interface IAnalyticsRepository {
  findLatestByUserId(userId: string): Promise<AnalyticsSnapshot | null>;
  findByUserId(userId: string): Promise<AnalyticsSnapshot[]>;
  upsert(snapshot: Omit<AnalyticsSnapshot, 'id'>): Promise<AnalyticsSnapshot>;
}

export interface IQuestionsRepository {
  /** Upsert a question by its content fingerprint. Returns the DB UUID. */
  upsertByExternalId(
    externalId: string,
    data: { subject: string; system: string; body: Record<string, unknown> },
    tx?: unknown,
  ): Promise<{ id: string }>;
  findByExternalId(externalId: string): Promise<{ id: string } | null>;
}
