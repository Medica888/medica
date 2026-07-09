import type {
  User,
  UserWithHash,
  AuthToken,
  AuthTokenType,
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
  ClinicianReview,
  ClinicianReviewMetrics,
  ClinicianReviewPriority,
  ClinicianReviewStatus,
  CatalogQuestion,
} from '../types/index.js';

export interface IAuthTokensRepository {
  create(data: {
    userId: string;
    tokenHash: string;
    type: AuthTokenType;
    expiresAt: Date;
  }): Promise<AuthToken>;
  findActiveByHash(tokenHash: string, type: AuthTokenType): Promise<AuthToken | null>;
  markUsed(id: string): Promise<void>;
  /** Mark all active (non-expired, non-used) tokens of the given type for a user as used. */
  markAllActiveUsedForUser(userId: string, type: AuthTokenType, tx?: unknown): Promise<void>;
  deleteExpired(): Promise<void>;
}

export interface IUsersRepository {
  findById(id: string): Promise<User | null>;
  /** Returns the full row including soft-deleted users. Use for auth checks that must detect deleted_at. */
  findByIdWithHash(id: string): Promise<UserWithHash | null>;
  findByEmail(email: string): Promise<UserWithHash | null>;
  /** Like findByEmail but includes soft-deleted rows. Use in register to keep deleted emails reserved. */
  findByEmailIncludingDeleted(email: string): Promise<UserWithHash | null>;
  create(data: { email: string; name: string; password_hash: string }): Promise<User>;
  updateName(id: string, name: string): Promise<User | null>;
  /** Soft-deletes the user by setting deleted_at. Returns false if already deleted or not found. */
  delete(id: string): Promise<boolean>;
  setEmailVerified(id: string): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string, tx?: unknown): Promise<void>;
}

export interface IExamSessionsRepository {
  findById(id: string): Promise<ExamSession | null>;
  findByUserId(userId: string, params?: PaginationParams): Promise<PaginatedResult<ExamSession>>;
  /** If session.id is provided the server uses it as the primary key (idempotent retry support). */
  create(session: Omit<ExamSession, 'id'> & { id?: string }, tx?: unknown): Promise<ExamSession>;
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

export interface FlashcardSrsUpdate {
  reviewed_at: Date;
  review_count: number;
  review_status: Flashcard['review_status'];
  ease: string | null;
  interval_days: number;
  next_review: Date | null;
}

export interface IFlashcardsRepository {
  findByUserId(userId: string): Promise<Flashcard[]>;
  findById(id: string): Promise<Flashcard | null>;
  create(flashcard: Omit<Flashcard, 'id' | 'created_at'>): Promise<Flashcard>;
  createMany(flashcards: Omit<Flashcard, 'id' | 'created_at'>[]): Promise<Flashcard[]>;
  updateStatus(id: string, userId: string, status: Flashcard['review_status']): Promise<Flashcard | null>;
  markReviewed(id: string, userId: string, srs: FlashcardSrsUpdate): Promise<Flashcard | null>;
  deleteByUserId(userId: string): Promise<number>;
}

export interface IAnalyticsRepository {
  findLatestByUserId(userId: string): Promise<AnalyticsSnapshot | null>;
  findByUserId(userId: string): Promise<AnalyticsSnapshot[]>;
  upsert(snapshot: Omit<AnalyticsSnapshot, 'id'>): Promise<AnalyticsSnapshot>;
}

export type GeneratedBankStatus = 'validated_generated' | 'approved' | 'restored' | 'quarantined' | 'validation_failed' | 'rejected';

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
      aiModel?: string | null;
      validatorVersion?: string | null;
      reviewMetadata?: Record<string, unknown> | null;
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
    status?: GeneratedBankStatus;
  }): Promise<number>;
  findGeneratedBankReview(params: {
    externalId?: string;
    status?: GeneratedBankStatus;
    limit?: number;
    offset?: number;
    sort?: 'priority' | 'newest' | 'score' | 'usage';
  }): Promise<Record<string, unknown>[]>;
  updateGeneratedBankStatus(
    externalId: string,
    status: GeneratedBankStatus,
  ): Promise<Record<string, unknown> | null>;
  updateReviewedContentMetadata(
    externalId: string,
    metadata: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null>;
  getGeneratedBankMetrics(): Promise<{
    total: number;
    legacy: number;
    validatedGenerated: number;
    approved: number;
    restored: number;
    quarantined: number;
    validationFailed: number;
    rejected: number;
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
  /**
   * Student-safe catalog: returns authored questions stripped of answers/explanations.
   * Filters source='authored' AND bank_status IN ('approved','restored').
   */
  findStudentCatalog(params: {
    page?: number;
    limit?: number;
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    search?: string;
    /** Content fingerprints to exclude (cross-user quarantine — see QuestionReportService). */
    excludeFingerprints?: string[];
  }): Promise<PaginatedResult<CatalogQuestion>>;
  /**
   * Resolves a list of external IDs to their full question bodies (with answers).
   * Only returns authored questions with safe bank_status, excluding any whose content
   * fingerprint is cross-user quarantined (see QuestionReportService).
   * Used by POST /api/qbank/sessions to serve full question data for a session.
   */
  findByExternalIds(
    ids: string[],
    excludeFingerprints?: string[],
  ): Promise<Array<{ id: string; body: Record<string, unknown> }>>;
}

// ── Concept graph ─────────────────────────────────────────────────────────────

export type TaxonomyCandidateStatus = 'pending' | 'approved_canonical' | 'mapped_alias' | 'rejected';

export interface TaxonomyCandidate {
  id: string;
  rawLabel: string;
  rawLabelKey: string;
  normalizedGuess: string;
  subject: string;
  system: string;
  frequency: number;
  exampleQuestionFingerprint: string | null;
  source: string;
  type: 'topic' | 'concept';
  status: TaxonomyCandidateStatus;
  metadata: Record<string, unknown>;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  lastSeenAt?: Date | string;
}

export interface ITaxonomyCandidatesRepository {
  upsertUnknownTopicCandidate(data: {
    rawLabel: string;
    normalizedGuess: string;
    subject: string;
    system: string;
    exampleQuestionFingerprint?: string | null;
    source?: string;
    type?: 'topic' | 'concept';
    metadata?: Record<string, unknown>;
  }): Promise<TaxonomyCandidate>;

  findUnknownTopicCandidates(params?: {
    status?: TaxonomyCandidateStatus;
    limit?: number;
    offset?: number;
  }): Promise<TaxonomyCandidate[]>;

  updateUnknownTopicCandidateStatus(
    id: string,
    data: {
      status: TaxonomyCandidateStatus;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TaxonomyCandidate | null>;
}

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
      source?: 'legacy' | 'canonical';
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
  /**
   * Creates a report, or returns the original record unchanged when
   * `client_report_id` matches a prior report by the same user (idempotent
   * replay). `inserted` is true only when a new row was actually created —
   * callers must gate one-time side effects (e.g. clinician review triggers)
   * on `inserted === true` so retried/replayed requests never repeat them.
   */
  create(report: Omit<QuestionReport, 'id' | 'created_at'>): Promise<{ report: QuestionReport; inserted: boolean }>;

  /**
   * Returns global totals plus per-fingerprint breakdown, sorted by total desc then fingerprint asc.
   * The service layer applies quarantine thresholds on top of these raw counts.
   */
  getCountsByFingerprint(limit: number): Promise<{
    globalTotal:          number;
    globalWrongAnswer:    number;
    globalBadExpl:        number;
    globalOffTopic:       number;
    globalAmbiguous:      number;
    globalDuplicate:      number;
    globalTechnicalIssue: number;
    fingerprints:         FingerprintCountRow[];
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

export interface ClinicianReviewCreateData {
  /** Bank question external ID, when one is resolvable. Null if not (see report_fingerprint). */
  question_id:          string | null;
  /** Content fingerprint — always set for report-triggered reviews, used for aggregation
   *  and as the dedup key when question_id is null. */
  report_fingerprint?:  string | null;
  review_priority:      ClinicianReviewPriority;
  review_reason:        string;
  review_due_at:        Date;
  review_status?:       ClinicianReviewStatus;
  assigned_reviewer_id?: string | null;
}

export interface IClinicianReviewsRepository {
  create(data: ClinicianReviewCreateData): Promise<ClinicianReview>;

  /**
   * Atomically creates a new active review only if none currently exists for the
   * same identity (question_id when present, else report_fingerprint). Returns null
   * when an active review already exists — the caller should escalate that one
   * instead of creating a duplicate. Prevents the race where two concurrent
   * find-then-create calls both observe "no active review".
   */
  createIfAbsent(data: ClinicianReviewCreateData): Promise<ClinicianReview | null>;

  /** Returns the most recent pending/in_review record for a question, or null. */
  findLatestActiveByQuestionId(questionId: string): Promise<ClinicianReview | null>;

  /** Returns the most recent pending/in_review record for a fingerprint, or null.
   *  Used when no bank question external ID is resolvable for the report. */
  findLatestActiveByFingerprint(fingerprint: string): Promise<ClinicianReview | null>;

  findQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
    limit?:    number;
    offset?:   number;
  }): Promise<ClinicianReview[]>;

  countQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
  }): Promise<number>;

  update(id: string, data: {
    review_status?:       ClinicianReviewStatus;
    review_priority?:     ClinicianReviewPriority;
    review_reason?:       string;
    review_due_at?:       Date;
    assigned_reviewer_id?: string | null;
    reviewed_at?:         Date | null;
    assigned_at?:         Date | null;
    reviewer_notes?:      string | null;
  }): Promise<ClinicianReview | null>;

  getMetrics(): Promise<ClinicianReviewMetrics>;
}

export interface AIUsageRecord {
  request_count: number;
  token_count: number;
}

export interface IAIUsageBudgetRepository {
  /**
   * Atomically reserve one request slot for today, gated by requestLimit and tokenLimit.
   * Returns 'ok' if the slot was reserved (count was < limit, or limit is null).
   * Returns 'denied' if either budget is exhausted (count >= limit, including limit === 0).
   * THROWS on storage failure — callers must treat a throw as a storage error (fail-closed).
   * Zero limits are handled by the caller before invoking this method.
   */
  reserveRequest(userId: string, date: string, requestLimit: number | null, tokenLimit: number | null): Promise<'ok' | 'denied'>;
  /**
   * Decrement today's request count by 1 when the provider is never called
   * (e.g., AbortError before first API call). Best-effort; fire-and-forget acceptable.
   */
  releaseRequest(userId: string, date: string): Promise<void>;
  /**
   * Atomically add token counts to the daily row. Called after a confirmed response.
   * Never gates the request — informational only.
   */
  addTokens(userId: string, date: string, tokens: number): Promise<void>;
  /** Atomically increment daily counters. Returns the updated totals. */
  incrementUsage(userId: string, date: string, requests: number, tokens: number): Promise<AIUsageRecord>;
  /** Returns null when no row exists for this user+date (zero usage). */
  getUsage(userId: string, date: string): Promise<AIUsageRecord | null>;
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
