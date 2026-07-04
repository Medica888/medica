import { getPool } from '../config/db.js';

interface SchemaCheck {
  name: string;
  sql: string;
}

const REQUIRED_CHECKS: SchemaCheck[] = [
  // ── Migration 001 ──────────────────────────────────────────────────────────
  {
    name: 'questions table (migration 001)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'questions'`,
  },
  {
    name: 'exam_session_questions table (migration 001)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'exam_session_questions'`,
  },
  {
    name: 'question_attempts.question_ref_id column (migration 001)',
    sql: `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'question_attempts'
            AND column_name  = 'question_ref_id'`,
  },
  // ── Migration 005 ──────────────────────────────────────────────────────────
  {
    name: 'concepts table (migration 005)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'concepts'`,
  },
  {
    name: 'question_concepts table (migration 005)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'question_concepts'`,
  },
  {
    name: 'flashcards.question_ref_id column (migration 005)',
    sql: `SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'flashcards'
            AND column_name  = 'question_ref_id'`,
  },
  // ── Migration 006 ──────────────────────────────────────────────────────────
  {
    name: 'user_concept_mastery table (migration 006)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'user_concept_mastery'`,
  },
  // ── Migration 1749000000001 (auth-account-safety) ──────────────────────────
  {
    name: 'auth_tokens table (migration auth-account-safety)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'auth_tokens'`,
  },
  // ── Migration 1749200000001 (clinician-reviews) ───────────────────────────
  {
    name: 'clinician_reviews table (migration clinician-reviews)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'clinician_reviews'`,
  },
  // ── Migration 1749500000001 (operational-reliability-schema) ─────────────
  {
    name: 'user_ai_usage table (migration operational-reliability-schema)',
    sql: `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'user_ai_usage'`,
  },
];

/**
 * Validates that all schema elements required by application code exist.
 * Throws with a diagnostic message listing missing elements and the fix command.
 * No-op in in-memory mode (no DATABASE_URL).
 */
export async function validateSchema(): Promise<void> {
  const pool = getPool();
  if (!pool) return;

  const missing: string[] = [];

  for (const check of REQUIRED_CHECKS) {
    const result = await pool.query(check.sql);
    if ((result.rowCount ?? 0) === 0) {
      missing.push(check.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[schema] Required schema elements are missing — run migrations first.\n\n` +
      `Missing:\n${missing.map((n) => `  – ${n}`).join('\n')}\n\n` +
      `Fix: cd server && npm run migrate`,
    );
  }
}
