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
