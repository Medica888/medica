export interface User {
  id: string;
  email: string;
  name: string;
  created_at: Date;
}

export interface UserWithHash extends User {
  password_hash: string;
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
// Tier thresholds match AnalyticsDashboard.jsx SUBJECT_STATUS (mastery_score = pct/100)

export type MasteryTier = 'priority' | 'focus' | 'reinforced' | 'ontrack';

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
  weakConcepts:    string[]; // concept names, mastery_score < 0.65
  mediumConcepts:  string[]; // concept names, 0.65 ≤ mastery_score < 0.75
  strongConcepts:  string[]; // concept names, mastery_score ≥ 0.75
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
  priorityCount:   number;    // mastery < 0.65
  focusCount:      number;    // 0.65 ≤ mastery < 0.75
  reinforcedCount: number;    // 0.75 ≤ mastery < 0.85
  ontrkCount:      number;    // mastery ≥ 0.85
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
  components: {
    mastery:     number;            // actual contribution 0–50
    confidence:  number;            // 0–20
    trend:       number;            // 0–15
    consistency: number;            // 0–15
  };
  distribution: MasteryTierDistribution;
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
  weakConceptCount: number;      // concepts where mastery_score < 0.65 (priority tier)
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
  priority:              PrescriptionConcept[]; // mastery < 0.65
  focus:                 PrescriptionConcept[]; // 0.65 ≤ mastery < 0.75
  reinforced:            PrescriptionConcept[]; // 0.75 ≤ mastery < 0.85  (≥0.85 excluded)
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
}

export interface DailyStudyPlan {
  date:                  string; // YYYY-MM-DD
  readinessStatus:       ReadinessStatus;
  estimatedMinutes:      number;
  recommendedQuestions:  number;
  recommendedFlashcards: number;
  conceptReviews:        DailyPlanConceptReview[];
  focusSubjects:         string[];
  summary:               string;
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
