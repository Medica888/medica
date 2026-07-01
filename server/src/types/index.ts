export interface User {
  id: string;
  email: string;
  name: string;
  email_verified: boolean;
  email_verified_at: Date | null;
  created_at: Date;
}

export interface UserWithHash extends User {
  password_hash: string;
  deleted_at: Date | null;
}

export type AuthTokenType = 'password_reset' | 'email_verification';

export interface AuthToken {
  id: string;
  user_id: string;
  token_hash: string;
  type: AuthTokenType;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface ExamSession {
  id: string;
  user_id: string;
  mode: 'exam' | 'practice' | 'coach';
  questions: Question[];
  answers: Record<string, string>;
  score: number;
  percentage: number;
  medica_score: number;
  readiness_label: string;
  subject_breakdown: Record<string, SubjectStats>;
  system_breakdown: Record<string, SystemStats>;
  missed_questions: Question[];
  completed_at: Date;
  duration_seconds: number;
  difficulty: string;
}

export interface Question {
  id: string;
  text: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  subject?: string;
  system?: string;
  difficulty?: string;
  pearl?: string;
  commonTrap?: string;
  wrongAnswerExplanations?: Record<string, string>;
  memoryAnchor?: string;
  // Concept-signal metadata forwarded from AI generation
  testedConcept?: string;
  weakSpotCategory?: string;
  topic?: string;
  canonicalTopic?: string;
  topicSlug?: string;
  topicSource?: string;
  questionAngle?: string;
  // Canonical concepts from v8.0.0 taxonomy stored in JSONB body at generation time
  canonicalConcepts?: string[];
}

export interface SubjectStats {
  total: number;
  correct: number;
  percentage: number;
}

export interface SystemStats {
  total: number;
  correct: number;
  percentage: number;
}

export interface QuestionAttempt {
  id: string;
  user_id: string;
  session_id: string;
  question_id: string;
  selected_answer: string;
  is_correct: boolean;
  time_spent_seconds: number;
  attempted_at: Date;
  question_ref_id?: string; // FK → questions(id); populated when question bank is active
}

export interface Flashcard {
  id: string;
  user_id: string;
  source_question_id: string;
  type: 'Recall' | 'Pearl' | 'Trap' | 'Mnemonic';
  front: string;
  back: string;
  tag: string;
  review_status: 'new' | 'learning' | 'review' | 'mastered';
  created_at: Date;
  reviewed_at?: Date;
  question_ref_id?: string; // nullable FK → questions(id); populated when source question is known
  // v9.0.0-alpha.5 — full-fidelity metadata for Topic Intelligence and SRS
  subject?: string;
  system?: string;
  topic?: string;
  canonical_topic?: string;
  topic_slug?: string;
  source_mode?: string;
  memory_anchor?: string | null;
  common_trap?: string | null;
  source_pearl?: string | null;
  weak_spot_category?: string;
  reinforcement_priority?: string;
  review_count?: number;
  ease?: string | null;
  last_missed_reason?: string | null;
  interval_days?: number;
  next_review?: Date | null;
}

// ── Concept graph ─────────────────────────────────────────────────────────────

export interface Concept {
  id: string;
  name: string;
  slug: string;
  subject: string;
  system: string;
  parent_concept_id?: string;
  difficulty: string;
  description: string;
  source: 'legacy' | 'canonical';
  created_at: Date;
  updated_at: Date;
}

export interface QuestionConcept {
  question_id: string;
  concept_id: string;
  weight: number;
}

export interface UserConceptMastery {
  user_id:                string;
  concept_id:             string;
  attempts:               number;
  correct:                number;
  mastery_score:          number;
  confidence_score:       number;
  recent_incorrect_count: number;
  review_interval_days:   number;
  next_review_at?:        Date;
  last_reviewed_at?:      Date;
  last_seen_at:           Date;
  created_at:             Date;
  updated_at:             Date;
}

export interface AnalyticsSnapshot {
  id: string;
  user_id: string;
  snapshot_date: Date;
  total_sessions: number;
  average_score: number;
  subject_mastery: Record<string, number>;
  system_mastery: Record<string, number>;
  weak_areas: string[];
  study_priorities: StudyPriority[];
  mistake_diagnoses: MistakeDiagnosis[];
}

export interface StudyPriority {
  subject: string;
  system?: string;
  priority_score: number;
  recommended_hours: number;
  reason: string;
}

export interface MistakeDiagnosis {
  type: 'retention_failure' | 'knowledge_gap' | 'selective_blind_spot';
  subject?: string;
  system?: string;
  description: string;
  affected_questions: string[];
}

export interface ProgressGain {
  session_id: string;
  previous_average: number;
  current_score: number;
  delta: number;
  subject_gains: Record<string, number>;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Mastery read DTOs ─────────────────────────────────────────────────────────
// Mastery overview keeps legacy buckets; Study Prescription uses p1/p2/p3.

export type MasteryTier = 'p1' | 'p2' | 'p3' | 'ontrack' | 'priority' | 'focus' | 'reinforced';

export interface MasteryTierDistribution {
  priority:   number;
  focus:      number;
  reinforced: number;
  ontrack:    number;
}

export interface MasteryOverview {
  total_concepts:     number;
  avg_mastery_score:  number;
  avg_confidence:     number;
  distribution:       MasteryTierDistribution;
  confident_concepts: number; // concepts with attempts >= 5
}

export interface EnrichedConceptMastery {
  concept: Concept;
  mastery: UserConceptMastery;
  tier:    MasteryTier;
}

export interface ConceptMasteryDetail {
  concept:       Concept;
  mastery:       UserConceptMastery | null;
  tier:          MasteryTier | null;
  ancestor_path: string[]; // slugs root-first → self
}

// ── Adaptive exam generation ──────────────────────────────────────────────────

export type AdaptiveStrategy = 'random' | 'adaptive';

export interface AdaptiveBlueprint {
  strategy:        AdaptiveStrategy;
  enabled:         boolean;
  reason?:         string;
  weakConcepts:    string[]; // concept names, P1 mastery_score < 0.50
  mediumConcepts:  string[]; // concept names, P2 0.50 <= mastery_score < 0.70
  strongConcepts:  string[]; // concept names, P3/on-track mastery_score >= 0.70
  targetConcepts:  string[]; // allocated for this session: 50% weak + 30% medium
  promptFocusText: string;   // injected into AI generation prompt (server-internal)
}

// ── Mastery progress tracking ─────────────────────────────────────────────────

export interface MasterySnapshot {
  id:            string;
  user_id:       string;
  concept_id:    string;
  session_id:    string;
  mastery_score: number;
  confidence:    number;
  attempt_count: number;
  created_at:    Date;
}

export interface MasteryProgress {
  currentMastery:   number;
  previousMastery:  number | null;
  improvement:      number | null;
  priorityConcepts: { current: number; previous: number | null };
  weakConcepts:     { current: number; previous: number | null };
  sessionCount:     number;
}

export interface MasteryTrendPoint {
  sessionId:       string;
  date:            string;    // ISO timestamp
  avgMastery:      number;
  totalConcepts:   number;
  priorityCount:   number;    // mastery < 0.50
  focusCount:      number;    // 0.50 <= mastery < 0.70
  reinforcedCount: number;    // 0.70 <= mastery < 0.80
  ontrkCount:      number;    // mastery >= 0.80
}

// ── Exam readiness engine ─────────────────────────────────────────────────────

export type ReadinessStatus =
  | 'Needs Intensive Review'   // 0–49
  | 'Developing'               // 50–69
  | 'Approaching Readiness'    // 70–84
  | 'Exam Ready';              // 85–100

/** Minimal score computed by ProgressTrackingService.getReadiness(). */
export interface ReadinessScore {
  overallReadiness: number;         // 0–100
  status:           ReadinessStatus;
  label?:           'Concept Readiness';
  components: {
    mastery:     number;
    confidence:  number;
    trend:       number;
    consistency: number;
    coverage?: number;
    diversity?: number;
    recentPerformance?: number;
  };
  distribution: MasteryTierDistribution;
  legacyInternal?: {
    overallReadiness: number;
    status: ReadinessStatus;
    components: {
      mastery: number;
      confidence: number;
      trend: number;
      consistency: number;
    };
  };
}

/** Topic-level readiness from ProgressTrackingService.getTopicReadiness(). */
export interface TopicReadiness {
  conceptId:      string;
  conceptName:    string;
  readiness:      number;
  status:         ReadinessStatus;
  trend:          'up' | 'down' | 'stable';
  recommendation: string;
}

// ── Subject-level mastery rollup ─────────────────────────────────────────────

export interface SubjectRollup {
  subject:          string;      // e.g. "Pharmacology" — from concept.subject
  rollupMastery:    number;      // 0–1 attempt-weighted avg mastery across subject concepts
  rollupConfidence: number;      // 0–1 attempt-weighted avg confidence
  totalAttempts:    number;      // Σ attempts across all concepts in this subject
  weakConceptCount: number;      // concepts where mastery_score < 0.50 (P1)
  tier:             MasteryTier; // derived from rollupMastery via masteryTier()
}

// ── Study prescription ───────────────────────────────────────────────────────

export interface PrescriptionConcept {
  name:            string;
  subject?:        string;   // from concept.subject — used for subject chip in UI
  masteryScore:    number;   // 0–1
  confidence:      number;   // 0–1; saturates at 5 attempts
  attempts:        number;
  recentIncorrect: number;
  recommendation:  string;
}

export interface StudyPrescription {
  strategy:              'adaptive' | 'random';
  enabled:               boolean;
  reason?:               string;
  p1:                    PrescriptionConcept[];
  p2:                    PrescriptionConcept[];
  p3:                    PrescriptionConcept[];
  priority:              PrescriptionConcept[]; // legacy alias for p1
  focus:                 PrescriptionConcept[]; // legacy alias for p2
  reinforced:            PrescriptionConcept[]; // legacy alias for p3
  estimatedStudyTime:    number;                // minutes; coefficients: 5/3/2 per concept
  recommendedQuestions:  number;                // capped at 40
  recommendedFlashcards: number;                // capped at 30
}

export interface DailyPlanConceptReview {
  conceptId:          string;
  name:               string;
  subject:            string;
  priority:           MasteryTier;
  reason:             string;
  nextReviewAt?:      string | null;
  reviewIntervalDays: number;
  usmleContentArea?:  string;
  physicianTask?:     string;
}

export interface DailyStudyPlan {
  date:                    string; // YYYY-MM-DD
  readinessStatus:         ReadinessStatus;
  estimatedMinutes:        number;
  recommendedQuestions:    number;
  recommendedFlashcards:   number;
  conceptReviews:          DailyPlanConceptReview[];
  focusSubjects:           string[];
  focusUsmleContentAreas?: string[];
  focusPhysicianTasks?:    string[];
  summary:                 string;
}

export interface ReviewStats {
  reviewedToday:      number;
  reviewedThisWeek:   number;
  currentStreak:      number;
  totalReviewed:      number; // distinct concepts reviewed via SRS
  todayBreakdown:     { again: number; hard: number; good: number; easy: number };
  longestStreak:      number;
  activeDaysThisWeek: number;
  dailyGoal:          number;
  goalProgress:       number; // alias for reviewedToday; kept separate for future custom goals
  activity30Days:     { date: string; reviews: number }[];
}

export interface AdaptiveFlashcardPlan {
  strategy:             AdaptiveStrategy;
  enabled:              boolean;
  reason?:              string;
  weakConcepts:         string[]; // all weak concepts, sorted weakest-first
  targetConcepts:       string[]; // top MAX_TARGET_CONCEPTS from weakConcepts
  recommendedCardCount: number;   // targetConcepts.length * 2, max 20
  promptFocusText:      string;   // server-internal, injected into AI prompt
}

// ── Concept review history ────────────────────────────────────────────────────

export interface ConceptReviewEntry {
  result:         'again' | 'hard' | 'good' | 'easy';
  reviewedAt:     string; // ISO timestamp
  intervalBefore: number; // SRS interval in days before this review
  intervalAfter:  number; // SRS interval in days after this review
}

export interface ConceptReviewHistory {
  conceptId:           string;
  totalReviews:        number; // count of returned entries (capped at 50)
  currentIntervalDays: number | null; // null when no mastery row exists
  nextReviewAt:        string | null; // ISO; null when no review scheduled
  lastReview:          ConceptReviewEntry | null; // reviews[0], or null
  reviews:             ConceptReviewEntry[];      // newest first, max 50
}

// ── Question reports ──────────────────────────────────────────────────────────

export type QuestionReportReason    = 'wrong_answer' | 'bad_explanation' | 'off_topic' | 'ambiguous_or_insufficient_clues' | 'duplicate' | 'technical_issue';
export type QuestionQuarantineStatus = 'clear' | 'watch' | 'quarantined';
export type QuestionRecommendedAction = 'none' | 'review' | 'repair_explanation' | 'quarantine' | 'revalidate_clues';

/** Raw per-fingerprint count row returned by the repository (no quarantine logic). */
export interface FingerprintCountRow {
  fingerprint:                    string;
  total:                          number;
  wrong_answer:                   number;
  bad_explanation:                number;
  off_topic:                      number;
  ambiguous_or_insufficient_clues: number;
  duplicate:                      number;
  technical_issue:                number;
  unique_users:                   number;
}

/** Full per-fingerprint report with quarantine status — produced by QuestionReportService. */
export interface QuestionFingerprintReport {
  fingerprint:       string;
  totalReports:      number;
  byReason: {
    wrong_answer:                   number;
    bad_explanation:                number;
    off_topic:                      number;
    ambiguous_or_insufficient_clues: number;
    duplicate:                      number;
    technical_issue:                number;
  };
  uniqueUsers:       number;
  quarantineStatus:  QuestionQuarantineStatus;
  primaryReason:     QuestionReportReason | null;
  recommendedAction: QuestionRecommendedAction;
}

/** Entry in the summary's topFingerprints list (flat shape for easy table rendering). */
export interface QuestionReportSummaryEntry {
  fingerprint:                    string;
  totalReports:                   number;
  wrongAnswerReports:             number;
  badExplanationReports:          number;
  offTopicReports:                number;
  ambiguousReports:               number;
  duplicateReports:               number;
  technicalIssueReports:          number;
  uniqueUsers:                    number;
  quarantineStatus:               QuestionQuarantineStatus;
  primaryReason:                  QuestionReportReason | null;
  recommendedAction:              QuestionRecommendedAction;
}

/** Top-level analytics summary returned by GET /api/question-reports/summary. */
export interface QuestionReportSummary {
  totalReports: number;
  byReason: {
    wrong_answer:                   number;
    bad_explanation:                number;
    off_topic:                      number;
    ambiguous_or_insufficient_clues: number;
    duplicate:                      number;
    technical_issue:                number;
  };
  topFingerprints: QuestionReportSummaryEntry[];
}

export interface QuestionReport {
  id:                 string;
  user_id:            string | null;  // null for anonymous reporters
  question_id:        string | null;  // TEXT — bank question IDs are non-UUID strings
  fingerprint:        string;
  reason:             QuestionReportReason;
  source:             string | null;
  mode:               string | null;
  difficulty:         string | null;
  requested_subject:  string | null;
  requested_system:   string | null;
  requested_topic:    string | null;
  actual_subject:     string | null;
  actual_system:      string | null;
  actual_topic:       string | null;
  tested_concept:     string | null;
  usmle_content_area: string | null;
  physician_task:     string | null;
  stem_preview:       string | null;
  /** Opaque UUID generated client-side before the first attempt. Used for idempotent retries. */
  client_report_id?:  string | null;
  created_at:         Date;
}

// ── Clinician review ──────────────────────────────────────────────────────────

export type ClinicianReviewPriority = 'critical' | 'high' | 'medium' | 'low';
export type ClinicianReviewStatus   = 'pending' | 'in_review' | 'approved' | 'changes_requested' | 'rejected';

export interface ClinicianReview {
  id:                   string;
  question_id:          string;
  review_priority:      ClinicianReviewPriority;
  review_reason:        string;
  review_due_at:        Date;
  review_status:        ClinicianReviewStatus;
  assigned_reviewer_id: string | null;
  assigned_at:          Date | null;
  reviewed_at:          Date | null;
  reviewer_notes:       string | null;
  created_at:           Date;
  updated_at:           Date;
}

export interface ClinicianReviewMetrics {
  pending:           number;
  in_review:         number;
  overdue:           number;
  due_in_24h:        number;
  average_age_days:  number | null;
  critical_overdue:  number;
  high_overdue:      number;
  completion_rate:   number | null;
}
