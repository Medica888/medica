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
  ReviewStats,
  ConceptReviewEntry,
  QuestionReport,
  FingerprintCountRow,
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
    data: {
      subject: string;
      system: string;
      body: Record<string, unknown>;
      source?: string;
      bankStatus?: string;
      mode?: string;
      difficulty?: string;
      validationScore?: number | null;
      validatedAt?: Date | string | null;
    },
    tx?: unknown,
  ): Promise<{ id: string }>;
  findByExternalId(externalId: string): Promise<{ id: string } | null>;
  findGeneratedBankQuestions(params: {
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    limit?: number;
    approvedOnly?: boolean;
  }): Promise<Record<string, unknown>[]>;
  countGeneratedBankReview(params: {
    status?: 'validated_generated' | 'approved' | 'quarantined';
  }): Promise<number>;
  findGeneratedBankReview(params: {
    externalId?: string;
    status?: 'validated_generated' | 'approved' | 'quarantined';
    limit?: number;
    offset?: number;
    sort?: 'priority' | 'newest' | 'score' | 'usage';
  }): Promise<Record<string, unknown>[]>;
  updateGeneratedBankStatus(
    externalId: string,
    status: 'validated_generated' | 'approved' | 'quarantined',
  ): Promise<Record<string, unknown> | null>;
  getGeneratedBankMetrics(): Promise<{
    total: number;
    legacy: number;
    validatedGenerated: number;
    approved: number;
    quarantined: number;
    used: number;
    totalUsage: number;
    approvalRate: number;
    quarantineRate: number;
    averageValidationScore: number | null;
    averagePendingAgeDays: number | null;
    generatedLast7d: number;
  }>;
  markUsedByExternalIds(externalIds: string[]): Promise<void>;
  /**
   * Returns generated-bank questions whose JSONB body contains `concept` in their
   * `canonicalConcepts` array. Used for concept-targeted review and adaptive prep.
   */
  getQuestionsByConcept(concept: string, limit?: number): Promise<Record<string, unknown>[]>;
  /**
   * Aggregates canonical concept frequency across all AI-source questions.
   * Returns concept → count pairs sorted by count descending.
   */
  getConceptCoverage(): Promise<Array<{ concept: string; count: number }>>;
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

  /**
   * All snapshots for a user, ordered by created_at ASC.
   * `limit` caps the result to the most recent rows (default 5000).
   * This prevents unbounded memory allocation for power users with many sessions.
   */
  findByUserId(userId: string, limit?: number): Promise<MasterySnapshot[]>;

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
   * Also updates the concept's persisted spaced-repetition schedule.
   * Records for the same (userId, conceptId) within one call are pre-aggregated
   * by the caller; the DB upsert accumulates on top of existing totals.
   */
  upsertMany(
    records: { userId: string; conceptId: string; attempted: number; correct: number }[],
    tx?: unknown,
  ): Promise<void>;

  findByUserId(userId: string): Promise<UserConceptMastery[]>;
  findByUserAndConcept(userId: string, conceptId: string): Promise<UserConceptMastery | null>;

  /**
   * Returns mastery rows where next_review_at is not null and falls on or before
   * `asOf` (defaults to now). Ordered by next_review_at ascending.
   * Capped at 100 rows.
   */
  findDueForReview(userId: string, asOf?: Date): Promise<UserConceptMastery[]>;

  /**
   * Update ONLY the SRS scheduling fields for a concept the user just reviewed.
   * Never touches mastery_score, confidence_score, attempts, correct, or
   * recent_incorrect_count — those remain driven by objective exam performance.
   * Returns the new schedule, or null if no mastery row exists for this pair.
   */
  scheduleReview(
    userId: string,
    conceptId: string,
    ease: 'again' | 'hard' | 'good' | 'easy',
    tx?: unknown,
  ): Promise<{ reviewIntervalDays: number; nextReviewAt: Date | null } | null>;
}

export interface IQuestionReportsRepository {
  create(report: Omit<QuestionReport, 'id' | 'created_at'>): Promise<QuestionReport>;

  /**
   * Returns global totals plus per-fingerprint breakdown, sorted by total desc then fingerprint asc.
   * The service layer applies quarantine thresholds on top of these raw counts.
   */
  getCountsByFingerprint(limit: number): Promise<{
    globalTotal:       number;
    globalWrongAnswer: number;
    globalBadExpl:     number;
    globalOffTopic:    number;
    globalAmbiguous:   number;
    fingerprints:      FingerprintCountRow[];
  }>;

  /**
   * Returns counts for a single fingerprint. Returns zeroes when the fingerprint has no reports.
   */
  getCountsForFingerprint(fingerprint: string): Promise<FingerprintCountRow>;

  /**
   * Returns fingerprints meeting any quarantine threshold:
   * wrong_answer >= 2 OR off_topic >= 3 OR total >= 5.
   * Used to filter quarantined questions from AI generation results.
   */
  getQuarantinedFingerprints(): Promise<Set<string>>;
}

export interface IConceptReviewLogRepository {
  insert(entry: {
    userId:         string;
    conceptId:      string;
    result:         'again' | 'hard' | 'good' | 'easy';
    intervalBefore: number;
    intervalAfter:  number;
  }, tx?: unknown): Promise<void>;

  getStats(userId: string): Promise<ReviewStats>;

  /**
   * Returns SRS review history for one concept, newest first.
   * Capped at `limit` entries (default 50).
   */
  getConceptHistory(
    userId:    string,
    conceptId: string,
    limit?:    number,
  ): Promise<ConceptReviewEntry[]>;
}

export interface AuditLogEntry {
  userId:         string | null;
  action:         string;
  questionId:     string;
  previousStatus: string | null;
  newStatus:      string | null;
  createdAt?:     Date | string;
}

export interface IAuditLogRepository {
  log(entry: AuditLogEntry): Promise<void>;
  /** Test helper — returns all entries in insertion order. Not used in production. */
  getAll(): AuditLogEntry[];
  getByQuestionId(questionId: string, limit?: number, offset?: number): Promise<AuditLogEntry[]>;
  getRecentActions(actions: string[], limit: number): Promise<AuditLogEntry[]>;
  getThroughput(windowHours: number): Promise<{ approved: number; quarantined: number }>;
}
