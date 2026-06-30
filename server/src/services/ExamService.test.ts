import { describe, it, expect, beforeEach } from 'vitest';
import { ExamService, _fingerprint, _normalizeAnswerLetter, _getCorrectAnswer } from './ExamService.js';
import { InMemoryExamSessionsRepository } from '../repositories/memory/ExamSessionsRepository.js';
import { InMemoryQuestionAttemptsRepository } from '../repositories/memory/QuestionAttemptsRepository.js';
import { InMemoryQuestionsRepository } from '../repositories/memory/QuestionsRepository.js';
import { InMemoryConceptsRepository } from '../repositories/memory/ConceptsRepository.js';
import { InMemoryQuestionConceptsRepository } from '../repositories/memory/QuestionConceptsRepository.js';
import { InMemoryUserConceptMasteryRepository } from '../repositories/memory/UserConceptMasteryRepository.js';
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
    const input = {
      ...makeInput(),
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
    expect(_normalizeAnswerLetter('E')).toBe('');
    expect(_normalizeAnswerLetter('')).toBe('');
    expect(_normalizeAnswerLetter(null)).toBe('');
    expect(_normalizeAnswerLetter(undefined)).toBe('');
  });

  it('converts numeric indexes 0–3 to letters', () => {
    expect(_normalizeAnswerLetter(0)).toBe('A');
    expect(_normalizeAnswerLetter(1)).toBe('B');
    expect(_normalizeAnswerLetter(2)).toBe('C');
    expect(_normalizeAnswerLetter(3)).toBe('D');
  });

  it('returns empty string for out-of-range numeric index', () => {
    expect(_normalizeAnswerLetter(4)).toBe('');
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
    expect(attempts[0]!.selected_answer).toBe('c'); // raw preserved
  });

  it('marks attempt correct when user sends "C. option text" and correct_answer is "C"', async () => {
    const input = makeInput([letterQuestion], { 'q-norm-001': 'C. Some option text' });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.is_correct).toBe(true);
    expect(attempts[0]!.selected_answer).toBe('C. Some option text');
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

  it('keeps selected_answer raw and does not mutate it', async () => {
    const raw = 'c. Some option text';
    const input = makeInput([letterQuestion], { 'q-norm-001': raw });
    const session = await service.createSession('user-1', input);
    const attempts = await attemptsRepo.findBySessionId(session.id);
    expect(attempts[0]!.selected_answer).toBe(raw);
  });
});

// ── _getCorrectAnswer alias fallback ─────────────────────────────────────────

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
