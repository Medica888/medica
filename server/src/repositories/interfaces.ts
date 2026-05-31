import type {
  User,
  UserWithHash,
  ExamSession,
  QuestionAttempt,
  Flashcard,
  AnalyticsSnapshot,
  Concept,
  QuestionConcept,
  UserConceptMastery,
  MasterySnapshot,
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
  /** Write rows into exam_session_questions preserving question order. No-op when links is empty. */
  createQuestionLinks(
    sessionId: string,
    links: { questionId: string; position: number }[],
    tx?: unknown,
  ): Promise<void>;
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

// ── Concept graph ─────────────────────────────────────────────────────────────

export interface IConceptsRepository {
  /**
   * Insert or update a concept by slug.
   * On conflict:
   *   - name and updated_at are always updated
   *   - subject/system are preserved (first-wins)
   *   - parent_concept_id is set when EXCLUDED value is non-null; otherwise kept
   */
  upsertBySlug(
    slug: string,
    data: {
      name: string;
      subject: string;
      system: string;
      description?: string;
      parent_concept_id?: string;
    },
    tx?: unknown,
  ): Promise<Concept>;

  findBySlug(slug: string): Promise<Concept | null>;
  findById(id: string): Promise<Concept | null>;
  /** Fetch multiple concepts by ID in one round-trip. Missing IDs are silently omitted. */
  findManyById(ids: string[]): Promise<Concept[]>;

  /**
   * Returns the ancestor chain for a concept, ordered from immediate parent to root.
   * Does not include the concept itself.
   */
  findAncestors(conceptId: string): Promise<Concept[]>;

  /**
   * Returns all descendants (children, grandchildren, …) in breadth-first order.
   */
  findDescendants(conceptId: string): Promise<Concept[]>;
}

export interface IQuestionConceptsRepository {
  /**
   * Upsert weighted question→concept links.
   * On conflict (same question_id + concept_id): updates weight.
   */
  linkMany(
    links: { questionId: string; conceptId: string; weight: number }[],
    tx?: unknown,
  ): Promise<void>;
  /** tx must be passed when called inside a transaction so uncommitted writes are visible. */
  findByQuestionId(questionId: string, tx?: unknown): Promise<QuestionConcept[]>;
  findByConceptId(conceptId: string): Promise<QuestionConcept[]>;
}

export interface IMasterySnapshotsRepository {
  /** Insert a full-mastery-state snapshot batch; one row per concept. */
  insertBatch(
    snapshots: {
      userId:       string;
      conceptId:    string;
      sessionId:    string;
      masteryScore: number;
      confidence:   number;
      attemptCount: number;
    }[],
  ): Promise<void>;

  /** All snapshots for a user, ordered by created_at ASC. */
  findByUserId(userId: string): Promise<MasterySnapshot[]>;

  /**
   * Session IDs with snapshots, oldest to newest.
   * Used to find "current" (last) and "previous" (second-last) batches.
   */
  findBatchIds(userId: string): Promise<string[]>;

  /** All snapshots for one batch. */
  findByBatch(userId: string, sessionId: string): Promise<MasterySnapshot[]>;
}

export interface IUserConceptMasteryRepository {
  /**
   * Increment attempt/correct counters and recompute mastery_score for each
   * (userId, conceptId) pair. Rows are created on first encounter.
   * Records for the same (userId, conceptId) within one call are pre-aggregated
   * by the caller; the DB upsert accumulates on top of existing totals.
   */
  upsertMany(
    records: { userId: string; conceptId: string; attempted: number; correct: number }[],
    tx?: unknown,
  ): Promise<void>;

  findByUserId(userId: string): Promise<UserConceptMastery[]>;
  findByUserAndConcept(userId: string, conceptId: string): Promise<UserConceptMastery | null>;
}
