// Server-owned answer-key flow for Exam mode / Step 1 Block sessions.
//
// Exam-mode question payloads must never reach the browser with an answer key
// or rationale attached before the student submits. Two pieces make that true:
//
//   1. shuffleQuestionForExam — decides the per-session display order on the
//      server (mirrors medica-app/src/lib/questionNormalizer.js's
//      shuffleQuestionOptions) so the client never needs to shuffle — and
//      never needs the correct answer to do so.
//   2. toStudentExamQuestion — an allow-list sanitizer. Only fields a student
//      needs to answer/render the question survive; every answer/rationale
//      field is dropped by construction, not by exclusion.

const ANSWER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'] as const;

export interface StudentViewOption {
  letter: string;
  text: string;
}

export interface StudentExamQuestion {
  id: string;
  stem: string;
  options: StudentViewOption[];
  subject: string;
  system: string;
  topic: string;
  rawTopic: string;
  canonicalTopic: string;
  topicSlug: string;
  topicSource: string;
  questionAngle: string;
  usmleContentArea: string;
  usmleSubdomain: string;
  physicianTask: string;
  difficulty: string;
  testedConcept: string;
  weakSpotCategory: string;
}

function normalizeLetterValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return ANSWER_LETTERS[value] ?? '';
  const raw = String(value).trim();
  const letter = (raw[0] ?? '').toUpperCase();
  return (ANSWER_LETTERS as readonly string[]).includes(letter) ? letter : '';
}

/** Mirrors getQuestionCorrectLetter() in medica-app/src/lib/answerNormalize.js. */
export function getGeneratedQuestionCorrectLetter(question: Record<string, unknown>): string {
  const raw = question['correct'] ?? question['correctAnswer'] ?? question['correct_answer'];
  return normalizeLetterValue(raw);
}

/**
 * Accepts both the fresh-generation option shape ({letter,text}[]) and the
 * plain string[] shape a Question row round-trips through storage as (see
 * questionFromAuthoritativeBody / normalizeOptionsFromBody in ExamService.ts)
 * — a reservation retry sanitizes stored Question bodies, not fresh generation
 * output, so both shapes must resolve to the same per-index letter assignment.
 */
function toOptionArray(value: unknown): StudentViewOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((opt, i) => {
      if (typeof opt === 'string') {
        const text = opt.trim();
        return text ? { letter: ANSWER_LETTERS[i] ?? '', text } : null;
      }
      if (opt && typeof opt === 'object') {
        const letter = String((opt as Record<string, unknown>)['letter'] ?? '').trim().toUpperCase();
        const text = String((opt as Record<string, unknown>)['text'] ?? '').trim();
        return letter ? { letter, text } : null;
      }
      return null;
    })
    .filter((opt): opt is StudentViewOption => opt !== null && opt.letter !== '');
}

/**
 * Decides the per-session display order for an exam question on the server,
 * before any answer-bearing data leaves the process. Each option keeps its
 * original .letter as an identity tag through the shuffle, exactly like the
 * client-side Fisher-Yates port it replaces — then correct/optionExplanations
 * are remapped onto the new positions so scoring and review stay consistent
 * with whatever order is actually returned to the student.
 *
 * Never throws: a question whose stored correct-letter has no matching option
 * (should be unreachable — generation validation already guarantees this) is
 * returned unshuffled rather than failing the whole batch.
 */
export function shuffleQuestionForExam<T extends Record<string, unknown>>(question: T): T {
  const opts = toOptionArray(question['options']);
  if (opts.length < 2) return question;

  const originalCorrect = getGeneratedQuestionCorrectLetter(question);
  if (!originalCorrect) return question;

  const shuffled = [...opts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  const newCorrectIdx = shuffled.findIndex((opt) => opt.letter === originalCorrect);
  if (newCorrectIdx < 0) return question;

  const newOptions = shuffled.map((opt, i) => ({ letter: ANSWER_LETTERS[i]!, text: opt.text }));
  const newCorrect = ANSWER_LETTERS[newCorrectIdx]!;

  const oldExps = (question['optionExplanations'] ?? {}) as Record<string, string>;
  const newOptionExplanations: Record<string, string> = {};
  shuffled.forEach((opt, i) => {
    const exp = oldExps[opt.letter];
    if (exp) newOptionExplanations[ANSWER_LETTERS[i]!] = exp;
  });

  return {
    ...question,
    options: newOptions,
    correct: newCorrect,
    optionExplanations: Object.keys(newOptionExplanations).length > 0 ? newOptionExplanations : oldExps,
  };
}

/**
 * Allow-list sanitizer for Exam-mode pre-submit question payloads. Only
 * fields a student needs to read and answer the question are copied over —
 * every answer/rationale field (correct, correctAnswer, correct_answer,
 * explanation, optionExplanations, wrongAnswerExplanations, pearl,
 * highYieldPearl, memoryAnchor, commonTrap, and any bank/admin metadata) is
 * excluded by construction rather than deleted, so a new field added to the
 * question model later is safe-by-default instead of silently leaking.
 *
 * Accepts either a fresh-generation body (stem, {letter,text}[] options) or a
 * stored reservation's Question shape (text, string[] options) — a retried
 * request sanitizes directly from the stored snapshot, not a fresh shuffle.
 */
export function toStudentExamQuestion(question: Record<string, unknown>): StudentExamQuestion {
  return {
    id:               String(question['id'] ?? ''),
    stem:             String(question['stem'] ?? question['text'] ?? ''),
    options:          toOptionArray(question['options']),
    subject:          String(question['subject'] ?? ''),
    system:           String(question['system'] ?? ''),
    topic:            String(question['topic'] ?? ''),
    rawTopic:         String(question['rawTopic'] ?? ''),
    canonicalTopic:   String(question['canonicalTopic'] ?? ''),
    topicSlug:        String(question['topicSlug'] ?? ''),
    topicSource:      String(question['topicSource'] ?? ''),
    questionAngle:    String(question['questionAngle'] ?? ''),
    usmleContentArea: String(question['usmleContentArea'] ?? ''),
    usmleSubdomain:   String(question['usmleSubdomain'] ?? ''),
    physicianTask:    String(question['physicianTask'] ?? ''),
    difficulty:       String(question['difficulty'] ?? ''),
    testedConcept:    String(question['testedConcept'] ?? ''),
    weakSpotCategory: String(question['weakSpotCategory'] ?? ''),
  };
}
