import { describe, it, expect, beforeEach } from 'vitest';
import { ExamService, _fingerprint, _normalizeAnswerLetter, _getCorrectAnswer } from './ExamService.js';
import { InMemoryExamSessionsRepository } from '../repositories/memory/ExamSessionsRepository.js';
import { InMemoryQuestionAttemptsRepository } from '../repositories/memory/QuestionAttemptsRepository.js';
import { InMemoryQuestionsRepository } from '../repositories/memory/QuestionsRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';
import { InMemoryQuestionConceptsRepository } from '../repositories/memory/QuestionConceptsRepository.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
import { InMemoryExamSessionReservationsRepository } from '../repositories/memory/ExamSessionReservationsRepository.js';
import { InMemoryQuestionReportsRepository } from '../repositories/memory/QuestionReportsRepository.js';
import { ConceptMappingService } from './ConceptMappingService.js';
import { ConceptMasteryService } from './ConceptMasteryService.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const QUESTION_TEXT =
  'A 45-year-old man presents with crushing chest pain radiating to the left arm, ' +
  'diaphoresis, and nausea for 2 hours. He has a history of hypertension and smokes 1 ppd. ' +
  'EKG shows ST elevations in leads II, III, aVF. What is the most likely diagnosis?';

const sampleQuestion = {
  id: 'q-uuid-001',
  text: QUESTION_TEXT,
  options: ['Aortic dissection', 'Pulmonary embolism', 'Acute inferior MI', 'Pericarditis'],
  correct_answer: 'Acute inferior MI',
  subject: 'Cardiology',
  system: 'Cardiovascular',
  testedConcept: 'Acute Myocardial Infarction',
  weakSpotCategory: 'Cardiac Emergencies',
  topic: 'Chest Pain',
  canonicalTopic: 'Ischemic Heart Disease',
  topicSlug: 'ischemic-heart-disease',
  topicSource: 'selectedTopic',
  questionAngle: 'diagnosis',
  commonTrap: 'Aortic dissection also causes tearing chest pain but typically radiates to the back',
  memoryAnchor: 'ST elevation in II, III, aVF = inferior wall = RCA territory',
};

const sampleQuestion2 = {
  id: 'q-uuid-002',
  text: 'A 32-year-old woman presents with sudden onset dyspnea, pleuritic chest pain, and tachycardia ' +
        'after a long flight. Lower extremity doppler shows no DVT. D-dimer is elevated at 2.4 mg/L. ' +
        'What is the most appropriate next diagnostic step?',
  options: ['Chest X-ray', 'CT pulmonary angiography', 'V/Q scan', 'Echocardiogram'],
  correct_answer: 'CT pulmonary angiography',
  subject: 'Pulmonology',
  system: 'Pulmonary',
  testedConcept: 'Pulmonary Embolism Diagnosis',
  weakSpotCategory: 'Thromboembolic Disease',
  topic: 'Dyspnea',
  questionAngle: 'diagnosis',
};

function makeInput(questions = [sampleQuestion], answers: Record<string, string> = { 'q-uuid-001': 'Acute inferior MI' }) {
  return {
    mode: 'practice' as const,
    questions,
    answers,
    score: 1,
    percentage: 100,
    medica_score: 75,
    readiness_label: 'Ready',
    subject_breakdown: { Cardiology: { total: 1, correct: 1, percentage: 100 } },
    system_breakdown: { Cardiovascular: { total: 1, correct: 1, percentage: 100 } },
    missed_questions: [],
    completed_at: new Date().toISOString(),
    duration_seconds: 90,
    difficulty: 'balanced',
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExamService — Phase 1 question bank', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let attemptsRepo: InMemoryQuestionAttemptsRepository;
  let questionsRepo: InMemoryQuestionsRepository;
  let service: ExamService;

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    attemptsRepo = new InMemoryQuestionAttemptsRepository();
    questionsRepo = new InMemoryQuestionsRepository();
    service = new ExamService(sessionsRepo, attemptsRepo, questionsRepo);
  });

  it('upserts each question into the questions table', async () => {
    await service.createSession('user-1', makeInput());

    const fp = _fingerprint(QUESTION_TEXT, 'Acute inferior MI', '', 'Cardiovascular');
    const entry = await questionsRepo.findByExternalId(fp);
    expect(entry).not.toBeNull();
    expect(typeof entry!.id).toBe('string');
    expect(entry!.id.length).toBeGreaterThan(0);
  });

  it('persists concept-signal metadata in questions.body', async () => {
    await service.createSession('user-1', makeInput());

    const fp = _fingerprint(QUESTION_TEXT, 'Acute inferior MI', '', 'Cardiovascular');
    const entry = questionsRepo._getEntry(fp);
    expect(entry).toBeDefined();
    expect(entry!.body.testedConcept).toBe('Acute Myocardial Infarction');
    expect(entry!.body.weakSpotCategory).toBe('Cardiac Emergencies');
    expect(entry!.body.questionAngle).toBe('diagnosis');
    expect(entry!.body.commonTrap).toBeTruthy();
    expect(entry!.body.memoryAnchor).toBeTruthy();
    expect(entry!.subject).toBe('');
    expect(entry!.system).toBe('Cardiovascular');
    expect(entry!.body.subject).toBe('');
    expect(entry!.body.system).toBe('Cardiovascular');
  });

  it('preserves session-question order in exam_session_questions', async () => {
    const input = makeInput(
      [sampleQuestion, sampleQuestion2],
      { 'q-uuid-001': 'Acute inferior MI', 'q-uuid-002': 'CT pulmonary angiography' },
    );
    const session = await service.createSession('user-1', input);

    const links = sessionsRepo._getQuestionLinks(session.id);
    expect(links).toHaveLength(2);
    expect(links[0]!.position).toBe(0);
    expect(links[1]!.position).toBe(1);
    // Positions are strictly ordered
    const positions = links.map((l) => l.position);
    expect(positions).toEqual([0, 1]);
    // Each link points to a real DB UUID
    expect(links[0]!.questionId).toBeTruthy();
    expect(links[1]!.questionId).toBeTruthy();
    expect(links[0]!.questionId).not.toBe(links[1]!.questionId);
  });

  it('populates question_ref_id on attempts', async () => {
    const session = await service.createSession('user-1', makeInput());

    const fp = _fingerprint(QUESTION_TEXT, 'Acute inferior MI', '', 'Cardiovascular');
    const dbEntry = await questionsRepo.findByExternalId(fp);
    const attempts = await attemptsRepo.findBySessionId(session.id);

    expect(attempts).toHaveLength(1);
    expect(attempts[0]!.question_ref_id).toBe(dbEntry!.id);
  });

  it('backward compat — old exam_sessions.questions JSON blob is preserved', async () => {
    const session = await service.createSession('user-1', makeInput());

    const loaded = await sessionsRepo.findById(session.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.questions).toHaveLength(1);
    expect(loaded!.questions[0]!.id).toBe('q-uuid-001');
    expect(loaded!.questions[0]!.text).toBe(QUESTION_TEXT);
    expect(loaded!.questions[0]!.correct_answer).toBe('Acute inferior MI');
    expect(loaded!.questions[0]!.subject).toBe('');
    expect(loaded!.questions[0]!.system).toBe('Cardiovascular');
  });

  it('works without questions repo — no question_ref_id, no links', async () => {
    const serviceNoBank = new ExamService(sessionsRepo, attemptsRepo);
    const session = await serviceNoBank.createSession('user-1', makeInput());

    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.question_ref_id).toBeUndefined();
    const links = sessionsRepo._getQuestionLinks(session.id);
    expect(links).toHaveLength(0);
    // Session still created with full JSON blob
    const loaded = await sessionsRepo.findById(session.id);
    expect(loaded!.questions).toHaveLength(1);
  });

  it('deduplicates identical questions across sessions via fingerprint', async () => {
    await service.createSession('user-1', makeInput());
    await service.createSession('user-2', makeInput()); // same question text

    const fp = _fingerprint(QUESTION_TEXT, 'Acute inferior MI', '', 'Cardiovascular');
    // Both sessions upserted the same fingerprint — only one entry in the bank
    const entry1 = await questionsRepo.findByExternalId(fp);
    expect(entry1).not.toBeNull();
    // findByExternalId returns the same id for both
    const entry2 = questionsRepo._getEntry(fp);
    expect(entry2).toBeDefined();
  });

  it('normalizes system_breakdown aliases before saving a session', async () => {
    const renalQuestion = {
      ...sampleQuestion,
      id: 'q-renal-001',
      system: 'Renal',
    };
    const input = {
      ...makeInput([renalQuestion], { 'q-renal-001': 'Acute inferior MI' }),
      system_breakdown: { Renal: { total: 1, correct: 1, percentage: 100 } },
    };

    const session = await service.createSession('user-1', input);
    const loaded = await sessionsRepo.findById(session.id);

    expect(loaded!.system_breakdown['Renal / Urinary']).toEqual({ total: 1, correct: 1, percentage: 100 });
    expect(loaded!.system_breakdown['Renal']).toBeUndefined();
  });

  it('normalizes question system aliases before question bank upsert', async () => {
    const neuroQuestion = {
      ...sampleQuestion,
      id: 'q-neuro-001',
      subject: 'Physiology',
      system: 'Nervous System & Special Senses',
    };

    await service.createSession(
      'user-1',
      makeInput([neuroQuestion], { 'q-neuro-001': 'Acute inferior MI' }),
    );

    const fp = _fingerprint(QUESTION_TEXT, 'Acute inferior MI', 'Physiology', 'Neurology');
    const entry = questionsRepo._getEntry(fp);
    expect(entry).toBeDefined();
    expect(entry!.subject).toBe('Physiology');
    expect(entry!.system).toBe('Neurology');
    expect(entry!.body.subject).toBe('Physiology');
    expect(entry!.body.system).toBe('Neurology');
  });
});

// ── _normalizeAnswerLetter unit tests ─────────────────────────────────────────

describe('_normalizeAnswerLetter', () => {
  it('returns uppercase letter unchanged', () => {
    expect(_normalizeAnswerLetter('A')).toBe('A');
    expect(_normalizeAnswerLetter('D')).toBe('D');
  });

  it('uppercases a lowercase letter', () => {
    expect(_normalizeAnswerLetter('a')).toBe('A');
    expect(_normalizeAnswerLetter('b')).toBe('B');
    expect(_normalizeAnswerLetter('c')).toBe('C');
    expect(_normalizeAnswerLetter('d')).toBe('D');
  });

  it('strips "A. option text" prefix and returns letter', () => {
    expect(_normalizeAnswerLetter('A. Aortic dissection')).toBe('A');
    expect(_normalizeAnswerLetter('C. CT pulmonary angiography')).toBe('C');
  });

  it('trims surrounding whitespace', () => {
    expect(_normalizeAnswerLetter(' b ')).toBe('B');
    expect(_normalizeAnswerLetter('  D  ')).toBe('D');
  });

  it('returns empty string for invalid answers', () => {
    expect(_normalizeAnswerLetter('X')).toBe('');
    expect(_normalizeAnswerLetter('M')).toBe(''); // one past the A-L ceiling
    expect(_normalizeAnswerLetter('')).toBe('');
    expect(_normalizeAnswerLetter(null)).toBe('');
    expect(_normalizeAnswerLetter(undefined)).toBe('');
  });

  it('supports extended-matching letters E through L', () => {
    expect(_normalizeAnswerLetter('E')).toBe('E');
    expect(_normalizeAnswerLetter('e')).toBe('E');
    expect(_normalizeAnswerLetter('L')).toBe('L');
    expect(_normalizeAnswerLetter('l')).toBe('L');
    expect(_normalizeAnswerLetter('L. option text')).toBe('L');
  });

  it('converts numeric indexes 0–11 to letters A–L', () => {
    expect(_normalizeAnswerLetter(0)).toBe('A');
    expect(_normalizeAnswerLetter(1)).toBe('B');
    expect(_normalizeAnswerLetter(2)).toBe('C');
    expect(_normalizeAnswerLetter(3)).toBe('D');
    expect(_normalizeAnswerLetter(4)).toBe('E');
    expect(_normalizeAnswerLetter(11)).toBe('L');
  });

  it('returns empty string for out-of-range numeric index', () => {
    expect(_normalizeAnswerLetter(12)).toBe('');
    expect(_normalizeAnswerLetter(-1)).toBe('');
  });
});

// ── Normalized is_correct on attempts ────────────────────────────────────────

describe('ExamService — normalized answer comparison', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let attemptsRepo: InMemoryQuestionAttemptsRepository;
  let questionsRepo: InMemoryQuestionsRepository;
  let service: ExamService;

  const letterQuestion = {
    ...sampleQuestion,
    id: 'q-norm-001',
    correct_answer: 'C',
  };

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    attemptsRepo = new InMemoryQuestionAttemptsRepository();
    questionsRepo = new InMemoryQuestionsRepository();
    service = new ExamService(sessionsRepo, attemptsRepo, questionsRepo);
  });

  it('marks attempt correct when user sends lowercase matching uppercase correct_answer', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': 'c' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(true);
    expect(attempts[0]!.selected_answer).toBe('C');
  });

  it('marks attempt correct when user sends "C. option text" and correct_answer is "C"', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': 'C. Some option text' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(true);
    expect(attempts[0]!.selected_answer).toBe('C');
  });

  it('marks attempt correct when user answer has surrounding whitespace', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': ' C ' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(true);
  });

  it('marks attempt incorrect for a wrong but valid letter', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': 'A' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(false);
  });

  it('marks attempt incorrect for an invalid/empty answer', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': 'X' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(false);
  });

  it('stores selected_answer as the canonical answer letter', async () => {
    const raw = 'c. Some option text';
    const input = makeInput([letterQuestion], { 'q-norm-001': raw });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.selected_answer).toBe('C');
  });

  it('marks attempt correct for a matching extended-matching letter beyond D (5+ option question)', async () => {
    const extendedQuestion = {
      ...sampleQuestion,
      id: 'q-norm-e',
      options: ['Aortic dissection', 'Pulmonary embolism', 'Pericarditis', 'GERD', 'Acute inferior MI'],
      correct_answer: 'E',
    };
    const input = makeInput([extendedQuestion], { 'q-norm-e': 'E' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(true);
  });

  it('marks attempt correct for letter L (12-option ceiling)', async () => {
    const extendedQuestion = {
      ...sampleQuestion,
      id: 'q-norm-l',
      options: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L option'],
      correct_answer: 'L',
    };
    const input = makeInput([extendedQuestion], { 'q-norm-l': 'l' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(true);
  });

  it('marks attempt incorrect when the submitted letter is M (beyond the valid ceiling)', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': 'M' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(false);
  });
});

// ── _getCorrectAnswer alias fallback ─────────────────────────────────────────

describe('ExamService - backend-owned result calculation', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let attemptsRepo: InMemoryQuestionAttemptsRepository;
  let questionsRepo: InMemoryQuestionsRepository;
  let service: ExamService;

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    attemptsRepo = new InMemoryQuestionAttemptsRepository();
    questionsRepo = new InMemoryQuestionsRepository();
    service = new ExamService(sessionsRepo, attemptsRepo, questionsRepo);
  });

  it('overrides a fake perfect client score when the submitted answer is wrong', async () => {
    const input = {
      ...makeInput([sampleQuestion], { 'q-uuid-001': 'A' }),
      score: 1,
      percentage: 100,
      medica_score: 100,
      readiness_label: 'Strong',
      missed_questions: [],
    };

    const session = await service.createSession('user-1', input);
    const loaded = await sessionsRepo.findById(session.id);
    const attempts = await attemptsRepo.findBySessionId(session.id);

    expect(loaded!.score).toBe(0);
    expect(loaded!.percentage).toBe(0);
    expect(loaded!.medica_score).toBe(10);
    expect(loaded!.readiness_label).toBe('Needs Foundation');
    expect(loaded!.missed_questions).toHaveLength(1);
    expect(loaded!.answers).toEqual({ 'q-uuid-001': 'A' });
    expect(loaded!.system_breakdown['Cardiovascular']).toEqual({ total: 1, correct: 0, percentage: 0 });
    expect(attempts[0]!.selected_answer).toBe('A');
    expect(attempts[0]!.is_correct).toBe(false);
  });

  it('overrides a fake zero client score when the submitted answer is correct', async () => {
    const input = {
      ...makeInput([sampleQuestion], { 'q-uuid-001': 'Acute inferior MI' }),
      score: 0,
      percentage: 0,
      medica_score: 0,
      readiness_label: 'Needs Foundation',
      missed_questions: [sampleQuestion],
    };

    const session = await service.createSession('user-1', input);
    const loaded = await sessionsRepo.findById(session.id);
    const attempts = await attemptsRepo.findBySessionId(session.id);

    expect(loaded!.score).toBe(1);
    expect(loaded!.percentage).toBe(100);
    expect(loaded!.medica_score).toBe(100);
    expect(loaded!.readiness_label).toBe('Strong');
    expect(loaded!.missed_questions).toHaveLength(0);
    expect(loaded!.answers).toEqual({ 'q-uuid-001': 'C' });
    expect(attempts[0]!.selected_answer).toBe('C');
    expect(attempts[0]!.is_correct).toBe(true);
  });

  it('ignores foreign answer ids and never persists them into the session summary', async () => {
    const input = makeInput([sampleQuestion], {
      'q-uuid-001': 'C',
      'question-from-another-session': 'A',
    });

    const session = await service.createSession('user-1', input);
    const loaded = await sessionsRepo.findById(session.id);

    expect(loaded!.answers).toEqual({ 'q-uuid-001': 'C' });
    expect(loaded!.score).toBe(1);
    expect(loaded!.percentage).toBe(100);
  });

  it('treats an out-of-option-range answer as unanswered, not as a correct answer', async () => {
    const input = makeInput([sampleQuestion], { 'q-uuid-001': 'E' });

    const session = await service.createSession('user-1', input);
    const loaded = await sessionsRepo.findById(session.id);
    const attempts = await attemptsRepo.findBySessionId(session.id);

    expect(loaded!.answers).toEqual({ 'q-uuid-001': '' });
    expect(loaded!.score).toBe(0);
    expect(loaded!.percentage).toBe(0);
    expect(loaded!.medica_score).toBe(0);
    expect(attempts[0]!.selected_answer).toBe('');
    expect(attempts[0]!.is_correct).toBe(false);
  });

  it('idempotent retries keep the first canonical result and ignore changed resubmissions', async () => {
    const clientId = '44444444-4444-4444-8444-444444444444';
    const first = await service.createSession('user-1', {
      ...makeInput([sampleQuestion], { 'q-uuid-001': 'A' }),
      clientSessionId: clientId,
    });
    const second = await service.createSession('user-1', {
      ...makeInput([sampleQuestion], { 'q-uuid-001': 'C' }),
      clientSessionId: clientId,
    });

    expect(second.id).toBe(first.id);
    expect(second.score).toBe(0);
    expect(second.answers).toEqual({ 'q-uuid-001': 'A' });
    const attempts = await attemptsRepo.findBySessionId(first.id);
    expect(attempts).toHaveLength(1);
  });

  it('uses DB-owned QBank question bodies instead of trusting a tampered submitted body', async () => {
    await questionsRepo.upsertByExternalId('bank-q1', {
      subject: 'Pathology',
      system: 'Cardiovascular',
      source: 'authored',
      bankStatus: 'approved',
      body: {
        id: 'bank-q1',
        subject: 'Pathology',
        system: 'Cardiovascular',
        difficulty: 'Balanced',
        stem: 'Authoritative bank stem',
        options: [
          { letter: 'A', text: 'Distractor' },
          { letter: 'B', text: 'Correct DB answer' },
        ],
        correct: 'B',
        reviewMetadata: {
          reviewStatus: 'source_checked',
          sourceRefs: ['USMLE Content Outline'],
          medicalAccuracyStatus: 'pass',
        },
      },
    });

    // Client displays these two options in the OPPOSITE order from the DB row
    // (as a shuffled UI naturally would). Submitted letter 'A' is positional
    // relative to THIS array, where index 0 is 'Correct DB answer' — the actual
    // right answer, just not under the DB's own letter for it. The tampered
    // stem/correct_answer claim is still fully ignored either way: correctness
    // is decided from the DB body's own key, never from the client's fields.
    const tamperedQuestion = {
      ...sampleQuestion,
      id: 'bank-q1',
      text: 'Client tampered stem',
      options: ['Correct DB answer', 'Distractor'],
      correct_answer: 'A',
      subject: 'Pathology',
      system: 'Cardiovascular',
    };

    const session = await service.createSession('user-1', {
      ...makeInput([tamperedQuestion], { 'bank-q1': 'A' }),
      score: 1,
      percentage: 100,
      medica_score: 100,
      readiness_label: 'Strong',
    });
    const loaded = await sessionsRepo.findById(session.id);
    const attempts = await attemptsRepo.findBySessionId(session.id);

    expect(loaded!.questions[0]!.text).toBe('Authoritative bank stem');
    expect(loaded!.questions[0]!.correct_answer).toBe('B');
    // The user actually selected the right option ('Correct DB answer'), just
    // labeled 'A' under their own (shuffled) view instead of the DB's 'B'.
    // Scoring resolves it by TEXT against the authoritative array, so it is
    // correctly marked correct — see resolveAnswersAgainstClientOptions.
    expect(loaded!.score).toBe(1);
    expect(loaded!.percentage).toBe(100);
    expect(attempts[0]!.selected_answer).toBe('B');
    expect(attempts[0]!.is_correct).toBe(true);
  });

  it('still rejects a tampered correct_answer claim when the client-selected option is actually wrong', async () => {
    await questionsRepo.upsertByExternalId('bank-q2', {
      subject: 'Pathology',
      system: 'Cardiovascular',
      source: 'authored',
      bankStatus: 'approved',
      body: {
        id: 'bank-q2',
        subject: 'Pathology',
        system: 'Cardiovascular',
        difficulty: 'Balanced',
        stem: 'Authoritative bank stem 2',
        options: [
          { letter: 'A', text: 'Distractor' },
          { letter: 'B', text: 'Correct DB answer' },
        ],
        correct: 'B',
      },
    });

    // Same shuffled client order as above (client A = 'Correct DB answer', client
    // B = 'Distractor'), but this time the user actually clicked their letter
    // 'B' — the Distractor — and the client also falsely claims 'B' is correct.
    const tamperedQuestion = {
      ...sampleQuestion,
      id: 'bank-q2',
      text: 'Client tampered stem',
      options: ['Correct DB answer', 'Distractor'],
      correct_answer: 'B',
      subject: 'Pathology',
      system: 'Cardiovascular',
    };

    const session = await service.createSession('user-1', {
      ...makeInput([tamperedQuestion], { 'bank-q2': 'B' }),
      score: 1,
      percentage: 100,
      medica_score: 100,
      readiness_label: 'Strong',
    });
    const loaded = await sessionsRepo.findById(session.id);
    const attempts = await attemptsRepo.findBySessionId(session.id);

    // Client's letter 'B' (Distractor) resolves against the DB's own letter 'A'.
    // The tampered correct_answer: 'B' claim is ignored — DB says 'B' is
    // 'Correct DB answer', so the actual Distractor selection still scores wrong.
    expect(loaded!.score).toBe(0);
    expect(loaded!.percentage).toBe(0);
    expect(attempts[0]!.selected_answer).toBe('A');
    expect(attempts[0]!.is_correct).toBe(false);
  });
});

describe('_getCorrectAnswer', () => {
  it('returns correct_answer when present', () => {
    expect(_getCorrectAnswer({ correct_answer: 'B' })).toBe('B');
  });

  it('falls back to correct when correct_answer is absent', () => {
    expect(_getCorrectAnswer({ correct: 'C' })).toBe('C');
  });

  it('falls back to correctAnswer as last resort', () => {
    expect(_getCorrectAnswer({ correctAnswer: 'D' })).toBe('D');
  });

  it('correct_answer takes priority over correct and correctAnswer', () => {
    expect(_getCorrectAnswer({ correct_answer: 'A', correct: 'B', correctAnswer: 'C' })).toBe('A');
  });

  it('correct takes priority over correctAnswer', () => {
    expect(_getCorrectAnswer({ correct: 'B', correctAnswer: 'C' })).toBe('B');
  });

  it('returns empty string when all aliases are absent', () => {
    expect(_getCorrectAnswer({})).toBe('');
  });

  it('returns empty string when all aliases are null', () => {
    expect(_getCorrectAnswer({ correct_answer: null, correct: null, correctAnswer: null })).toBe('');
  });

  it('_normalizeAnswerLetter of _getCorrectAnswer is non-empty when an alias is set', () => {
    // Regression: without the helper, _normalizeAnswerLetter(undefined) = ''
    // which falsely matches an unanswered question.
    expect(_normalizeAnswerLetter(_getCorrectAnswer({ correct: 'A' }))).toBe('A');
    expect(_normalizeAnswerLetter(_getCorrectAnswer({}))).toBe('');
  });

  it('createSession uses correct alias when question only has "correct" field', async () => {
    const sessionsR  = new InMemoryExamSessionsRepository();
    const attemptsR  = new InMemoryQuestionAttemptsRepository();
    const questionsR = new InMemoryQuestionsRepository();
    const svc = new ExamService(sessionsR, attemptsR, questionsR);

    // Simulate a payload where correct_answer is missing but correct is present
    const aliasQuestion = {
      ...sampleQuestion,
      id: 'q-alias-001',
      correct_answer: undefined as any,
      correct: 'C',
    };
    const input = {
      ...makeInput([aliasQuestion as any], { 'q-alias-001': 'C' }),
    };
    const session = await svc.createSession('user-1', input as any);
    const attempts = await attemptsR.findBySessionId(session.id);
    // Answer 'C' matches correct 'C' — should be marked correct
    expect(attempts[0]!.is_correct).toBe(true);
  });
});

// ── v8.2 canonical concept bridge — end-to-end through createSession ──────────

describe('ExamService — v8.2 canonical concept bridge', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let attemptsRepo: InMemoryQuestionAttemptsRepository;
  let questionsRepo: InMemoryQuestionsRepository;
  let conceptsRepo: InMemoryConceptsRepository;
  let questionConceptsRepo: InMemoryQuestionConceptsRepository;
  let masteryRepo: InMemoryUserConceptMasteryRepository;
  let service: ExamService;

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    attemptsRepo = new InMemoryQuestionAttemptsRepository();
    questionsRepo = new InMemoryQuestionsRepository();
    conceptsRepo = new InMemoryConceptsRepository();
    questionConceptsRepo = new InMemoryQuestionConceptsRepository();
    masteryRepo = new InMemoryUserConceptMasteryRepository();

    const conceptMapping = new ConceptMappingService(conceptsRepo, questionConceptsRepo);
    const conceptMastery = new ConceptMasteryService(masteryRepo, questionConceptsRepo, conceptsRepo);
    service = new ExamService(sessionsRepo, attemptsRepo, questionsRepo, conceptMapping, conceptMastery);
  });

  it('creates a mastery record for a canonical concept that flows through createSession', async () => {
    const questionWithCanonical = {
      ...sampleQuestion,
      id: 'q-canonical-001',
      canonicalConcepts: ['Acute Myocardial Infarction'],
    };

    await service.createSession(
      'user-bridge-1',
      makeInput([questionWithCanonical as any], { 'q-canonical-001': 'Acute inferior MI' }),
    );

    const mastery = await masteryRepo.findByUserId('user-bridge-1');
    expect(mastery.length).toBeGreaterThan(0);

    // Verify concept row was upserted with source='canonical'
    const all = conceptsRepo._getAll();
    const canonical = all.find((c) => c.name === 'Acute Myocardial Infarction');
    expect(canonical).toBeDefined();
    expect(canonical!.source).toBe('canonical');

    // Mastery record references the canonical concept UUID
    const record = mastery.find((m) => m.concept_id === canonical!.id);
    expect(record).toBeDefined();
    expect(record!.attempts).toBe(1);
    expect(record!.correct).toBe(1);
  });

  it('canonicalConcepts field survives normalizeQuestionTaxonomy spread and reaches mastery', async () => {
    // Regression guard: if normalizeQuestionTaxonomy dropped canonicalConcepts, no mastery record would appear
    const questionWithCanonical = {
      ...sampleQuestion,
      id: 'q-canonical-002',
      system: 'Cardiovascular',
      canonicalConcepts: ['Coronary Artery Disease'],
    };

    await service.createSession(
      'user-bridge-2',
      makeInput([questionWithCanonical as any], { 'q-canonical-002': 'Acute inferior MI' }),
    );

    const mastery = await masteryRepo.findByUserId('user-bridge-2');
    const all = conceptsRepo._getAll();
    const canonical = all.find((c) => c.name === 'Coronary Artery Disease');
    expect(canonical).toBeDefined();
    expect(mastery.some((m) => m.concept_id === canonical!.id)).toBe(true);
  });

  it('does not create any canonical concept rows when canonicalConcepts is absent', async () => {
    // sampleQuestion has no canonicalConcepts — legacy concepts may be created but none with source='canonical'
    await service.createSession(
      'user-bridge-3',
      makeInput([sampleQuestion], { 'q-uuid-001': 'Acute inferior MI' }),
    );

    const all = conceptsRepo._getAll();
    expect(all.every((c) => c.source !== 'canonical')).toBe(true);
  });
});

// ── Idempotency (Phase 10.0E) ─────────────────────────────────────────────────

describe('ExamService — clientSessionId idempotency', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let service: ExamService;

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    service = new ExamService(sessionsRepo, new InMemoryQuestionAttemptsRepository());
  });

  it('creates session with the provided clientSessionId as its id', async () => {
    const clientId = '11111111-1111-4111-a111-111111111111';
    const session = await service.createSession('user-1', {
      ...makeInput(),
      clientSessionId: clientId,
    });
    expect(session.id).toBe(clientId);
  });

  it('duplicate clientSessionId returns the existing session without creating a new one', async () => {
    const clientId = '22222222-2222-4222-a222-222222222222';
    const first  = await service.createSession('user-1', { ...makeInput(), clientSessionId: clientId });
    const second = await service.createSession('user-1', { ...makeInput(), clientSessionId: clientId });
    expect(second.id).toBe(first.id);
    // Only one session should exist in the store
    const { data } = await sessionsRepo.findByUserId('user-1', { page: 1, limit: 10 });
    expect(data).toHaveLength(1);
  });

  it('does NOT deduplicate when clientSessionId is already owned by a different user', async () => {
    const clientId = '33333333-3333-4333-a333-333333333333';
    const first  = await service.createSession('user-1', { ...makeInput(), clientSessionId: clientId });
    const second = await service.createSession('user-2', { ...makeInput(), clientSessionId: clientId });
    // user-2 gets a fresh server-generated UUID (client ID was owned by user-1)
    expect(second.user_id).toBe('user-2');
    expect(second.id).not.toBe(first.id);  // server assigned a different id
    const { data: u1Sessions } = await sessionsRepo.findByUserId('user-1', { page: 1, limit: 10 });
    const { data: u2Sessions } = await sessionsRepo.findByUserId('user-2', { page: 1, limit: 10 });
    expect(u1Sessions).toHaveLength(1);
    expect(u2Sessions).toHaveLength(1);
    expect(u1Sessions[0]!.id).toBe(clientId);  // user-1's session retains the client ID
  });

  it('creates a normal session (server-generated id) when clientSessionId is omitted', async () => {
    const session = await service.createSession('user-1', makeInput());
    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

// ── Phase 2: backend-owned exam integrity (reservations) ──────────────────────

describe('ExamService — Phase 2 backend-owned exam integrity', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let attemptsRepo: InMemoryQuestionAttemptsRepository;
  let questionsRepo: InMemoryQuestionsRepository;
  let reservationsRepo: InMemoryExamSessionReservationsRepository;
  let questionReportsRepo: InMemoryQuestionReportsRepository;
  let service: ExamService;

  const aiQuestionId = 'ai-fp-cardiac-mi';
  const aiSecondQuestionId = 'ai-fp-pulm-pe';

  async function seedAiQuestion(externalId: string, overrides: Record<string, unknown> = {}) {
    await questionsRepo.upsertByExternalId(externalId, {
      subject: 'Cardiology',
      system: 'Cardiovascular',
      source: 'ai',
      bankStatus: 'validated_generated',
      body: {
        id: externalId,
        subject: 'Cardiology',
        system: 'Cardiovascular',
        difficulty: 'Balanced',
        stem: 'Authoritative AI-generated stem',
        options: [
          { letter: 'A', text: 'Distractor' },
          { letter: 'B', text: 'Correct AI answer' },
        ],
        correct: 'B',
        ...overrides,
      },
    });
  }

  function tamperedSubmission(id: string) {
    return {
      ...sampleQuestion,
      id,
      text: 'Client tampered AI stem',
      options: ['Correct AI answer', 'Distractor'],
      correct_answer: 'A',
      subject: 'Cardiology',
      system: 'Cardiovascular',
    };
  }

  beforeEach(async () => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    attemptsRepo = new InMemoryQuestionAttemptsRepository();
    questionsRepo = new InMemoryQuestionsRepository();
    reservationsRepo = new InMemoryExamSessionReservationsRepository();
    questionReportsRepo = new InMemoryQuestionReportsRepository();
    service = new ExamService(
      sessionsRepo, attemptsRepo, questionsRepo, undefined, undefined,
      reservationsRepo, questionReportsRepo,
    );
    await seedAiQuestion(aiQuestionId);
  });

  it('overrides a tampered AI-origin correct_answer even with no reservation present (Part 2 alone)', async () => {
    const session = await service.createSession('user-1', {
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'A' }),
      score: 1,
      percentage: 100,
      medica_score: 100,
      readiness_label: 'Strong',
    });
    const loaded = await sessionsRepo.findById(session.id);

    expect(loaded!.questions[0]!.text).toBe('Authoritative AI-generated stem');
    expect(loaded!.questions[0]!.correct_answer).toBe('B');
    // Client letter 'A' is index 0 of tamperedSubmission's own options
    // ('Correct AI answer'/'Distractor') — the actual right answer, just under
    // a different letter than the DB's. Resolved by text, so it scores correct.
    expect(loaded!.score).toBe(1);
    expect(loaded!.percentage).toBe(100);
  });

  it('Part 2 alone still rejects a tampered correct_answer claim when the client-selected option is actually wrong', async () => {
    const session = await service.createSession('user-1', {
      // Client letter 'B' is index 1 of tamperedSubmission's options ('Distractor'),
      // and the submission dishonestly claims correct_answer: 'A' regardless.
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'B' }),
    });
    const loaded = await sessionsRepo.findById(session.id);

    expect(loaded!.questions[0]!.correct_answer).toBe('B');
    expect(loaded!.score).toBe(0);
    expect(loaded!.percentage).toBe(0);
  });

  it('reserveSession persists a snapshot when every id resolves', async () => {
    const clientSessionId = '55555555-5555-4555-a555-555555555555';
    const result = await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    expect(result).toEqual({ reserved: true, clientSessionId });
    const stored = await reservationsRepo.findByClientSessionId('user-1', clientSessionId);
    expect(stored).not.toBeNull();
    expect(stored!.questions).toHaveLength(1);
    expect(stored!.questions[0]!.id).toBe(aiQuestionId);
    expect(stored!.questions[0]!.correct_answer).toBe('B');
  });

  it('reserveSession returns reserved:false (no-reservation fallback) when not every id resolves', async () => {
    const clientSessionId = '66666666-6666-4666-a666-666666666666';
    const result = await service.reserveSession('user-1', {
      clientSessionId,
      questionIds: [aiQuestionId, 'purely-local-id-never-synced'],
    });

    expect(result).toEqual({ reserved: false, clientSessionId });
    expect(await reservationsRepo.findByClientSessionId('user-1', clientSessionId)).toBeNull();
  });

  it('reserveSession is idempotent — retrying returns reserved:true without altering the snapshot', async () => {
    const clientSessionId = '77777777-7777-4777-a777-777777777777';
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });
    const retry = await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    expect(retry).toEqual({ reserved: true, clientSessionId });
    const stored = await reservationsRepo.findByClientSessionId('user-1', clientSessionId);
    expect(stored!.questions).toHaveLength(1);
  });

  it('scores from the reserved snapshot and ignores a tampered submitted correct_answer/options', async () => {
    const clientSessionId = '88888888-8888-4888-a888-888888888888';
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    const session = await service.createSession('user-1', {
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'A' }),
      clientSessionId,
      score: 1,
      percentage: 100,
      medica_score: 100,
      readiness_label: 'Strong',
    });

    expect(session.questions[0]!.text).toBe('Authoritative AI-generated stem');
    expect(session.questions[0]!.correct_answer).toBe('B');
    // Client letter 'A' is the actual right answer under the client's own
    // (shuffled) option order — resolved by text against the reserved snapshot.
    expect(session.score).toBe(1);
    expect(session.percentage).toBe(100);
  });

  it('with a reservation present, still rejects a tampered correct_answer claim when the client-selected option is actually wrong', async () => {
    const clientSessionId = 'ffffffff-ffff-4fff-afff-ffffffffffff';
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    const session = await service.createSession('user-1', {
      // Client letter 'B' is the Distractor under the client's own option order.
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'B' }),
      clientSessionId,
    });

    expect(session.questions[0]!.correct_answer).toBe('B');
    expect(session.score).toBe(0);
    expect(session.percentage).toBe(0);
  });

  it('rejects completion with SNAPSHOT_MISMATCH when a reserved question is missing from the submission', async () => {
    const clientSessionId = '99999999-9999-4999-a999-999999999999';
    await seedAiQuestion(aiSecondQuestionId);
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId, aiSecondQuestionId] });

    await expect(service.createSession('user-1', {
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'A' }),
      clientSessionId,
    })).rejects.toThrow('SNAPSHOT_MISMATCH');
  });

  it('rejects completion with SNAPSHOT_MISMATCH when an extra question is submitted beyond the reservation', async () => {
    const clientSessionId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    const extraQuestion = { ...sampleQuestion2, id: 'not-reserved-id' };
    await expect(service.createSession('user-1', {
      ...makeInput(
        [tamperedSubmission(aiQuestionId), extraQuestion],
        { [aiQuestionId]: 'A', 'not-reserved-id': 'CT pulmonary angiography' },
      ),
      clientSessionId,
    })).rejects.toThrow('SNAPSHOT_MISMATCH');
  });

  it('accepts a reordered-but-complete submission against the reservation', async () => {
    const clientSessionId = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
    await seedAiQuestion(aiSecondQuestionId, { stem: 'Second authoritative stem' });
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId, aiSecondQuestionId] });

    // Submitted in reverse order relative to the reservation — set comparison, not array order.
    // Client letter 'A' is the actual right answer under tamperedSubmission's own
    // option order for both questions.
    const session = await service.createSession('user-1', {
      ...makeInput(
        [tamperedSubmission(aiSecondQuestionId), tamperedSubmission(aiQuestionId)],
        { [aiQuestionId]: 'A', [aiSecondQuestionId]: 'A' },
      ),
      clientSessionId,
    });

    expect(session.questions).toHaveLength(2);
    expect(session.score).toBe(2);
  });

  it('duplicate completion with a reservation present returns the same already-scored session (idempotent)', async () => {
    const clientSessionId = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    const first = await service.createSession('user-1', {
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'B' }),
      clientSessionId,
    });
    const second = await service.createSession('user-1', {
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'A' }), // different answer on retry
      clientSessionId,
    });

    expect(second.id).toBe(first.id);
    expect(second.score).toBe(first.score);
    expect(second.answers).toEqual(first.answers);
  });

  it('falls back to existing behavior when clientSessionId has no reservation on file (local/offline-equivalent)', async () => {
    const clientSessionId = 'dddddddd-dddd-4ddd-addd-dddddddddddd';
    // No reserveSession call — this session never touched the reservation flow.
    const session = await service.createSession('user-1', {
      ...makeInput([sampleQuestion], { 'q-uuid-001': 'Acute inferior MI' }),
      clientSessionId,
    });

    expect(session.id).toBe(clientSessionId);
    expect(session.score).toBe(1);
  });

  it('scores from the snapshot even if the question is quarantined after the reservation was made', async () => {
    const clientSessionId = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee';
    await service.reserveSession('user-1', { clientSessionId, questionIds: [aiQuestionId] });

    // Quarantine happens after the reservation — the stored snapshot must not be affected.
    await questionsRepo.upsertByExternalId(aiQuestionId, {
      subject: 'Cardiology',
      system: 'Cardiovascular',
      source: 'ai',
      bankStatus: 'quarantined',
      body: { id: aiQuestionId, subject: 'Cardiology', system: 'Cardiovascular', stem: 'Authoritative AI-generated stem' },
    });

    // Client letter 'A' is the actual right answer under tamperedSubmission's own option order.
    const session = await service.createSession('user-1', {
      ...makeInput([tamperedSubmission(aiQuestionId)], { [aiQuestionId]: 'A' }),
      clientSessionId,
    });

    expect(session.questions[0]!.text).toBe('Authoritative AI-generated stem');
    expect(session.score).toBe(1);
  });

  it('uses DB-owned QBank question bodies unchanged (findByExternalIds path untouched by Phase 2)', async () => {
    await questionsRepo.upsertByExternalId('bank-q-phase2', {
      subject: 'Pathology',
      system: 'Cardiovascular',
      source: 'authored',
      bankStatus: 'approved',
      body: {
        id: 'bank-q-phase2',
        subject: 'Pathology',
        system: 'Cardiovascular',
        stem: 'Authoritative bank stem',
        options: [
          { letter: 'A', text: 'Distractor' },
          { letter: 'B', text: 'Correct DB answer' },
        ],
        correct: 'B',
        reviewMetadata: {
          reviewStatus: 'source_checked',
          sourceRefs: ['USMLE Content Outline'],
          medicalAccuracyStatus: 'pass',
        },
      },
    });

    const tampered = {
      ...sampleQuestion,
      id: 'bank-q-phase2',
      text: 'Client tampered stem',
      options: ['Correct DB answer', 'Distractor'],
      correct_answer: 'A',
      subject: 'Pathology',
      system: 'Cardiovascular',
    };

    const session = await service.createSession('user-1', makeInput([tampered], { 'bank-q-phase2': 'A' }));
    const loaded = await sessionsRepo.findById(session.id);

    expect(loaded!.questions[0]!.text).toBe('Authoritative bank stem');
    expect(loaded!.questions[0]!.correct_answer).toBe('B');
    // Client letter 'A' is index 0 of the tampered options ('Correct DB answer') —
    // the actual right answer under the client's own (shuffled) order.
    expect(loaded!.score).toBe(1);
  });
});

// ── reserveGeneratedExamSnapshot (exam-mode generation-time reservation) ───────

describe('ExamService — reserveGeneratedExamSnapshot', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let attemptsRepo: InMemoryQuestionAttemptsRepository;
  let questionsRepo: InMemoryQuestionsRepository;
  let reservationsRepo: InMemoryExamSessionReservationsRepository;
  let service: ExamService;

  const shuffledQuestion = {
    id: 'ai-fp-generation-time',
    text: 'Authoritative AI stem, shuffled for this session',
    options: ['Correct AI answer', 'Distractor'],
    correct_answer: 'A',
    subject: 'Cardiology',
    system: 'Cardiovascular',
  };

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    attemptsRepo = new InMemoryQuestionAttemptsRepository();
    questionsRepo = new InMemoryQuestionsRepository();
    reservationsRepo = new InMemoryExamSessionReservationsRepository();
    service = new ExamService(sessionsRepo, attemptsRepo, questionsRepo, undefined, undefined, reservationsRepo);
  });

  it('persists the exact bodies passed in, including their shuffled option order', async () => {
    const clientSessionId = 'f1111111-1111-4111-8111-111111111111';
    const result = await service.reserveGeneratedExamSnapshot('user-1', clientSessionId, [shuffledQuestion]);

    expect(result.reserved).toBe(true);
    expect(result.clientSessionId).toBe(clientSessionId);
    expect(result.questions[0]!.options).toEqual(['Correct AI answer', 'Distractor']);
    expect(result.questions[0]!.correct_answer).toBe('A');
    const stored = await reservationsRepo.findByClientSessionId('user-1', clientSessionId);
    expect(stored!.questions[0]!.options).toEqual(['Correct AI answer', 'Distractor']);
    expect(stored!.questions[0]!.correct_answer).toBe('A');
  });

  it('is idempotent — a retry with the same clientSessionId returns the original snapshot unchanged', async () => {
    const clientSessionId = 'f2222222-2222-4222-8222-222222222222';
    await service.reserveGeneratedExamSnapshot('user-1', clientSessionId, [shuffledQuestion]);

    const differentShuffle = { ...shuffledQuestion, options: ['Distractor', 'Correct AI answer'], correct_answer: 'B' };
    const retry = await service.reserveGeneratedExamSnapshot('user-1', clientSessionId, [differentShuffle]);

    // The retry's OWN return value must reflect the original snapshot, not the
    // fresh (different) shuffle just passed in — callers build their response
    // directly from this return value, so it must never diverge from storage.
    expect(retry.reserved).toBe(true);
    expect(retry.clientSessionId).toBe(clientSessionId);
    expect(retry.questions[0]!.options).toEqual(['Correct AI answer', 'Distractor']);
    expect(retry.questions[0]!.correct_answer).toBe('A');
    const stored = await reservationsRepo.findByClientSessionId('user-1', clientSessionId);
    expect(stored!.questions[0]!.options).toEqual(['Correct AI answer', 'Distractor']);
  });

  it('is not clobbered by a subsequent ID-based reserveSession call for the same clientSessionId', async () => {
    // Bank-canonical (unshuffled) order — what an ID-based lookup would resolve to.
    await questionsRepo.upsertByExternalId('ai-fp-generation-time', {
      subject: 'Cardiology',
      system: 'Cardiovascular',
      source: 'ai',
      bankStatus: 'validated_generated',
      body: {
        id: 'ai-fp-generation-time',
        stem: 'Authoritative AI stem, shuffled for this session',
        options: [
          { letter: 'A', text: 'Distractor' },
          { letter: 'B', text: 'Correct AI answer' },
        ],
        correct: 'B',
      },
    });

    const clientSessionId = 'f3333333-3333-4333-8333-333333333333';
    await service.reserveGeneratedExamSnapshot('user-1', clientSessionId, [shuffledQuestion]);

    // Mirrors the frontend's existing pre-quiz reserveServerSnapshot() call, which
    // fires an ID-based reserveSession() after generation-time reservation already ran.
    const idBasedResult = await service.reserveSession('user-1', {
      clientSessionId,
      questionIds: ['ai-fp-generation-time'],
    });

    expect(idBasedResult).toEqual({ reserved: true, clientSessionId });
    const stored = await reservationsRepo.findByClientSessionId('user-1', clientSessionId);
    // Still the generation-time shuffled order — NOT the bank's canonical order.
    expect(stored!.questions[0]!.options).toEqual(['Correct AI answer', 'Distractor']);
    expect(stored!.questions[0]!.correct_answer).toBe('A');
  });

  it('scores correctly from the generation-time shuffled snapshot at completion', async () => {
    const clientSessionId = 'f4444444-4444-4444-8444-444444444444';
    await service.reserveGeneratedExamSnapshot('user-1', clientSessionId, [shuffledQuestion]);

    const session = await service.createSession('user-1', {
      ...makeInput([{ ...shuffledQuestion }], { 'ai-fp-generation-time': 'A' }),
      clientSessionId,
    });

    expect(session.questions[0]!.options).toEqual(['Correct AI answer', 'Distractor']);
    expect(session.score).toBe(1);
    expect(session.percentage).toBe(100);
  });

  it('returns reserved:false without throwing when there are no questions to store', async () => {
    const result = await service.reserveGeneratedExamSnapshot('user-1', 'f5555555-5555-4555-8555-555555555555', []);
    expect(result.reserved).toBe(false);
  });
});
