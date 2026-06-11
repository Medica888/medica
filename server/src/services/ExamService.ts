import { createHash } from 'crypto';
import { withTransaction } from '../config/db.js';
import type { IExamSessionsRepository, IQuestionAttemptsRepository, IQuestionsRepository } from '../repositories/interfaces.js';
import type { ExamSession, Question, SubjectStats, PaginationParams, PaginatedResult } from '../types/index.js';
import type { CreateSessionInput } from '../schemas/exam.js';
import type { ConceptMappingService } from './ConceptMappingService.js';
import type { ConceptMasteryService } from './ConceptMasteryService.js';
import { normalizeSubject, normalizeSystem } from '../lib/medicaTaxonomy.js';

const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const;

/**
 * Resolves the correct answer from any of the three field aliases that exist
 * across frontend payloads: correct_answer (canonical), correct (AI generation
 * schema), or correctAnswer (camelCase legacy).  Returns '' when all are absent
 * or null so callers never silently compare '' === ''.
 */
export function _getCorrectAnswer(q: Record<string, unknown>): string {
  const raw = q['correct_answer'] ?? q['correct'] ?? q['correctAnswer'] ?? '';
  return String(raw);
}

/**
 * Coerces any answer representation to an uppercase letter A–D, or '' if invalid.
 * Mirrors normalizeAnswerLetter() in medica-app/src/lib/answerNormalize.js.
 *
 * Handles:
 *   'A' | 'a'            → 'A'
 *   'A. option text'     → 'A'  (strips prefix — used in some legacy payloads)
 *   ' b '               → 'B'  (trims whitespace)
 *   0 | 1 | 2 | 3       → 'A' | 'B' | 'C' | 'D'
 *   null | undefined | '' | 'X' → ''
 *
 * Exported with underscore prefix for direct unit-testing (same pattern as _fingerprint).
 */
export function _normalizeAnswerLetter(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return ANSWER_LETTERS[value] ?? '';
  const raw = String(value).trim();
  const letter = (raw[0] ?? '').toUpperCase();
  return (ANSWER_LETTERS as readonly string[]).includes(letter) ? letter : '';
}

/**
 * Stable content-based identity for a question.
 * Uses SHA-256 of (normalizedStem + correctAnswer + subject + system) so that:
 *  - identical questions across sessions get the same external_id (dedup)
 *  - different correct answers or subjects produce different ids (no collision)
 *  - the full stem is used — no truncation risk
 */
export function _fingerprint(
  text: string,
  correctAnswer = '',
  subject = '',
  system = '',
): string {
  const normalizedStem = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const raw = [normalizedStem, correctAnswer.toLowerCase(), subject.toLowerCase(), system.toLowerCase()].join('\x00');
  return createHash('sha256').update(raw).digest('hex');
}

function canonicalSubject(value: unknown): string {
  return normalizeSubject(value) ?? '';
}

function canonicalSystem(value: unknown): string {
  return normalizeSystem(value) ?? '';
}

function normalizeQuestionTaxonomy(question: Question): Question {
  return {
    ...question,
    subject: canonicalSubject(question.subject),
    system: canonicalSystem(question.system),
  };
}

function normalizeStatsKeys<T extends SubjectStats>(
  stats: Record<string, T>,
  normalizer: (value: unknown) => string | null,
): Record<string, T> {
  const normalized: Record<string, T> = {};
  for (const [key, value] of Object.entries(stats || {})) {
    const normalizedKey = normalizer(key) ?? key;
    const existing = normalized[normalizedKey];
    normalized[normalizedKey] = existing
      ? {
          total: existing.total + value.total,
          correct: existing.correct + value.correct,
          percentage: existing.total + value.total > 0
            ? Math.round(((existing.correct + value.correct) / (existing.total + value.total)) * 100)
            : 0,
        } as T
      : value;
  }
  return normalized;
}

export class ExamService {
  constructor(
    private sessions: IExamSessionsRepository,
    private attempts: IQuestionAttemptsRepository,
    private questions?: IQuestionsRepository,
    private conceptMapping?: ConceptMappingService,
    private conceptMastery?: ConceptMasteryService,
  ) {}

  async createSession(userId: string, input: CreateSessionInput): Promise<ExamSession> {
    const normalizedQuestions = input.questions.map(normalizeQuestionTaxonomy);
    const normalizedMissedQuestions = input.missed_questions.map(normalizeQuestionTaxonomy);
    const normalizedSubjectBreakdown = normalizeStatsKeys(input.subject_breakdown, normalizeSubject);
    const normalizedSystemBreakdown = normalizeStatsKeys(input.system_breakdown, normalizeSystem);

    const sessionData = {
      user_id: userId,
      mode: input.mode,
      questions: normalizedQuestions as Question[],
      answers: input.answers,
      score: input.score,
      percentage: input.percentage,
      medica_score: input.medica_score,
      readiness_label: input.readiness_label,
      subject_breakdown: normalizedSubjectBreakdown as Record<string, SubjectStats>,
      system_breakdown: normalizedSystemBreakdown as Record<string, SubjectStats>,
      missed_questions: normalizedMissedQuestions as Question[],
      completed_at: new Date(input.completed_at),
      duration_seconds: input.duration_seconds,
      difficulty: input.difficulty,
    };

    return withTransaction(async (tx) => {
      // 1. Upsert questions into the normalized bank and build AI-id → DB-UUID map.
      //    Skipped when questions repo is not wired (backward-compat path).
      const questionRefMap = new Map<string, string>(); // q.id → questions.id
      if (this.questions) {
        for (let i = 0; i < normalizedQuestions.length; i++) {
          const q = normalizedQuestions[i]!;
          const externalId = _fingerprint(q.text, _getCorrectAnswer(q as unknown as Record<string, unknown>), q.subject ?? '', q.system ?? '');
          if (!externalId) continue;
          const { id: dbId } = await this.questions.upsertByExternalId(
            externalId,
            {
              subject: q.subject ?? '',
              system:  q.system  ?? '',
              body:    q as unknown as Record<string, unknown>,
            },
            tx,
          );
          questionRefMap.set(q.id, dbId);
        }
      }

      // 2. Persist the session (JSONB blob preserved for backward compat).
      const s = await this.sessions.create(sessionData, tx);

      // 2b. Map question metadata to concept nodes (Phase 2).
      if (this.conceptMapping) {
        for (const q of normalizedQuestions) {
          const dbId = questionRefMap.get(q.id);
          if (dbId) {
            await this.conceptMapping.mapQuestion(q as Question, dbId, tx);
          }
        }
      }

      // 2c. Update per-user concept mastery for directly linked concepts (Phase 3).
      //     Direct links only — no hierarchy roll-up.
      if (this.conceptMastery && questionRefMap.size > 0) {
        const answered = normalizedQuestions
          .map((q) => ({
            questionDbId:      questionRefMap.get(q.id) ?? '',
            isCorrect:         _normalizeAnswerLetter(input.answers[q.id]) === _normalizeAnswerLetter(_getCorrectAnswer(q as unknown as Record<string, unknown>)),
            canonicalConcepts: q.canonicalConcepts,
          }))
          .filter((x) => x.questionDbId !== '');
        await this.conceptMastery.updateFromSession(userId, answered, tx);
      }

      // 3. Write session→question links with position ordering.
      if (questionRefMap.size > 0) {
        const links = normalizedQuestions
          .map((q, i) => ({ questionId: questionRefMap.get(q.id)!, position: i }))
          .filter((l) => l.questionId != null);
        await this.sessions.createQuestionLinks(s.id, links, tx);
      }

      // 4. Write per-question attempts; include question_ref_id when available.
      const attempts = normalizedQuestions.map((q) => ({
        user_id:            userId,
        session_id:         s.id,
        question_id:        q.id,
        selected_answer:    input.answers[q.id] ?? '',
        is_correct:         _normalizeAnswerLetter(input.answers[q.id]) === _normalizeAnswerLetter(_getCorrectAnswer(q as unknown as Record<string, unknown>)),
        time_spent_seconds: input.time_spent?.[q.id] ?? 0,
        attempted_at:       new Date(input.completed_at),
        question_ref_id:    questionRefMap.get(q.id),
      }));
      await this.attempts.createMany(attempts, tx);

      return s;
    });
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
}
