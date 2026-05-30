import { describe, it, expect } from 'vitest';
import { scoreQuestion, buildRepairPrompt, isSuspectStem, REPAIR_GUIDANCE, type QuestionQuality } from './questionValidator.js';

function makeOptions(texts: string[]) {
  return texts.map((text, i) => ({ letter: 'ABCD'[i] as string, text }));
}

describe('questionValidator', () => {
  it('rejects trivia question without clinical vignette', () => {
    const q = {
      stem: 'Which enzyme is deficient in Lesch-Nyhan syndrome?', // 51 chars, no age/sex/presentation
      options: makeOptions(['HGPRT', 'APRT', 'ADA', 'PNP']),
      correct: 'A',
      explanation: 'HGPRT deficiency causes Lesch-Nyhan syndrome characterized by hyperuricemia and self-mutilation.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('no_clinical_vignette');
    expect(result.validationStatus).toBe('fail');
  });

  it('rejects duplicate answer options', () => {
    const q = {
      stem: 'A 24-year-old man with an X-linked disorder presents with joint pain, hyperuricemia, and self-mutilatory behavior since childhood. Which enzyme deficiency is responsible for this condition?',
      options: makeOptions(['HGPRT', 'HGPRT', 'ADA', 'PNP']), // duplicate A and B
      correct: 'A',
      explanation: 'HGPRT (hypoxanthine-guanine phosphoribosyltransferase) deficiency is the cause of Lesch-Nyhan syndrome, an X-linked recessive disorder with excess uric acid production.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('duplicate_options');
    expect(result.distractorQualityScore).toBe(0);
    expect(result.validationStatus).toBe('fail');
  });

  it('rejects shallow explanation in practice mode', () => {
    const q = {
      stem: 'A 35-year-old woman presents with painful swollen joints and serum uric acid of 9.2 mg/dL. She has been taking hydrochlorothiazide for hypertension for 6 months. Which mechanism best explains her current presentation?',
      options: makeOptions([
        'Decreased renal uric acid excretion',
        'Increased de novo purine synthesis',
        'Decreased xanthine oxidase activity',
        'Impaired urate transporter function',
      ]),
      correct: 'A',
      explanation: 'HCTZ decreases uric acid excretion.', // 35 chars < 50 threshold
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('shallow_explanation');
    expect(result.validationStatus).toBe('fail');
  });

  it('rejects severe clue leakage when correct answer text appears verbatim in stem', () => {
    const q = {
      // Stem literally contains "folic acid supplementation", which is the correct answer text
      stem: 'A 45-year-old woman with rheumatoid arthritis is prescribed methotrexate. Her physician adds folic acid supplementation to reduce drug toxicity. What is the primary mechanism of methotrexate toxicity in rapidly dividing cells?',
      options: makeOptions([
        'Folic acid supplementation',
        'Direct DNA strand breaks',
        'Topoisomerase II inhibition',
        'Thymidylate synthase activation',
      ]),
      correct: 'A',
      explanation: 'Methotrexate inhibits dihydrofolate reductase, depleting active folate pools required for nucleotide synthesis in rapidly dividing cells. This is distinct from simply providing folic acid.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('severe_clue_leakage');
    expect(result.clueLeakageScore).toBeLessThan(40);
    expect(result.validationStatus).toBe('fail');
  });

  it('scores a simple one-sentence question with low reasoning depth', () => {
    const q = {
      stem: 'A 30-year-old man presents with foot drop after trauma.',
      options: makeOptions(['Common peroneal nerve', 'Femoral nerve', 'Sciatic nerve', 'Tibial nerve']),
      correct: 'A',
      explanation: 'The common peroneal nerve wraps around the fibular neck and is injured by trauma, causing foot drop.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.reasoningDepthScore).toBeLessThan(30);
  });

  it('scores uniform-length options with high distractor quality score', () => {
    const q = {
      stem: 'A 52-year-old woman presents with a butterfly rash, joint pain, and photosensitivity for 3 months. ANA is positive with high titer. What is the most likely diagnosis?',
      options: makeOptions([
        'Systemic lupus erythematosus',
        'Rheumatoid arthritis disorder',
        'Dermatomyositis skin disease',
        'Sjogrens syndrome condition',
      ]),
      correct: 'A',
      explanation: 'SLE presents with butterfly rash, photosensitivity, and positive ANA. Joint pain and systemic inflammation are hallmark features. Rheumatoid arthritis lacks cutaneous manifestations. Dermatomyositis shows heliotrope rash and proximal weakness.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.distractorQualityScore).toBeGreaterThan(70);
  });

  it('accepts a well-formed NBME-style clinical vignette question', () => {
    const q = {
      stem: 'A 24-year-old man is brought to the emergency department after being found confused and agitated. His roommate reports he has been drinking heavily for 1 week and stopped 12 hours ago. Temperature 38.5C, pulse 110/min, BP 150/90 mmHg. He has a fine resting tremor and diaphoresis.',
      options: makeOptions(['Lorazepam', 'Haloperidol', 'Naloxone', 'Propranolol']),
      correct: 'A',
      explanation: 'This patient has alcohol withdrawal syndrome after abrupt cessation of heavy alcohol use. Benzodiazepines like lorazepam act on GABA-A receptors to reduce CNS excitability and prevent withdrawal seizures. Haloperidol treats psychosis but does not prevent seizures. Naloxone reverses opioid toxicity and has no role here. Propranolol may reduce tremor but does not prevent life-threatening withdrawal complications including seizures and delirium tremens.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.validationStatus).toBe('pass');
    expect(result.qualityScore).toBeGreaterThanOrEqual(60);
  });

  it('buildRepairPrompt includes guidance for each actionable rejection reason', () => {
    const q = { stem: 'What is the mechanism?', options: [], correct: 'A', explanation: 'Short.' };
    const quality: QuestionQuality = {
      qualityScore: 20,
      nbmeStyleScore: 0,
      reasoningDepthScore: 5,
      distractorQualityScore: 0,
      clueLeakageScore: 90,
      explanationQualityScore: 10,
      difficultyCalibrationScore: 30,
      rejectionReasons: ['no_clinical_vignette', 'shallow_explanation'],
      validationStatus: 'fail',
    };
    const prompt = buildRepairPrompt(q as Record<string, unknown>, quality);
    expect(prompt).not.toBe('');
    expect(prompt).toContain(REPAIR_GUIDANCE['no_clinical_vignette']);
    expect(prompt).toContain(REPAIR_GUIDANCE['shallow_explanation']);
  });

  describe('isSuspectStem', () => {
    it('flags the exact AKI bare question that triggered this guard', () => {
      expect(isSuspectStem('What is the most likely cause of his acute kidney injury?')).toBe(true);
    });

    it('flags stems shorter than 100 characters', () => {
      expect(isSuspectStem('A 30-year-old man presents with foot drop after trauma.')).toBe(true);
    });

    it('flags generic phrases without age or findings', () => {
      expect(isSuspectStem('A patient with chest pain comes to the emergency department for evaluation of an acute episode.')).toBe(true);
      expect(isSuspectStem('A man presents to the clinic complaining of fatigue and shortness of breath on exertion for weeks.')).toBe(true);
      expect(isSuspectStem('A patient presents to the hospital for an evaluation of a new onset of symptoms that have been ongoing.')).toBe(true);
    });

    it('does not flag a full NBME-style vignette', () => {
      expect(isSuspectStem(
        'A 67-year-old man with a 10-year history of type 2 diabetes mellitus and hypertension presents to the emergency department with 3 days of decreased urine output. His creatinine is 3.2 mg/dL from a baseline of 1.0 mg/dL.',
      )).toBe(false);
    });

    it('does not flag a vignette that starts with age and sex', () => {
      expect(isSuspectStem(
        'A 45-year-old woman presents to her cardiologist with 3 months of progressive exertional dyspnea and two syncopal episodes. Echo shows a valve area of 0.8 cm2 and a mean gradient of 42 mmHg.',
      )).toBe(false);
    });
  });

  it('buildRepairPrompt returns empty string when no rejection reason has guidance', () => {
    const q = { stem: 'test', options: [], correct: 'A', explanation: '' };
    const quality: QuestionQuality = {
      qualityScore: 30,
      nbmeStyleScore: 0,
      reasoningDepthScore: 0,
      distractorQualityScore: 0,
      clueLeakageScore: 5,
      explanationQualityScore: 0,
      difficultyCalibrationScore: 0,
      rejectionReasons: ['duplicate_options', 'insufficient_options'], // not in REPAIR_GUIDANCE
      validationStatus: 'fail',
    };
    const prompt = buildRepairPrompt(q as Record<string, unknown>, quality);
    expect(prompt).toBe('');
  });
});
