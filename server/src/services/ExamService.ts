import { createHash } from 'crypto';
import { withTransaction } from '../config/db.js';
import type {
  IExamSessionsRepository,
  IExamSessionReservationsRepository,
  IQuestionAttemptsRepository,
  IQuestionsRepository,
  IQuestionReportsRepository,
} from '../repositories/interfaces.js';
import type { ExamSession, Question, SubjectStats, PaginationParams, PaginatedResult } from '../types/index.js';
import type { CreateSessionInput, ReserveSessionInput } from '../schemas/exam.js';
import type { ConceptMappingService } from './ConceptMappingService.js';
import type { ConceptMasteryService } from './ConceptMasteryService.js';
import { normalizeSubject, normalizeSystem } from '../lib/medicaTaxonomy.js';

// A–L covers the USMLE Step 1 extended-matching ceiling (up to 12 options).
// M and beyond are never valid — mirrors medica-app/src/lib/answerNormalize.js.
const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

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
 * Coerces any answer representation to an uppercase letter A–L, or '' if invalid.
 * Mirrors normalizeAnswerLetter() in medica-app/src/lib/answerNormalize.js.
 *
 * Handles:
 *   'A' | 'a'            → 'A'
 *   'A. option text'     → 'A'  (strips prefix — used in some legacy payloads)
 *   ' b '               → 'B'  (trims whitespace)
 *   0 | 1 | ... | 11    → 'A' | 'B' | ... | 'L'
 *   null | undefined | '' | 'X' | 'M' | 12+ → ''  (M and beyond are never valid)
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

function normalizeOptionsFromBody(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const options = value
    .map((option) => {
      if (typeof option === 'string') return option;
      if (option && typeof option === 'object' && 'text' in option) return String((option as { text: unknown }).text ?? '');
      return '';
    })
    .map((option) => option.trim())
    .filter(Boolean);
  return options.length > 0 ? options : fallback;
}

function questionFromAuthoritativeBody(id: string, body: Record<string, unknown>, fallback: Question): Question {
  return normalizeQuestionTaxonomy({
    ...fallback,
    ...body,
    id,
    text: String(body.text ?? body.stem ?? fallback.text ?? ''),
    options: normalizeOptionsFromBody(body.options, fallback.options),
    correct_answer: String(body.correct_answer ?? body.correct ?? body.correctAnswer ?? fallback.correct_answer ?? ''),
  } as Question);
}

function optionLettersFor(question: Question): string[] {
  return question.options
    .map((_, index) => ANSWER_LETTERS[index])
    .filter((letter): letter is typeof ANSWER_LETTERS[number] => Boolean(letter));
}

function optionTextToLetter(value: unknown, question: Question): string {
  if (value === null || value === undefined) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  const normalizedRaw = raw.toLowerCase().replace(/\s+/g, ' ');
  const optionIndex = question.options.findIndex((option) => (
    String(option ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === normalizedRaw
  ));
  if (optionIndex >= 0) return ANSWER_LETTERS[optionIndex] ?? '';

  const letter = _normalizeAnswerLetter(value);
  return optionLettersFor(question).includes(letter as typeof ANSWER_LETTERS[number]) ? letter : '';
}

function correctLetterFor(question: Question): string {
  return optionTextToLetter(_getCorrectAnswer(question as unknown as Record<string, unknown>), question);
}

function isCorrect(question: Question, answers: Record<string, string>): boolean {
  const selected = optionTextToLetter(answers[question.id], question);
  return selected !== '' && selected === correctLetterFor(question);
}

function buildStats(questions: Question[], answers: Record<string, string>, key: 'subject' | 'system'): Record<string, SubjectStats> {
  const stats: Record<string, SubjectStats> = {};
  for (const q of questions) {
    const label = q[key] || 'Unknown';
    const existing = stats[label] ?? { total: 0, correct: 0, percentage: 0 };
    existing.total += 1;
    if (isCorrect(q, answers)) existing.correct += 1;
    existing.percentage = existing.total > 0 ? Math.round((existing.correct / existing.total) * 100) : 0;
    stats[label] = existing;
  }
  return stats;
}

function difficultyWeight(question: Question, sessionDifficulty: string): number {
  const difficulty = question.difficulty || sessionDifficulty;
  const weights: Record<string, number> = {
    'More Easy': 0.5,
    Balanced: 1,
    'More Hard': 1.3,
    'NBME Difficult': 1.6,
    'UWorld Challenge': 2,
  };
  return weights[difficulty] ?? 1;
}

function readinessLabel(score: number): string {
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Ready';
  if (score >= 50) return 'Borderline';
  if (score >= 35) return 'Building';
  return 'Needs Foundation';
}

function computeCanonicalSessionResult(
  questions: Question[],
  submittedAnswers: Record<string, string>,
  sessionDifficulty: string,
) {
  const answers: Record<string, string> = {};
  let correct = 0;
  let answered = 0;
  let weightedCorrect = 0;
  let weightedTotal = 0;

  for (const q of questions) {
    const selected = optionTextToLetter(submittedAnswers[q.id], q);
    const questionCorrect = selected !== '' && selected === correctLetterFor(q);
    answers[q.id] = selected;
    if (selected) answered += 1;
    if (questionCorrect) correct += 1;

    const weight = difficultyWeight(q, sessionDifficulty);
    weightedTotal += weight;
    if (questionCorrect) weightedCorrect += weight;
  }

  const total = questions.length;
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  const difficultyBonus = weightedTotal > 0 ? Math.round((weightedCorrect / weightedTotal) * 100) : 0;
  const completionRate = total > 0 ? answered / total : 0;
  const rawMedicaScore = (percentage * 0.7) + (difficultyBonus * 0.2) + (completionRate * 100 * 0.1);
  const medicaScore = Math.min(100, Math.max(0, Math.round(rawMedicaScore)));

  return {
    answers,
    score: correct,
    percentage,
    medicaScore,
    readinessLabel: readinessLabel(medicaScore),
    subjectBreakdown: buildStats(questions, answers, 'subject'),
    systemBreakdown: buildStats(questions, answers, 'system'),
    missedQuestions: questions.filter((q) => !isCorrect(q, answers)),
  };
}

export class ExamService {
  constructor(
    private sessions: IExamSessionsRepository,
    private attempts: IQuestionAttemptsRepository,
    private questions?: IQuestionsRepository,
    private conceptMapping?: ConceptMappingService,
    private conceptMastery?: ConceptMasteryService,
    private reservations?: IExamSessionReservationsRepository,
    private questionReports?: IQuestionReportsRepository,
  ) {}

  private async resolveAuthoritativeQuestions(questions: Question[]): Promise<Question[]> {
    if (!this.questions) return questions;
    const rows = await this.questions.findAuthoritativeQuestionsByIds(questions.map((q) => q.id), []);
    if (rows.length === 0) return questions;

    const byExternalId = new Map(rows.map((row) => [row.id, row.body]));
    return questions.map((q) => {
      const body = byExternalId.get(q.id);
      return body ? questionFromAuthoritativeBody(q.id, body, q) : q;
    });
  }

  /**
   * Reserves an immutable server-side snapshot of the exact question set for a
   * quiz attempt, before the user starts answering. IDs only — bodies are
   * resolved authoritatively from storage, never trusted from the caller.
   * Idempotent by (userId, clientSessionId): retrying an existing reservation
   * returns { reserved: true } without altering the original snapshot.
   * Returns { reserved: false } (never throws) when the questions repo/reservations
   * repo isn't wired, or when not every id resolves to a legitimate stored question
   * (e.g. purely local/offline content that never touched the backend) — that
   * session simply has no snapshot and falls back to existing behavior at completion.
   */
  async reserveSession(userId: string, input: ReserveSessionInput): Promise<{ reserved: boolean; clientSessionId: string }> {
    const clientSessionId = input.clientSessionId;
    if (!this.reservations || !this.questions) return { reserved: false, clientSessionId };

    const existing = await this.reservations.findByClientSessionId(userId, clientSessionId);
    if (existing) return { reserved: true, clientSessionId };

    const trimmedIds = [...new Set(input.questionIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (trimmedIds.length === 0) return { reserved: false, clientSessionId };

    const quarantined = this.questionReports ? await this.questionReports.getQuarantinedFingerprints() : new Set<string>();
    const found = await this.questions.findAuthoritativeQuestionsByIds(trimmedIds, [...quarantined]);
    if (found.length !== trimmedIds.length) return { reserved: false, clientSessionId };

    const byId = new Map(found.map((row) => [row.id, row.body]));
    const questions = trimmedIds.map((id) => questionFromAuthoritativeBody(
      id,
      byId.get(id)!,
      { id, text: '', options: [], correct_answer: '' },
    ));

    await this.reservations.create({ userId, clientSessionId, questions });
    return { reserved: true, clientSessionId };
  }

  async createSession(userId: string, input: CreateSessionInput): Promise<ExamSession> {
    // Idempotent retry: if the client supplied a UUID, check for an existing session.
    // Same user → return it immediately (duplicate retry deduplication).
    // Different user → ignore the client ID and let the server generate a fresh UUID
    //   so a user cannot accidentally collide with another user's session ID.
    let resolvedClientId: string | undefined;
    if (input.clientSessionId) {
      const existing = await this.sessions.findById(input.clientSessionId);
      if (existing) {
        if (existing.user_id === userId) return existing;
        // Owned by another user — fall through with no client-supplied ID.
      } else {
        resolvedClientId = input.clientSessionId;
      }
    }

    // If the client reserved a snapshot before answering, the submitted question set
    // must exactly match it (order-independent) and scoring uses ONLY the reserved
    // bodies — submitted text/options/correct_answer/explanation are ignored entirely,
    // even if a question was quarantined after the reservation was made.
    let snapshotQuestions: Question[] | null = null;
    if (input.clientSessionId && this.reservations) {
      const reservation = await this.reservations.findByClientSessionId(userId, input.clientSessionId);
      if (reservation) {
        const submittedIds = new Set(input.questions.map((q) => q.id));
        const snapshotIds = new Set(reservation.questions.map((q) => q.id));
        const setsMatch = submittedIds.size === snapshotIds.size
          && [...submittedIds].every((id) => snapshotIds.has(id));
        if (!setsMatch) throw new Error('SNAPSHOT_MISMATCH');
        snapshotQuestions = reservation.questions;
      }
    }

    const normalizedQuestions = snapshotQuestions
      ? snapshotQuestions.map(normalizeQuestionTaxonomy)
      : await this.resolveAuthoritativeQuestions(input.questions.map(normalizeQuestionTaxonomy));
    const canonicalResult = computeCanonicalSessionResult(normalizedQuestions, input.answers, input.difficulty);

    const sessionData = {
      ...(resolvedClientId && { id: resolvedClientId }),
      user_id: userId,
      mode: input.mode,
      questions: normalizedQuestions as Question[],
      answers: canonicalResult.answers,
      score: canonicalResult.score,
      percentage: canonicalResult.percentage,
      medica_score: canonicalResult.medicaScore,
      readiness_label: canonicalResult.readinessLabel,
      subject_breakdown: canonicalResult.subjectBreakdown as Record<string, SubjectStats>,
      system_breakdown: canonicalResult.systemBreakdown as Record<string, SubjectStats>,
      missed_questions: canonicalResult.missedQuestions as Question[],
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
            isCorrect:         isCorrect(q, canonicalResult.answers),
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
        selected_answer:    canonicalResult.answers[q.id] ?? '',
        is_correct:         isCorrect(q, canonicalResult.answers),
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
