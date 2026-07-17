import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgExamSessionsRepository } from '../repositories/pg/ExamSessionsRepository.js';
import { PgQuestionAttemptsRepository } from '../repositories/pg/QuestionAttemptsRepository.js';
import { PgExamSessionReservationsRepository } from '../repositories/pg/ExamSessionReservationsRepository.js';
import { PgConceptsRepository } from '../repositories/pg/ConceptsRepository.js';
import { PgMasterySnapshotsRepository } from '../repositories/pg/MasterySnapshotsRepository.js';
import { questionFromAuthoritativeBody } from '../services/ExamService.js';
import { shuffleQuestionForExam, toStudentExamQuestion } from '../lib/examStudentView.js';
import { createTestPool, truncateAll, makeUser } from './helpers.js';
import type { ExamSession, Question } from '../types/index.js';

function makeSession(userId: string, overrides: Partial<Omit<ExamSession, 'id'>> = {}): Omit<ExamSession, 'id'> {
  return {
    user_id:          userId,
    mode:             'practice',
    questions:        [],
    answers:          {},
    score:            8,
    percentage:       80,
    medica_score:     75,
    readiness_label:  'Developing',
    subject_breakdown: {},
    system_breakdown:  {},
    missed_questions:  [],
    completed_at:     new Date(),
    duration_seconds: 300,
    difficulty:       'Balanced',
    integrity_status: 'legacy_unverified',
    ...overrides,
  };
}

describe('PgExamSessionsRepository + PgQuestionAttemptsRepository — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let sessionsRepo: PgExamSessionsRepository;
  let attemptsRepo: PgQuestionAttemptsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo    = new PgUsersRepository(pool);
    sessionsRepo = new PgExamSessionsRepository(pool);
    attemptsRepo = new PgQuestionAttemptsRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('creates a session and retrieves it by id', async () => {
    const user = await usersRepo.create(makeUser({ email: 'sess1@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));

    expect(session.id).toBeTruthy();
    expect(session.user_id).toBe(user.id);
    expect(session.score).toBe(8);
    expect(session.mode).toBe('practice');

    const found = await sessionsRepo.findById(session.id);
    expect(found?.id).toBe(session.id);
  });

  it('findByUserId returns paginated results', async () => {
    const user = await usersRepo.create(makeUser({ email: 'paged@test.com' }));
    await sessionsRepo.create(makeSession(user.id));
    await sessionsRepo.create(makeSession(user.id));
    await sessionsRepo.create(makeSession(user.id));

    const page1 = await sessionsRepo.findByUserId(user.id, { page: 1, limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await sessionsRepo.findByUserId(user.id, { page: 2, limit: 2 });
    expect(page2.data).toHaveLength(1);
  });

  it('findByUserId returns empty result for user with no sessions', async () => {
    const user = await usersRepo.create(makeUser({ email: 'empty@test.com' }));
    const result = await sessionsRepo.findByUserId(user.id);
    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('findById returns null for wrong owner (cross-user isolation)', async () => {
    const u1 = await usersRepo.create(makeUser({ email: 'owner@test.com' }));
    const u2 = await usersRepo.create(makeUser({ email: 'attacker@test.com' }));
    const session = await sessionsRepo.create(makeSession(u1.id));

    // A different user's sessions do not include u1's session
    const result = await sessionsRepo.findByUserId(u2.id);
    const ids = result.data.map(s => s.id);
    expect(ids).not.toContain(session.id);
  });

  it('createMany attempts persists all attempt rows atomically', async () => {
    const user = await usersRepo.create(makeUser({ email: 'attempts@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));

    const now = new Date();
    const result = await attemptsRepo.createMany([
      {
        user_id: user.id, session_id: session.id, question_id: 'q1',
        selected_answer: 'A', is_correct: true, time_spent_seconds: 45,
        attempted_at: now, question_ref_id: null,
      },
      {
        user_id: user.id, session_id: session.id, question_id: 'q2',
        selected_answer: 'B', is_correct: false, time_spent_seconds: 60,
        attempted_at: now, question_ref_id: null,
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].question_id).toBe('q1');
    expect(result[1].question_id).toBe('q2');

    const fetched = await attemptsRepo.findBySessionId(session.id);
    expect(fetched).toHaveLength(2);
  });

  it('findByUserId limit is respected', async () => {
    const user = await usersRepo.create(makeUser({ email: 'limit@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    const now = new Date();

    // Insert 3 attempts, fetch with limit 2
    await attemptsRepo.createMany([
      { user_id: user.id, session_id: session.id, question_id: 'q1', selected_answer: 'A', is_correct: true, time_spent_seconds: 10, attempted_at: now, question_ref_id: null },
      { user_id: user.id, session_id: session.id, question_id: 'q2', selected_answer: 'B', is_correct: false, time_spent_seconds: 15, attempted_at: now, question_ref_id: null },
      { user_id: user.id, session_id: session.id, question_id: 'q3', selected_answer: 'C', is_correct: true, time_spent_seconds: 20, attempted_at: now, question_ref_id: null },
    ]);

    const limited = await attemptsRepo.findByUserId(user.id, 2);
    expect(limited).toHaveLength(2);
  });

  it('delete removes the session', async () => {
    const user = await usersRepo.create(makeUser({ email: 'delete@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));

    const deleted = await sessionsRepo.delete(session.id);
    expect(deleted).toBe(true);

    const found = await sessionsRepo.findById(session.id);
    expect(found).toBeNull();
  });

  it('ON DELETE CASCADE: deleting a user removes their sessions and attempts', async () => {
    const user = await usersRepo.create(makeUser({ email: 'cascade@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    await attemptsRepo.createMany([
      { user_id: user.id, session_id: session.id, question_id: 'q1', selected_answer: 'A', is_correct: true, time_spent_seconds: 5, attempted_at: new Date(), question_ref_id: null },
    ]);

    // Soft-delete the user, then hard-delete via pool to trigger FK cascade
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);

    const sessionCheck = await sessionsRepo.findById(session.id);
    expect(sessionCheck).toBeNull();

    const attemptsCheck = await attemptsRepo.findBySessionId(session.id);
    expect(attemptsCheck).toHaveLength(0);
  });
});

// ── PgExamSessionReservationsRepository — JSONB round-trip + retry idempotency ─

describe('PgExamSessionReservationsRepository — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let reservationsRepo: PgExamSessionReservationsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo = new PgUsersRepository(pool);
    reservationsRepo = new PgExamSessionReservationsRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  // A freshly-generated question body, shaped exactly like what routes/ai.ts
  // holds right before reservation — full taxonomy metadata plus an answer key.
  const freshGeneratedQuestion = {
    id:                'ai-fp-round-trip',
    stem:              'A patient presents with a finding requiring extended taxonomy metadata to round-trip.',
    options: [
      { letter: 'A', text: 'Correct mechanism' },
      { letter: 'B', text: 'Distractor B' },
      { letter: 'C', text: 'Distractor C' },
      { letter: 'D', text: 'Distractor D' },
    ],
    correct:           'A',
    explanation:       'Correct mechanism explains the vignette.',
    subject:           'Pharmacology',
    system:            'Cardiovascular',
    topic:             'Round Trip Topic',
    rawTopic:          'round trip raw topic',
    canonicalTopic:    'Round Trip Canonical Topic',
    topicSlug:         'round-trip-topic',
    topicSource:       'ai',
    questionAngle:     'round-trip-angle',
    usmleContentArea:  'Cardiovascular System',
    usmleSubdomain:    'Heart Failure Pharmacology',
    physicianTask:     'Patient Care: Diagnosis',
    difficulty:        'Balanced',
    testedConcept:     'Round Trip Concept',
    weakSpotCategory:  'Round Trip Weak Spot',
  };

  it('preserves every taxonomy field through the JSONB round-trip, and toStudentExamQuestion reconstructs a full sanitized view from the stored row', async () => {
    const user = await usersRepo.create(makeUser({ email: 'reservation-roundtrip@test.com' }));
    const clientSessionId = randomUUID();

    const shuffled = shuffleQuestionForExam(freshGeneratedQuestion as Record<string, unknown>);
    const emptyFallback: Question = { id: '', text: '', options: [], correct_answer: '' };
    const authoritative = questionFromAuthoritativeBody(
      shuffled.id as string,
      shuffled,
      { ...emptyFallback, id: shuffled.id as string },
    );

    await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [authoritative], source: 'server_issued' });

    const found = await reservationsRepo.findByClientSessionId(user.id, clientSessionId);
    const stored = found!.questions[0]!;

    // Storage shape: plain string[] options (letter = array index), not {letter,text}[].
    expect(Array.isArray(stored.options)).toBe(true);
    expect(typeof stored.options[0]).toBe('string');
    expect(stored.correct_answer).toBeTruthy();

    // Every extended taxonomy field survives the write→JSONB→read round-trip,
    // even though several of them aren't declared on the Question interface.
    expect(stored.topic).toBe('Round Trip Topic');
    expect((stored as unknown as Record<string, unknown>).rawTopic).toBe('round trip raw topic');
    expect(stored.canonicalTopic).toBe('Round Trip Canonical Topic');
    expect(stored.topicSlug).toBe('round-trip-topic');
    expect(stored.topicSource).toBe('ai');
    expect(stored.questionAngle).toBe('round-trip-angle');
    expect((stored as unknown as Record<string, unknown>).usmleContentArea).toBe('Cardiovascular System');
    expect((stored as unknown as Record<string, unknown>).usmleSubdomain).toBe('Heart Failure Pharmacology');
    expect((stored as unknown as Record<string, unknown>).physicianTask).toBe('Patient Care: Diagnosis');
    expect(stored.testedConcept).toBe('Round Trip Concept');
    expect(stored.weakSpotCategory).toBe('Round Trip Weak Spot');

    // The retry response-construction path (routes/ai.ts's applyExamStudentView
    // on an idempotent hit) sanitizes directly from this stored shape — confirm
    // it reconstructs a full, correctly-lettered student view with no reveal fields.
    const studentView = toStudentExamQuestion(stored as unknown as Record<string, unknown>);
    expect(studentView.stem).toBe(freshGeneratedQuestion.stem);
    expect(studentView.options).toHaveLength(4);
    expect(studentView.options.map(o => o.letter)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(studentView.options.map(o => o.text))).toEqual(
      new Set(['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D']),
    );
    expect(studentView.usmleContentArea).toBe('Cardiovascular System');
    expect(studentView.usmleSubdomain).toBe('Heart Failure Pharmacology');
    expect(studentView.physicianTask).toBe('Patient Care: Diagnosis');
    expect(studentView.rawTopic).toBe('round trip raw topic');
    expect(studentView).not.toHaveProperty('correct');
    expect(studentView).not.toHaveProperty('explanation');
  });

  it('a retry create() with a different shuffle returns the ORIGINAL row via ON CONFLICT, not the new one', async () => {
    const user = await usersRepo.create(makeUser({ email: 'reservation-retry@test.com' }));
    const clientSessionId = randomUUID();

    const first: Question = { ...freshGeneratedQuestion, options: ['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D'], correct_answer: 'A' } as unknown as Question;
    await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [first], source: 'server_issued' });

    const differentShuffle: Question = { ...freshGeneratedQuestion, options: ['Distractor D', 'Correct mechanism', 'Distractor B', 'Distractor C'], correct_answer: 'B' } as unknown as Question;
    const retryResult = await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [differentShuffle], source: 'server_issued' });

    // create()'s OWN return value must already reflect the original row — this
    // is what applyExamStudentView's fix relies on to avoid a second read.
    expect(retryResult.questions[0]!.options).toEqual(['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D']);
    expect(retryResult.questions[0]!.correct_answer).toBe('A');

    const found = await reservationsRepo.findByClientSessionId(user.id, clientSessionId);
    expect(found!.questions[0]!.options).toEqual(['Correct mechanism', 'Distractor B', 'Distractor C', 'Distractor D']);
  });

  it('cross-user isolation: a reservation is only visible under its owning user id', async () => {
    const owner = await usersRepo.create(makeUser({ email: 'reservation-owner@test.com' }));
    const other = await usersRepo.create(makeUser({ email: 'reservation-other@test.com' }));
    const clientSessionId = randomUUID();

    await reservationsRepo.create({
      userId: owner.id,
      clientSessionId,
      questions: [{ ...freshGeneratedQuestion, options: ['A opt', 'B opt', 'C opt', 'D opt'], correct_answer: 'A' } as unknown as Question],
      source: 'server_issued',
    });

    const asOther = await reservationsRepo.findByClientSessionId(other.id, clientSessionId);
    expect(asOther).toBeNull();

    const asOwner = await reservationsRepo.findByClientSessionId(owner.id, clientSessionId);
    expect(asOwner).not.toBeNull();
  });
});

// ── Phase 1 — session integrity classification: DB-level constraints ──────────

describe('exam_sessions.integrity_status — constraint + backfill — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let sessionsRepo: PgExamSessionsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo = new PgUsersRepository(pool);
    sessionsRepo = new PgExamSessionsRepository(pool);
  });
  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('rejects an invalid integrity_status value at the database level', async () => {
    const user = await usersRepo.create(makeUser({ email: 'integrity-check@test.com' }));
    await expect(pool.query(
      `INSERT INTO exam_sessions
         (id, user_id, mode, questions, answers, score, percentage, medica_score, readiness_label,
          subject_breakdown, system_breakdown, missed_questions, completed_at, duration_seconds, difficulty, integrity_status)
       VALUES (gen_random_uuid(), $1, 'practice', '[]', '{}', 0, 0, 0, 'Developing', '{}', '{}', '[]', now(), 60, 'Balanced', 'bogus_status')`,
      [user.id],
    )).rejects.toThrow(/violates check constraint/);
  });

  it('a row inserted without integrity_status (simulating a pre-migration row) backfills to legacy_unverified via the column default', async () => {
    const user = await usersRepo.create(makeUser({ email: 'integrity-backfill@test.com' }));
    const res = await pool.query<{ id: string }>(
      `INSERT INTO exam_sessions
         (id, user_id, mode, questions, answers, score, percentage, medica_score, readiness_label,
          subject_breakdown, system_breakdown, missed_questions, completed_at, duration_seconds, difficulty)
       VALUES (gen_random_uuid(), $1, 'practice', '[]', '{}', 0, 0, 0, 'Developing', '{}', '{}', '[]', now(), 60, 'Balanced')
       RETURNING id`,
      [user.id],
    );

    const found = await sessionsRepo.findById(res.rows[0]!.id);
    expect(found!.integrity_status).toBe('legacy_unverified');
  });
});

describe('exam_session_reservations.source — constraint + non-escalation — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let reservationsRepo: PgExamSessionReservationsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo = new PgUsersRepository(pool);
    reservationsRepo = new PgExamSessionReservationsRepository(pool);
  });
  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('rejects an invalid source value at the database level', async () => {
    const user = await usersRepo.create(makeUser({ email: 'source-check@test.com' }));
    await expect(pool.query(
      `INSERT INTO exam_session_reservations (id, user_id, client_session_id, questions, source)
       VALUES (gen_random_uuid(), $1, gen_random_uuid(), '[]', 'bogus_source')`,
      [user.id],
    )).rejects.toThrow(/violates check constraint/);
  });

  it('a client_selected reservation cannot be silently upgraded to server_issued by a later retry with a different source', async () => {
    const user = await usersRepo.create(makeUser({ email: 'source-retry@test.com' }));
    const clientSessionId = randomUUID();
    const q: Question = { id: 'q1', text: 'stem', options: ['A', 'B'], correct_answer: 'A' };

    await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [q], source: 'client_selected' });
    // A second create() call for the SAME clientSessionId claims server_issued —
    // ON CONFLICT must preserve the ORIGINAL source, never let a later caller
    // upgrade trust for an already-existing reservation.
    const retry = await reservationsRepo.create({ userId: user.id, clientSessionId, questions: [q], source: 'server_issued' });

    expect(retry.source).toBe('client_selected');
    const found = await reservationsRepo.findByClientSessionId(user.id, clientSessionId);
    expect(found!.source).toBe('client_selected');
  });
});

describe('mastery_snapshots — uniqueness + idempotency — integration', () => {
  let pool: Pool;
  let usersRepo: PgUsersRepository;
  let sessionsRepo: PgExamSessionsRepository;
  let conceptsRepo: PgConceptsRepository;
  let snapshotsRepo: PgMasterySnapshotsRepository;

  beforeAll(() => {
    pool = createTestPool();
    usersRepo = new PgUsersRepository(pool);
    sessionsRepo = new PgExamSessionsRepository(pool);
    conceptsRepo = new PgConceptsRepository(pool);
    snapshotsRepo = new PgMasterySnapshotsRepository(pool);
  });
  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('insertBatch is idempotent: a retried snapshot for the same (user, concept, session) does not create a duplicate row', async () => {
    const user = await usersRepo.create(makeUser({ email: 'ms-idem@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    const concept = await conceptsRepo.upsertBySlug('idem-concept', {
      name: 'Idempotency Concept', subject: 'Pharmacology', system: 'Cardiovascular',
    });

    const snapshot = {
      userId: user.id, conceptId: concept.id, sessionId: session.id,
      masteryScore: 0.75, confidence: 0.6, attemptCount: 3,
    };
    await snapshotsRepo.insertBatch([snapshot]);
    // Simulates the route's fire-and-forget takeSnapshot() being triggered twice
    // for the same session (e.g. an outbox or client retry) — must not duplicate.
    await snapshotsRepo.insertBatch([snapshot]);

    const rows = await snapshotsRepo.findByUserId(user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.mastery_score).toBeCloseTo(0.75);
  });

  it('allows separate rows for the same user+concept across different sessions', async () => {
    const user = await usersRepo.create(makeUser({ email: 'ms-multi@test.com' }));
    const session1 = await sessionsRepo.create(makeSession(user.id));
    const session2 = await sessionsRepo.create(makeSession(user.id));
    const concept = await conceptsRepo.upsertBySlug('multi-concept', {
      name: 'Multi Session Concept', subject: 'Pathology', system: 'Renal',
    });

    await snapshotsRepo.insertBatch([{
      userId: user.id, conceptId: concept.id, sessionId: session1.id,
      masteryScore: 0.5, confidence: 0.4, attemptCount: 1,
    }]);
    await snapshotsRepo.insertBatch([{
      userId: user.id, conceptId: concept.id, sessionId: session2.id,
      masteryScore: 0.6, confidence: 0.5, attemptCount: 2,
    }]);

    const rows = await snapshotsRepo.findByUserId(user.id);
    expect(rows).toHaveLength(2);
  });

  it('the raw unique constraint rejects a duplicate insert bypassing ON CONFLICT (confirms a real DB-level guarantee, not just app-level dedup)', async () => {
    const user = await usersRepo.create(makeUser({ email: 'ms-constraint@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    const concept = await conceptsRepo.upsertBySlug('constraint-concept', {
      name: 'Constraint Concept', subject: 'Physiology', system: 'Pulmonary',
    });

    await pool.query(
      `INSERT INTO mastery_snapshots (user_id, concept_id, session_id, mastery_score, confidence, attempt_count)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, concept.id, session.id, 0.5, 0.5, 1],
    );
    await expect(pool.query(
      `INSERT INTO mastery_snapshots (user_id, concept_id, session_id, mastery_score, confidence, attempt_count)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, concept.id, session.id, 0.9, 0.9, 5],
    )).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  it('concurrent duplicate insertBatch calls for the same batch resolve to exactly one row (race safety)', async () => {
    const user = await usersRepo.create(makeUser({ email: 'ms-concurrent@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    const concept = await conceptsRepo.upsertBySlug('concurrent-concept', {
      name: 'Concurrent Concept', subject: 'Biochemistry', system: 'Renal',
    });
    const snapshot = {
      userId: user.id, conceptId: concept.id, sessionId: session.id,
      masteryScore: 0.42, confidence: 0.3, attemptCount: 1,
    };

    await Promise.all([
      snapshotsRepo.insertBatch([snapshot]),
      snapshotsRepo.insertBatch([snapshot]),
    ]);

    const rows = await snapshotsRepo.findByUserId(user.id);
    expect(rows).toHaveLength(1);
  });

  it('migration 1750100000001 up() dedups pre-existing duplicate rows before adding the unique constraint, instead of failing the deploy', async () => {
    const user = await usersRepo.create(makeUser({ email: 'ms-migration-dedup@test.com' }));
    const session = await sessionsRepo.create(makeSession(user.id));
    const concept = await conceptsRepo.upsertBySlug('migration-dedup-concept', {
      name: 'Migration Dedup Concept', subject: 'Microbiology', system: 'Immune',
    });

    // Simulate the real pre-migration production state this migration must handle:
    // roll the migration back (drops the unique constraint + the other Phase 1
    // columns/constraints) and insert duplicate tuples that ADD CONSTRAINT alone
    // would reject outright.
    const migration = await import('../../migrations/1750100000001_session-integrity-classification.js');
    const runSteps = async (fn: (pgm: { sql: (query: string) => void }) => void) => {
      const steps: string[] = [];
      fn({ sql: (query: string) => { steps.push(query); } });
      for (const step of steps) await pool.query(step);
    };

    await runSteps(migration.down);

    await pool.query(
      `INSERT INTO mastery_snapshots (user_id, concept_id, session_id, mastery_score, confidence, attempt_count, created_at)
       VALUES ($1,$2,$3,0.3,0.3,1, now() - interval '2 minutes'),
              ($1,$2,$3,0.6,0.6,2, now())`,
      [user.id, concept.id, session.id],
    );
    const beforeCount = await pool.query('SELECT COUNT(*) AS c FROM mastery_snapshots');
    expect(Number(beforeCount.rows[0].c)).toBe(2);

    await expect(runSteps(migration.up)).resolves.toBeUndefined();

    const rows = await snapshotsRepo.findByUserId(user.id);
    expect(rows).toHaveLength(1);
    // The earliest row per tuple is kept (created_at, id ordering) — not the latest.
    expect(rows[0]!.mastery_score).toBeCloseTo(0.3);

    // Constraint is live again: a fresh duplicate insert attempt is rejected.
    await expect(pool.query(
      `INSERT INTO mastery_snapshots (user_id, concept_id, session_id, mastery_score, confidence, attempt_count)
       VALUES ($1,$2,$3,0.9,0.9,9)`,
      [user.id, concept.id, session.id],
    )).rejects.toThrow(/duplicate key value violates unique constraint/);
  });
});
