import { describe, it, expect } from 'vitest';
import { generateFlashcardsFromWrongQuestions } from './flashcardGenerator.js';
import { validateClinicalCard } from './flashcardValidator.js';

const makeSession = (questions, mode = 'practice') => ({ questions, mode });

const baseQuestion = (overrides = {}) => ({
  id: 'q1',
  subject: 'Physiology',
  system: 'Cardiovascular',
  correctAnswer: 'A',
  options: ['Increased preload decreases cardiac output.', 'Decreased afterload increases cardiac output.', 'Preload equals end-diastolic volume.', 'Afterload equals peripheral resistance.'],
  explanation: 'Afterload is the resistance the heart must overcome to eject blood.',
  testedConcept: 'Preload and afterload mechanics',
  ...overrides,
});

describe('generateFlashcardsFromWrongQuestions', () => {
  it('returns empty array when no questions', () => {
    const cards = generateFlashcardsFromWrongQuestions(makeSession([]), 'practice');
    expect(cards).toHaveLength(0);
  });

  it('generates at least a Recall card for a missed question', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    const recall = cards.find((c) => c.tag === 'Recall');
    expect(recall).toBeDefined();
    expect(recall.sourceQuestionId).toBe('q1');
    expect(recall.reviewStatus).toBe('new');
  });

  it('builds Recall cards from tested concept, not the original question stem', () => {
    const session = makeSession([
      {
        ...baseQuestion({
          testedConcept: 'RV infarction — preload-dependent management',
          stem: 'A patient with inferior STEMI and right ventricular infarction is hypotensive. Which management approach is most appropriate?',
        }),
        selectedAnswer: 'B',
      },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'coach');
    const recall = cards.find((c) => c.tag === 'Recall');
    expect(recall.front).toMatch(/RV infarction/i);
    expect(recall.front).toMatch(/preload-dependent management/i);
    expect(recall.front).not.toMatch(/Which management approach/i);
  });

  it('generates a Pearl card when pearl contains a recognisable clinical pattern', () => {
    const session = makeSession([
      {
        ...baseQuestion({
          testedConcept: 'Acute pulmonary edema — loop diuretics first-line treatment',
          pearl: 'Loop diuretics are first-line for acute pulmonary edema.',
        }),
        selectedAnswer: 'B',
      },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards.some((c) => c.tag === 'Pearl')).toBe(true);
  });

  it('does not generate Pearl cards when the pearl does not match the tested concept', () => {
    const session = makeSession([
      {
        ...baseQuestion({
          testedConcept: 'Preload and afterload mechanics',
          pearl: 'ACE inhibitors are first-line for hypertension with diabetic nephropathy.',
        }),
        selectedAnswer: 'B',
      },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards.some((c) => c.tag === 'Pearl')).toBe(false);
  });

  it('generates a Trap card when commonTrap contains a recognisable clinical pattern', () => {
    const session = makeSession([
      {
        ...baseQuestion({
          testedConcept: 'Furosemide contraindication in sulfa allergy',
          explanation: 'Furosemide blocks NKCC2 in the thick ascending limb.',
          commonTrap: 'Furosemide is contraindicated in sulfa allergy.',
        }),
        selectedAnswer: 'B',
      },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards.some((c) => c.tag === 'Trap')).toBe(true);
  });

  it('does not generate a Pearl card when pearl has no recognisable clinical pattern', () => {
    const session = makeSession([
      { ...baseQuestion({ pearl: 'High-yield pearl about this topic.' }), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards.some((c) => c.tag === 'Pearl')).toBe(false);
  });

  it('never generates meta-learning fronts', () => {
    const META_PATTERNS = [/what mistake/i, /what aspect/i, /how do you remember/i, /high.yield pearl for/i, /what concept/i];
    const session = makeSession([
      { ...baseQuestion({ pearl: 'Loop diuretics are first-line for acute pulmonary edema.', commonTrap: 'Furosemide is contraindicated in sulfa allergy.', memoryAnchor: 'FURO = Renal Output' }), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    for (const card of cards) {
      for (const re of META_PATTERNS) {
        expect(re.test(card.front), `meta-learning front detected: "${card.front}"`).toBe(false);
      }
    }
  });

  it('skips questions answered correctly', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'A' }, // correct
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards).toHaveLength(0);
  });

  it('deduplicates cards with the same front', () => {
    // Two questions with identical concept — dedup should collapse
    const q1 = { ...baseQuestion({ id: 'q1', testedConcept: 'SameConcept' }), selectedAnswer: 'B' };
    const q2 = { ...baseQuestion({ id: 'q2', testedConcept: 'SameConcept' }), selectedAnswer: 'B' };
    const session = makeSession([q1, q2]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    const fronts = cards.map((c) => c.front);
    const unique = new Set(fronts);
    expect(unique.size).toBe(fronts.length);
  });

  it('card front is truncated to ≤ 17 tokens (16 words + optional ellipsis)', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    for (const card of cards) {
      // capWords(text, 16) may append '…' as a single character, not a word
      const withoutEllipsis = card.front.replace(/…$/, '').trim();
      const wordCount = withoutEllipsis.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(16);
    }
  });
});

describe('generateFlashcardsFromWrongQuestions — clinical reinforcement fields', () => {
  it('populates clinicalPrompt equal to front for all cards', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.clinicalPrompt).toBe(card.front);
    }
  });

  it('populates coreMechanism equal to back for all cards', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    for (const card of cards) {
      expect(card.coreMechanism).toBe(card.back);
    }
  });

  it('propagates memoryAnchor from the source question onto cards', () => {
    const q = { ...baseQuestion({ memoryAnchor: 'PRELOAD = Filling. AFTERLOAD = Squeezing.' }), selectedAnswer: 'B' };
    const cards = generateFlashcardsFromWrongQuestions(makeSession([q]), 'practice');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].memoryAnchor).toBe('PRELOAD = Filling. AFTERLOAD = Squeezing.');
  });

  it('propagates commonTrap from the source question onto cards', () => {
    const q = { ...baseQuestion({ commonTrap: 'Preload ≠ afterload — students confuse these regularly.' }), selectedAnswer: 'B' };
    const cards = generateFlashcardsFromWrongQuestions(makeSession([q]), 'practice');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].commonTrap).toBe('Preload ≠ afterload — students confuse these regularly.');
  });

  it('sets reinforcementPriority to high when weakSpotCategory is present', () => {
    const q = { ...baseQuestion({ weakSpotCategory: 'Cardiovascular Physiology' }), selectedAnswer: 'B' };
    const cards = generateFlashcardsFromWrongQuestions(makeSession([q]), 'coach');
    expect(cards[0].reinforcementPriority).toBe('high');
  });

  it('sets reinforcementPriority to medium for coach mode without weakSpotCategory', () => {
    const q = { ...baseQuestion(), selectedAnswer: 'B' };
    const cards = generateFlashcardsFromWrongQuestions(makeSession([q]), 'coach');
    expect(cards[0].reinforcementPriority).toBe('medium');
  });

  it('prefers mechanism sentence from explanation over bare option text in back', () => {
    const q = {
      ...baseQuestion({
        testedConcept: 'ACE inhibitor cough — bradykinin accumulation mechanism',
        options: ['Bradykinin', 'Renin', 'Angiotensin', 'Aldosterone'],
        explanation: 'ACE inhibits bradykinin breakdown, causing accumulation in the airways. This leads to stimulation of cough receptors.',
      }),
      selectedAnswer: 'B',
    };
    const cards = generateFlashcardsFromWrongQuestions(makeSession([q]), 'practice');
    const recall = cards.find(c => c.tag === 'Recall');
    // Should contain mechanism language, not just the bare word 'Bradykinin'
    expect(recall.back.toLowerCase()).toMatch(/accumulation|causes|leads to|inhibit/);
  });

  it('old front/back fields remain populated — backward compat with storage dedup', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'B' },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    for (const card of cards) {
      expect(typeof card.front).toBe('string');
      expect(card.front.length).toBeGreaterThan(0);
      expect(typeof card.back).toBe('string');
      expect(card.back.length).toBeGreaterThan(0);
    }
  });
});

describe('generateFlashcardsFromWrongQuestions — validator integration', () => {
  it('all generated cards pass validateClinicalCard', () => {
    const session = makeSession([
      { ...baseQuestion(), selectedAnswer: 'B' },
      {
        ...baseQuestion({
          id: 'q2',
          explanation: 'ACE inhibition causes bradykinin accumulation, which leads to persistent cough.',
          pearl: 'ACE inhibitors are first-line for hypertension with diabetic nephropathy due to renoprotection.',
          commonTrap: 'Students confuse ACE inhibitor cough with angioedema — both involve bradykinin excess.',
        }),
        selectedAnswer: 'C',
      },
    ]);
    const cards = generateFlashcardsFromWrongQuestions(session, 'practice');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const result = validateClinicalCard(card);
      expect(
        result.valid,
        `"${card.front}" (tag: ${card.tag}) → reasons: [${result.reasons.join(', ')}]`
      ).toBe(true);
    }
  });
});
