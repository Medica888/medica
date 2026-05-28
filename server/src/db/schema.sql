-- Medica AI — PostgreSQL Schema
-- All JSONB columns mirror the TypeScript types in src/types/index.ts exactly.
-- Run via: npm run db:init

-- ── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  name          TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Exam Sessions ─────────────────────────────────────────────────────────────
-- questions / answers / breakdowns stored as JSONB to preserve existing shape.

CREATE TABLE IF NOT EXISTS exam_sessions (
  id                 UUID        PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode               TEXT        NOT NULL CHECK (mode IN ('exam', 'practice', 'coach')),
  questions          JSONB       NOT NULL DEFAULT '[]',
  answers            JSONB       NOT NULL DEFAULT '{}',
  score              INTEGER     NOT NULL DEFAULT 0,
  percentage         NUMERIC(6,2) NOT NULL DEFAULT 0,
  medica_score       NUMERIC(6,2) NOT NULL DEFAULT 0,
  readiness_label    TEXT        NOT NULL DEFAULT '',
  subject_breakdown  JSONB       NOT NULL DEFAULT '{}',
  system_breakdown   JSONB       NOT NULL DEFAULT '{}',
  missed_questions   JSONB       NOT NULL DEFAULT '[]',
  completed_at       TIMESTAMPTZ NOT NULL,
  duration_seconds   INTEGER     NOT NULL DEFAULT 0,
  difficulty         TEXT        NOT NULL DEFAULT 'balanced',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Question Attempts ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS question_attempts (
  id                  UUID        PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id          UUID        NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  question_id         TEXT        NOT NULL,
  selected_answer     TEXT        NOT NULL DEFAULT '',
  is_correct          BOOLEAN     NOT NULL DEFAULT FALSE,
  time_spent_seconds  INTEGER     NOT NULL DEFAULT 0,
  attempted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Flashcards ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flashcards (
  id                  UUID        PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_question_id  TEXT        NOT NULL,
  type                TEXT        NOT NULL CHECK (type IN ('Recall', 'Pearl', 'Trap', 'Mnemonic')),
  front               TEXT        NOT NULL,
  back                TEXT        NOT NULL,
  tag                 TEXT        NOT NULL DEFAULT '',
  review_status       TEXT        NOT NULL DEFAULT 'new'
                                  CHECK (review_status IN ('new', 'learning', 'review', 'mastered')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at         TIMESTAMPTZ
);

-- ── Analytics Snapshots ───────────────────────────────────────────────────────
-- study_priorities / mistake_diagnoses stored as JSONB arrays.

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id                UUID        PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_sessions    INTEGER     NOT NULL DEFAULT 0,
  average_score     NUMERIC(6,2) NOT NULL DEFAULT 0,
  subject_mastery   JSONB       NOT NULL DEFAULT '{}',
  system_mastery    JSONB       NOT NULL DEFAULT '{}',
  weak_areas        JSONB       NOT NULL DEFAULT '[]',
  study_priorities  JSONB       NOT NULL DEFAULT '[]',
  mistake_diagnoses JSONB       NOT NULL DEFAULT '[]'
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_exam_sessions_user_id
  ON exam_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_sessions_completed_at
  ON exam_sessions(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_question_attempts_user_id
  ON question_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_question_attempts_session_id
  ON question_attempts(session_id);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_id
  ON flashcards(user_id);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_user_id
  ON analytics_snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date
  ON analytics_snapshots(snapshot_date DESC);
