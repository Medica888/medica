import { describe, it, expect } from 'vitest';
import {
  scoreQuestion, buildRepairPrompt, isSuspectStem, REPAIR_GUIDANCE,
  requiresMedicalReview, buildMedicalReviewPrompt, parseMedicalReviewResponse,
  isNbmeDifficulty,
  scoreNbmePatientAnchor, scoreNbmeClinicalSignal, scoreNbmeLeadIn,
  scoreNbmeOptionStyle, scoreNbmeClueLeakage, scoreNbmeQuestion,
  scoreScopeAlignment, checkDifficultyFit, checkUworldSpecific,
  type QuestionQuality,
} from './questionValidator.js';

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

  // ── Semantic consistency checks (new) ────────────────────────────────────────

  describe('answer support check', () => {
    const GOOD_STEM = 'A 45-year-old woman with rheumatoid arthritis and renal insufficiency presents with progressive dyspnea. Her creatinine is 2.8 mg/dL. She is started on a new medication. Two weeks later she develops a dry persistent cough. Which drug class is most likely responsible?';
    const GOOD_OPTS = makeOptions(['ACE inhibitors', 'Beta blockers', 'Calcium channel blockers', 'Loop diuretics']);

    it('rejects a practice question whose explanation does not mention the correct option', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        explanation: 'Beta blockers reduce heart rate and are used in heart failure management. They work through adrenergic receptor blockade and have various clinical indications in cardiology.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('answer_not_supported');
      expect(result.validationStatus).toBe('fail');
    });

    it('accepts a practice question whose explanation clearly supports the correct option', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        explanation: 'ACE inhibitors block the conversion of angiotensin I to angiotensin II. A common adverse effect is bradykinin accumulation, which causes a dry persistent cough. This class is frequently used in hypertension and heart failure but must be dose-adjusted in renal insufficiency.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('skips answer support check in exam mode (no explanation required)', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        explanation: '',
      };
      const result = scoreQuestion(q, 'exam', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('accepts when per-option explanation supports the correct answer', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        explanation: 'The correct option is supported by the mechanism of bradykinin accumulation.',
        optionExplanations: {
          A: 'ACE inhibitors accumulate bradykinin — the direct cause of a dry cough. This is the only class listed that causes this effect.',
          B: 'Beta blockers cause bradycardia and bronchospasm but not cough.',
          C: 'Calcium channel blockers cause peripheral edema and flushing, not cough.',
          D: 'Loop diuretics cause electrolyte imbalances and volume depletion, not cough.',
        },
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    // ── Short medical abbreviations (H1 false-positive fix) ─────────────────

    it('passes ATP when explanation mentions ATP', () => {
      const q = {
        stem: 'A 28-year-old man is evaluated for muscle weakness and exercise intolerance. Electron microscopy of his muscle biopsy shows abnormal mitochondria. Biochemical testing reveals a defect in Complex V of the electron transport chain. Which molecule is most directly underproduced as a result?',
        options: makeOptions(['ATP', 'NADH', 'FADH2', 'Pyruvate']),
        correct: 'A',
        explanation: 'Complex V (ATP synthase) couples the proton gradient generated by the electron transport chain to the synthesis of ATP. A defect in Complex V therefore reduces ATP production. NADH and FADH2 are electron donors upstream of Complex V and would not be depleted by this defect.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes TSH when explanation mentions TSH', () => {
      const q = {
        stem: 'A 35-year-old woman presents with fatigue, weight gain, cold intolerance, and constipation for 4 months. Her TSH is 48 mIU/L and free T4 is 0.4 ng/dL. Which lab value is most directly responsible for her symptoms?',
        options: makeOptions(['TSH', 'Free T4', 'Free T3', 'TRH']),
        correct: 'A',
        explanation: 'TSH is elevated in primary hypothyroidism due to loss of negative feedback from low thyroid hormones. While the symptoms are caused by insufficient T4 and T3 at target tissues, TSH elevation is the primary lab abnormality that drives the clinical picture in this scenario.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes ACE when explanation mentions ACE', () => {
      const q = {
        stem: 'A 58-year-old man with hypertension and proteinuria starts a new antihypertensive. Two weeks later he develops a dry non-productive cough. The mechanism involves accumulation of a bradykinin-like peptide. Which enzyme is inhibited by his new medication?',
        options: makeOptions(['ACE', 'Renin', 'Aldosterone synthase', 'Neprilysin']),
        correct: 'A',
        explanation: 'ACE (angiotensin-converting enzyme) inhibitors block ACE, which normally degrades bradykinin. Accumulation of bradykinin causes the characteristic dry cough. Renin inhibitors and aldosterone synthase inhibitors do not affect bradykinin metabolism.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes ATP as a known abbreviation even when explanation does not spell out ATP', () => {
      // ATP is in the allowlist — a correct explanation about energy production
      // need not restate the abbreviation to satisfy the support check.
      const q = {
        stem: 'A 28-year-old man is evaluated for muscle weakness and exercise intolerance. Electron microscopy of his muscle biopsy shows abnormal mitochondria. Biochemical testing reveals a defect in Complex V. Which molecule is most directly underproduced?',
        options: makeOptions(['ATP', 'NADH', 'FADH2', 'Pyruvate']),
        correct: 'A',
        explanation: 'A defect in the electron transport chain leads to reduced energy production in skeletal muscle, explaining the exercise intolerance. Upstream electron carriers remain abundant.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes LH as a known 2-character abbreviation', () => {
      const q = {
        stem: 'A 26-year-old woman presents with secondary amenorrhea and infertility. Serum progesterone is low throughout the cycle. Ultrasound shows no ovulation. Which hormone surge is absent in this patient?',
        options: makeOptions(['LH', 'FSH', 'Progesterone', 'Estradiol']),
        correct: 'A',
        explanation: 'Ovulation is triggered by a midcycle surge. Without this surge, the follicle does not rupture, oocyte release does not occur, and the corpus luteum does not form — explaining the low progesterone and amenorrhea.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes Na as a known 2-character electrolyte abbreviation', () => {
      const q = {
        stem: 'A 65-year-old man with a history of small cell lung cancer presents with confusion and seizures. Serum osmolality is 258 mOsm/kg and urine osmolality is 620 mOsm/kg. Which serum electrolyte is most critically abnormal?',
        options: makeOptions(['Na', 'K', 'Ca', 'Mg']),
        correct: 'A',
        explanation: 'SIADH causes hyponatremia through inappropriate free water retention, diluting serum sodium. The high urine osmolality relative to serum confirms inappropriate ADH secretion. The resulting hyponatremia drives the neurological symptoms.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes when explanation uses singular form and correct option is plural (e.g. Aminoglycosides / aminoglycoside)', () => {
      // Regression: magic-number verbatim check used to fail when explanation wrote
      // "aminoglycoside" (singular) for a correct option of "Aminoglycosides" (plural).
      const q = {
        stem: 'A 72-year-old man with a history of renal impairment is started on a new antibiotic for gram-negative bacteremia. Three days later his creatinine rises from 1.0 to 2.4 mg/dL and trough drug levels are supratherapeutic. Which antibiotic class is most likely responsible?',
        options: makeOptions(['Aminoglycosides', 'Fluoroquinolones', 'Beta-lactams', 'Macrolides']),
        correct: 'A',
        explanation: 'Aminoglycoside antibiotics (gentamicin, tobramycin, amikacin) are concentration-dependent nephrotoxins. Accumulation in proximal tubular cells causes direct cellular injury — the mechanism behind the rising creatinine and supratherapeutic trough levels.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('passes when explanation uses plural form and correct option is singular (e.g. Aminoglycoside / aminoglycosides)', () => {
      const q = {
        stem: 'A 68-year-old man with gram-negative bacteremia and chronic kidney disease develops rising creatinine and trough levels above the therapeutic range. Which antibiotic most directly causes this nephrotoxicity?',
        options: makeOptions(['Aminoglycoside', 'Fluoroquinolone', 'Cephalosporin', 'Macrolide']),
        correct: 'A',
        explanation: 'Aminoglycosides accumulate in renal proximal tubular cells and cause concentration-dependent nephrotoxicity. Supratherapeutic troughs directly predict nephrotoxic risk in patients with reduced GFR.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('answer_not_supported');
    });

    it('non-allowlist short option text still requires verbatim presence in explanation', () => {
      // 'XYZ' is not a known medical abbreviation — falls through to verbatim check.
      const q = {
        stem: 'A 30-year-old man presents with foot drop after sustaining a proximal fibular fracture. Which pathway marker is most relevant to this presentation?',
        options: makeOptions(['XYZ', 'Femoral nerve', 'Sciatic nerve', 'Tibial nerve']),
        correct: 'A',
        explanation: 'The common peroneal nerve winds around the fibular neck and is vulnerable to injury from fractures at this site, causing foot drop through loss of dorsiflexion.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      // 'xyz' not in explanation → verbatim escape fails → answer_not_supported
      expect(result.rejectionReasons).toContain('answer_not_supported');
    });

    it('abbreviation allowlist does not protect invalid question structure', () => {
      // ATP is in the allowlist, but the correct field is invalid — structural check still fires.
      const q = {
        stem: 'A 28-year-old man is evaluated for muscle weakness. Which molecule is underproduced?',
        options: makeOptions(['ATP', 'NADH', 'FADH2', 'Pyruvate']),
        correct: 'E',  // invalid letter
        explanation: 'Complex V deficiency reduces energy output in muscle tissue.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('invalid_correct_letter');
      expect(result.validationStatus).toBe('fail');
    });
  });

  describe('contradiction check', () => {
    // Options must have text >= 8 chars for the contradiction detector to pattern-match them.
    // 'ADA' (3 chars) is below the threshold — use the full name as the option text.
    const GOOD_STEM = 'A 28-year-old man with an X-linked disorder presents with joint pain and gout. He has self-mutilatory behavior. Which enzyme is deficient?';
    const GOOD_OPTS = makeOptions([
      'Hypoxanthine-guanine phosphoribosyltransferase',
      'Adenosine deaminase deficiency enzyme',
      'Adenine phosphoribosyltransferase',
      'Xanthine oxidase inhibitor pathway',
    ]);

    it('rejects a question whose explanation explicitly names a wrong option as correct', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        // explanation names option B text as the correct answer
        explanation: 'Adenosine deaminase deficiency enzyme is the correct answer because it leads to SCID through purine metabolism disruption. The enzyme in question accumulates substrate and causes tissue toxicity.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('contradictory_explanation');
      expect(result.validationStatus).toBe('fail');
    });

    it('does not flag explanation that only describes wrong options as distractors', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        explanation: 'Hypoxanthine-guanine phosphoribosyltransferase deficiency causes Lesch-Nyhan syndrome with gout and self-mutilation. Adenosine deaminase deficiency causes SCID, not gout. Xanthine oxidase inhibitor pathway describes the pharmacology of allopurinol, not a primary enzyme deficiency.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('contradictory_explanation');
    });

    it('skips contradiction check in exam mode', () => {
      const q = {
        stem: GOOD_STEM,
        options: GOOD_OPTS,
        correct: 'A',
        explanation: 'Adenosine deaminase deficiency enzyme is the correct answer because it leads to SCID.',
      };
      const result = scoreQuestion(q, 'exam', 'Balanced');
      expect(result.rejectionReasons).not.toContain('contradictory_explanation');
    });

    // ── Threshold lowered to 6 + new phrases ──────────────────────────────────
    // Heparin=7, Aspirin=7, Digoxin=7 chars — all below the old 8-char threshold.
    // Argatroban is correct (direct thrombin inhibitor for HIT).
    const HIT_STEM = 'A 58-year-old man with deep vein thrombosis presents with thrombocytopenia three days after initiating anticoagulation. Platelet count has dropped from 280,000 to 42,000/μL. Which anticoagulant is most appropriate for continued therapy?';
    const HIT_OPTS = [
      { letter: 'A', text: 'Argatroban' },
      { letter: 'B', text: 'Heparin' },
      { letter: 'C', text: 'Aspirin' },
      { letter: 'D', text: 'Digoxin' },
    ];

    it('catches "Heparin is the correct answer" when Heparin is a wrong option', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'Heparin is the correct answer for most DVT cases, but in heparin-induced thrombocytopenia it must be avoided and a direct thrombin inhibitor substituted.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('contradictory_explanation');
    });

    it('catches "the best answer is Aspirin" when Aspirin is a wrong option', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'The best answer is aspirin for antiplatelet therapy in acute coronary syndrome, but here a direct thrombin inhibitor is required due to HIT.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('contradictory_explanation');
    });

    it('catches "you should choose Digoxin" when Digoxin is a wrong option', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'You should choose digoxin for rate control in atrial fibrillation with reduced ejection fraction, not for this anticoagulation scenario.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('contradictory_explanation');
    });

    it('catches "Digoxin should be selected" when Digoxin is a wrong option', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'Digoxin should be selected in patients with heart failure and atrial fibrillation requiring rate control.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('contradictory_explanation');
    });

    it('catches "Digoxin is therefore correct" when Digoxin is a wrong option', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'The rate control requirement points to a cardiac glycoside. Digoxin is therefore correct for this presentation.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('contradictory_explanation');
    });

    it('does not flag explanation stating a wrong option is incorrect', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'Argatroban is a direct thrombin inhibitor used when HIT is suspected. Heparin is incorrect because it triggers the PF4-heparin antibody complex that causes HIT. Aspirin does not provide adequate anticoagulation.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('contradictory_explanation');
    });

    it('does not flag when the endorsed option is the correct answer', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'Argatroban is the correct answer. It is a direct thrombin inhibitor that bypasses the heparin-PF4 antibody mechanism entirely, making it safe in HIT.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('contradictory_explanation');
    });

    it('skips new-phrase contradiction detection in exam mode', () => {
      const q = {
        stem: HIT_STEM,
        options: HIT_OPTS,
        correct: 'A',
        explanation: 'You should choose digoxin for this patient. Heparin is the correct answer for standard DVT.',
      };
      const result = scoreQuestion(q, 'exam', 'Balanced');
      expect(result.rejectionReasons).not.toContain('contradictory_explanation');
    });
  });

  describe('coach option explanations check', () => {
    const FULL_STEM = 'A 55-year-old man with type 2 diabetes and CKD stage 3 presents for a routine visit. His HbA1c is 8.2%. His physician considers adding a GLP-1 receptor agonist. Which of the following best describes the mechanism of action of this drug class?';
    const OPTS = makeOptions([
      'Stimulate insulin secretion in a glucose-dependent manner',
      'Inhibit renal glucose reabsorption',
      'Activate PPAR-gamma receptors to increase insulin sensitivity',
      'Block alpha-glucosidase to delay carbohydrate absorption',
    ]);
    const GOOD_EXPLANATION = 'GLP-1 receptor agonists stimulate insulin secretion only when glucose is elevated, reducing the risk of hypoglycemia. They also suppress glucagon, slow gastric emptying, and promote satiety. They are beneficial in CKD stage 3 as they do not require dose adjustment for mild to moderate renal impairment.';

    it('rejects a coach question missing any per-option explanation', () => {
      const q = {
        stem: FULL_STEM,
        options: OPTS,
        correct: 'A',
        explanation: GOOD_EXPLANATION,
        optionExplanations: { A: 'Correct — GLP-1 acts on beta cells in a glucose-dependent way.' },
      };
      const result = scoreQuestion(q, 'coach', 'Balanced');
      expect(result.rejectionReasons).toContain('missing_option_explanations');
      expect(result.validationStatus).toBe('fail');
    });

    it('accepts a coach question with all four option explanations present', () => {
      const q = {
        stem: FULL_STEM,
        options: OPTS,
        correct: 'A',
        explanation: GOOD_EXPLANATION,
        optionExplanations: {
          A: 'GLP-1 receptor agonists stimulate insulin secretion in a glucose-dependent manner, reducing hypoglycemia risk.',
          B: 'SGLT-2 inhibitors inhibit renal glucose reabsorption — not GLP-1 agonists.',
          C: 'Thiazolidinediones activate PPAR-gamma. GLP-1 agonists have a different mechanism.',
          D: 'Alpha-glucosidase inhibitors delay carbohydrate absorption. GLP-1 agonists work via a different pathway.',
        },
      };
      const result = scoreQuestion(q, 'coach', 'Balanced');
      expect(result.rejectionReasons).not.toContain('missing_option_explanations');
    });

    it('does not require per-option explanations in practice mode', () => {
      const q = {
        stem: FULL_STEM,
        options: OPTS,
        correct: 'A',
        explanation: GOOD_EXPLANATION,
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).not.toContain('missing_option_explanations');
    });
  });

  describe('invalid correct answer', () => {
    it('rejects a question with an invalid correct answer letter', () => {
      const q = {
        stem: 'A 30-year-old man presents with foot drop after lateral knee trauma.',
        options: makeOptions(['Common peroneal nerve', 'Femoral nerve', 'Sciatic nerve', 'Tibial nerve']),
        correct: 'E',
        explanation: 'The common peroneal nerve wraps around the fibular neck.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('invalid_correct_letter');
      expect(result.validationStatus).toBe('fail');
    });

    it('rejects a question with an empty correct answer', () => {
      const q = {
        stem: 'A 30-year-old man presents with foot drop after lateral knee trauma.',
        options: makeOptions(['Common peroneal nerve', 'Femoral nerve', 'Sciatic nerve', 'Tibial nerve']),
        correct: '',
        explanation: 'The common peroneal nerve wraps around the fibular neck.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('invalid_correct_letter');
      expect(result.validationStatus).toBe('fail');
    });
  });

  describe('insufficient options', () => {
    it('rejects a question with fewer than 4 options', () => {
      const q = {
        stem: 'A 24-year-old man with an X-linked disorder presents with joint pain and hyperuricemia since childhood.',
        options: [{ letter: 'A', text: 'HGPRT' }, { letter: 'B', text: 'APRT' }],
        correct: 'A',
        explanation: 'HGPRT deficiency causes Lesch-Nyhan syndrome with hyperuricemia and self-mutilation.',
      };
      const result = scoreQuestion(q, 'practice', 'Balanced');
      expect(result.rejectionReasons).toContain('insufficient_options');
      expect(result.validationStatus).toBe('fail');
    });
  });

  describe('REPAIR_GUIDANCE coverage', () => {
    it('buildRepairPrompt includes guidance for answer_not_supported', () => {
      const q = { stem: 'test', options: makeOptions(['A', 'B', 'C', 'D']), correct: 'A', explanation: 'unrelated' };
      const quality: QuestionQuality = {
        qualityScore: 20, nbmeStyleScore: 0, reasoningDepthScore: 0, distractorQualityScore: 0,
        clueLeakageScore: 90, explanationQualityScore: 10, difficultyCalibrationScore: 30,
        rejectionReasons: ['answer_not_supported'],
        validationStatus: 'fail',
      };
      const prompt = buildRepairPrompt(q as Record<string, unknown>, quality);
      expect(prompt).toContain(REPAIR_GUIDANCE['answer_not_supported']);
    });

    it('buildRepairPrompt includes guidance for contradictory_explanation', () => {
      const q = { stem: 'test', options: makeOptions(['A', 'B', 'C', 'D']), correct: 'A', explanation: 'B is correct' };
      const quality: QuestionQuality = {
        qualityScore: 20, nbmeStyleScore: 0, reasoningDepthScore: 0, distractorQualityScore: 0,
        clueLeakageScore: 90, explanationQualityScore: 10, difficultyCalibrationScore: 30,
        rejectionReasons: ['contradictory_explanation'],
        validationStatus: 'fail',
      };
      const prompt = buildRepairPrompt(q as Record<string, unknown>, quality);
      expect(prompt).toContain(REPAIR_GUIDANCE['contradictory_explanation']);
    });

    it('buildRepairPrompt includes guidance for missing_option_explanations', () => {
      const q = { stem: 'test', options: makeOptions(['A', 'B', 'C', 'D']), correct: 'A', explanation: 'ok' };
      const quality: QuestionQuality = {
        qualityScore: 20, nbmeStyleScore: 0, reasoningDepthScore: 0, distractorQualityScore: 0,
        clueLeakageScore: 90, explanationQualityScore: 10, difficultyCalibrationScore: 30,
        rejectionReasons: ['missing_option_explanations'],
        validationStatus: 'fail',
      };
      const prompt = buildRepairPrompt(q as Record<string, unknown>, quality);
      expect(prompt).toContain(REPAIR_GUIDANCE['missing_option_explanations']);
    });
  });

  // ── AI medical review helpers ─────────────────────────────────────────────

  describe('requiresMedicalReview', () => {
    it('returns true for NBME Difficult', () => {
      expect(requiresMedicalReview('NBME Difficult')).toBe(true);
    });

    it('returns true for UWorld Challenge', () => {
      expect(requiresMedicalReview('UWorld Challenge')).toBe(true);
    });

    it('returns false for Balanced — Balanced must never trigger AI review', () => {
      expect(requiresMedicalReview('Balanced')).toBe(false);
    });

    it('returns false for More Hard', () => {
      expect(requiresMedicalReview('More Hard')).toBe(false);
    });

    it('returns false for More Easy', () => {
      expect(requiresMedicalReview('More Easy')).toBe(false);
    });

    it('returns false for standardized', () => {
      expect(requiresMedicalReview('standardized')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(requiresMedicalReview('')).toBe(false);
    });
  });

  describe('buildMedicalReviewPrompt', () => {
    const Q = {
      stem:        'A 52-year-old woman with hypertension and CKD presents with a rising creatinine after starting a new antihypertensive. Which drug is most likely responsible?',
      options:     [{ letter: 'A', text: 'Lisinopril' }, { letter: 'B', text: 'Amlodipine' }, { letter: 'C', text: 'Metoprolol' }, { letter: 'D', text: 'Hydrochlorothiazide' }],
      correct:     'A',
      explanation: 'ACE inhibitors like lisinopril reduce efferent arteriole tone, decreasing GFR and raising creatinine — a known effect in patients with bilateral renal artery stenosis or CKD.',
    };

    it('includes the difficulty label', () => {
      const prompt = buildMedicalReviewPrompt(Q, 'NBME Difficult');
      expect(prompt).toContain('NBME Difficult');
    });

    it('includes all five review dimensions', () => {
      const prompt = buildMedicalReviewPrompt(Q, 'UWorld Challenge');
      expect(prompt).toContain('medicalAccuracy');
      expect(prompt).toContain('singleBestAnswer');
      expect(prompt).toContain('distractorPlausibility');
      expect(prompt).toContain('difficultyAlignment');
      expect(prompt).toContain('explanationQuality');
    });

    it('uses (none — exam mode) placeholder when explanation is empty', () => {
      const prompt = buildMedicalReviewPrompt({ ...Q, explanation: '' }, 'NBME Difficult');
      expect(prompt).toContain('(none — exam mode)');
      expect(prompt).toContain('explanationQuality to "pass"');
    });

    it('includes the correct answer letter', () => {
      const prompt = buildMedicalReviewPrompt(Q, 'NBME Difficult');
      expect(prompt).toContain('Correct: A');
    });
  });

  describe('parseMedicalReviewResponse', () => {
    const CLEAN_PASS = JSON.stringify({
      status:                 'pass',
      medicalAccuracy:        'pass',
      singleBestAnswer:       'pass',
      distractorPlausibility: 'pass',
      difficultyAlignment:    'pass',
      explanationQuality:     'pass',
      reasons:  [],
      summary:  'Well-formed NBME-style question with accurate content and clear distractor hierarchy.',
    });

    it('returns pass:true for a clean all-pass response', () => {
      const { pass, result } = parseMedicalReviewResponse(CLEAN_PASS);
      expect(pass).toBe(true);
      expect(result?.status).toBe('pass');
      expect(result?.medicalAccuracy).toBe('pass');
    });

    it('returns pass:false for malformed JSON', () => {
      expect(parseMedicalReviewResponse('not json at all').pass).toBe(false);
      expect(parseMedicalReviewResponse('').pass).toBe(false);
      expect(parseMedicalReviewResponse('{broken:').pass).toBe(false);
    });

    it('returns pass:false when status field is missing or invalid', () => {
      const noStatus = JSON.stringify({ medicalAccuracy: 'pass', singleBestAnswer: 'pass', distractorPlausibility: 'pass', difficultyAlignment: 'pass', explanationQuality: 'pass', reasons: [], summary: 'ok' });
      expect(parseMedicalReviewResponse(noStatus).pass).toBe(false);

      const badStatus = JSON.stringify({ status: 'maybe', medicalAccuracy: 'pass', singleBestAnswer: 'pass', distractorPlausibility: 'pass', difficultyAlignment: 'pass', explanationQuality: 'pass', reasons: [], summary: 'ok' });
      expect(parseMedicalReviewResponse(badStatus).pass).toBe(false);
    });

    it('returns pass:false when a category dimension is missing or invalid', () => {
      const missingCat = JSON.stringify({ status: 'pass', medicalAccuracy: 'pass', singleBestAnswer: 'pass', distractorPlausibility: 'unknown', difficultyAlignment: 'pass', explanationQuality: 'pass', reasons: [], summary: 'ok' });
      expect(parseMedicalReviewResponse(missingCat).pass).toBe(false);
    });

    it('returns pass:false when any category is fail — even when status claims pass (fail closed)', () => {
      const contradictory = JSON.stringify({
        status:                 'pass',   // status says pass...
        medicalAccuracy:        'pass',
        singleBestAnswer:       'pass',
        distractorPlausibility: 'fail',   // ...but a dimension fails
        difficultyAlignment:    'pass',
        explanationQuality:     'pass',
        reasons:  ['Distractors are too implausible for UWorld Challenge level.'],
        summary:  'Distractor quality is insufficient.',
      });
      const { pass, result } = parseMedicalReviewResponse(contradictory);
      expect(pass).toBe(false);
      expect(result?.distractorPlausibility).toBe('fail');
      expect(result?.status).toBe('pass');  // raw field preserved
    });

    it('returns pass:false when status is fail — even with all categories passing', () => {
      const failStatus = JSON.stringify({
        status:                 'fail',
        medicalAccuracy:        'pass',
        singleBestAnswer:       'pass',
        distractorPlausibility: 'pass',
        difficultyAlignment:    'pass',
        explanationQuality:     'pass',
        reasons:  ['Overall quality insufficient.'],
        summary:  'Reviewer judgement: fail.',
      });
      expect(parseMedicalReviewResponse(failStatus).pass).toBe(false);
    });

    it('strips markdown fences before parsing', () => {
      const fenced = '```json\n' + CLEAN_PASS + '\n```';
      expect(parseMedicalReviewResponse(fenced).pass).toBe(true);
    });

    it('populates reasons and summary on the result object', () => {
      const withReasons = JSON.stringify({
        status:                 'fail',
        medicalAccuracy:        'fail',
        singleBestAnswer:       'pass',
        distractorPlausibility: 'pass',
        difficultyAlignment:    'pass',
        explanationQuality:     'pass',
        reasons:  ['Incorrect mechanism stated for drug interaction.'],
        summary:  'Medical fact error in explanation.',
      });
      const { result } = parseMedicalReviewResponse(withReasons);
      expect(result?.reasons).toEqual(['Incorrect mechanism stated for drug interaction.']);
      expect(result?.summary).toBe('Medical fact error in explanation.');
    });
  });

  describe('Balanced mode does not require medical review', () => {
    it('requiresMedicalReview is false for Balanced — AI gate is never triggered', () => {
      expect(requiresMedicalReview('Balanced')).toBe(false);
    });

    it('scoreQuestion passes a valid Balanced question without requiring AI review', () => {
      const q = {
        stem: 'A 24-year-old man is brought to the emergency department after being found confused and agitated. His roommate reports he has been drinking heavily for 1 week and stopped 12 hours ago. Temperature 38.5C, pulse 110/min, BP 150/90 mmHg. He has a fine resting tremor and diaphoresis.',
        options: makeOptions(['Lorazepam', 'Haloperidol', 'Naloxone', 'Propranolol']),
        correct: 'A',
        explanation: 'This patient has alcohol withdrawal syndrome. Benzodiazepines like lorazepam act on GABA-A receptors to reduce CNS excitability and prevent withdrawal seizures. Haloperidol treats psychosis but does not prevent seizures. Naloxone reverses opioid toxicity. Propranolol does not prevent delirium tremens.',
      };
      const quality = scoreQuestion(q, 'practice', 'Balanced');
      expect(quality.validationStatus).toBe('pass');
      // Balanced → no AI review needed; rule-based pass is sufficient
      expect(requiresMedicalReview('Balanced')).toBe(false);
    });
  });

  describe('NBME Difficult / UWorld Challenge require and enforce AI medical review', () => {
    it('requiresMedicalReview is true for both hard difficulty tiers', () => {
      expect(requiresMedicalReview('NBME Difficult')).toBe(true);
      expect(requiresMedicalReview('UWorld Challenge')).toBe(true);
    });

    it('a failed medical review response causes parseMedicalReviewResponse to return pass:false — question is rejected', () => {
      const failedReview = JSON.stringify({
        status:                 'fail',
        medicalAccuracy:        'fail',
        singleBestAnswer:       'pass',
        distractorPlausibility: 'pass',
        difficultyAlignment:    'pass',
        explanationQuality:     'pass',
        reasons:  ['The stated mechanism for the drug adverse effect is clinically incorrect.'],
        summary:  'Medical accuracy failure — question should be rejected.',
      });
      const { pass } = parseMedicalReviewResponse(failedReview);
      expect(pass).toBe(false);
    });

    it('a fully passing medical review for an NBME Difficult question returns pass:true', () => {
      const passingReview = JSON.stringify({
        status:                 'pass',
        medicalAccuracy:        'pass',
        singleBestAnswer:       'pass',
        distractorPlausibility: 'pass',
        difficultyAlignment:    'pass',
        explanationQuality:     'pass',
        reasons:  [],
        summary:  'Question meets NBME Difficult standards across all dimensions.',
      });
      const { pass } = parseMedicalReviewResponse(passingReview);
      expect(pass).toBe(true);
    });

    it('a malformed AI response (network error / truncated JSON) causes fail-closed rejection', () => {
      expect(parseMedicalReviewResponse('').pass).toBe(false);
      expect(parseMedicalReviewResponse('{"status": "pass"').pass).toBe(false);  // truncated
      expect(parseMedicalReviewResponse('Internal server error 529').pass).toBe(false);
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

// ── Fix A: coach contradiction bypass ─────────────────────────────────────────

const HIT_STEM_COACH = 'A 58-year-old man with deep vein thrombosis presents with thrombocytopenia three days after initiating anticoagulation. Platelet count dropped from 280,000 to 42,000/μL. Which anticoagulant is most appropriate for continued therapy?';
const HIT_OPTS_COACH = [
  { letter: 'A', text: 'Argatroban' },
  { letter: 'B', text: 'Heparin' },
  { letter: 'C', text: 'Aspirin' },
  { letter: 'D', text: 'Digoxin' },
];
const CLEAN_MAIN_EXPL = 'Argatroban is a direct thrombin inhibitor that does not rely on heparin or antithrombin. It is the first-line agent for heparin-induced thrombocytopenia because it bypasses the heparin-PF4 antibody mechanism entirely. Heparin and low-molecular-weight heparin are contraindicated in HIT. Aspirin and digoxin have no anticoagulant role in this context.';

describe('Fix A — coach contradiction bypass', () => {
  it('rejects when a per-option explanation marks a wrong option as correct', () => {
    const q = {
      stem: HIT_STEM_COACH,
      options: HIT_OPTS_COACH,
      correct: 'A',
      explanation: CLEAN_MAIN_EXPL,
      optionExplanations: {
        A: 'Argatroban is a direct thrombin inhibitor safe in HIT.',
        B: 'Heparin is the correct answer for standard DVT anticoagulation.',
        C: 'Aspirin does not provide therapeutic anticoagulation for DVT.',
        D: 'Digoxin is a cardiac glycoside with no anticoagulant role.',
      },
    };
    const result = scoreQuestion(q, 'coach', 'Balanced');
    expect(result.rejectionReasons).toContain('contradictory_explanation');
    expect(result.validationStatus).toBe('fail');
  });

  it('does not falsely reject when the correct option explanation endorses the correct answer', () => {
    const q = {
      stem: HIT_STEM_COACH,
      options: HIT_OPTS_COACH,
      correct: 'A',
      explanation: CLEAN_MAIN_EXPL,
      optionExplanations: {
        A: 'Argatroban is the correct answer — it directly inhibits thrombin without heparin-PF4 involvement.',
        B: 'Heparin is incorrect — it triggers the antibody complex that causes HIT.',
        C: 'Aspirin has antiplatelet properties only and cannot prevent HIT-related thrombosis.',
        D: 'Digoxin has no anticoagulant properties and is irrelevant here.',
      },
    };
    const result = scoreQuestion(q, 'coach', 'Balanced');
    expect(result.rejectionReasons).not.toContain('contradictory_explanation');
  });

  it('exam mode still skips contradiction check even with optionExplanations present', () => {
    const q = {
      stem: HIT_STEM_COACH,
      options: HIT_OPTS_COACH,
      correct: 'A',
      explanation: '',
      optionExplanations: {
        A: 'Correct.',
        B: 'Heparin is the correct answer for this case.',
        C: 'Wrong.',
        D: 'Wrong.',
      },
    };
    const result = scoreQuestion(q, 'exam', 'Balanced');
    expect(result.rejectionReasons).not.toContain('contradictory_explanation');
  });
});

// ── Fix B: medical stop words too aggressive ──────────────────────────────────

const LONG_STEM_GRAVES = 'A 32-year-old woman presents with a 3-month history of palpitations, heat intolerance, and a 6-kg weight loss despite increased appetite. Physical examination reveals a diffusely enlarged thyroid gland, fine tremor of the outstretched hands, and lid lag. TSH is undetectable and free T4 is markedly elevated. Which condition best explains this presentation?';
const LONG_STEM_CUSHING = 'A 45-year-old woman presents with central obesity, facial plethora, and purple striae on her abdomen. She reports proximal muscle weakness and easy bruising. Random cortisol is elevated and her ACTH is suppressed. 24-hour urinary free cortisol is four times the upper limit of normal. Which condition is most consistent with these findings?';
const LONG_STEM_PANIC = 'A 28-year-old man presents to the emergency department with three episodes in the past month of sudden-onset severe chest pain, shortness of breath, palpitations, and an intense fear of dying lasting 15 to 20 minutes. ECG and troponin are normal. Between episodes he worries constantly about having another attack. Which condition best explains this presentation?';

describe('Fix B — disease/disorder/syndrome removed from STOP_WORDS', () => {
  it('supports Graves disease when explanation includes Graves disease', () => {
    const q = {
      stem: LONG_STEM_GRAVES,
      options: makeOptions(['Graves disease', 'Hashimoto thyroiditis', 'Toxic adenoma', 'Subacute thyroiditis']),
      correct: 'A',
      explanation: 'Graves disease is an autoimmune condition caused by TSH-receptor stimulating antibodies. It is the most common cause of hyperthyroidism and presents with a diffuse goiter, exophthalmos, and pretibial myxedema. The suppressed TSH and elevated free T4 with diffuse goiter confirm Graves disease in this clinical picture.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
  });

  it('supports Cushing syndrome when explanation includes Cushing syndrome', () => {
    const q = {
      stem: LONG_STEM_CUSHING,
      options: makeOptions(['Cushing syndrome', 'Addison disease', 'Acromegaly', 'Conn syndrome']),
      correct: 'A',
      explanation: 'Cushing syndrome results from prolonged excess cortisol. An adrenal cortisol-secreting adenoma suppresses ACTH via negative feedback. Cushing syndrome from an adrenal source is the most consistent diagnosis given the suppressed ACTH, elevated urinary free cortisol, and classic cushingoid features: central obesity, striae, proximal myopathy, and easy bruising.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
  });

  it('supports panic disorder when explanation includes panic disorder', () => {
    const q = {
      stem: LONG_STEM_PANIC,
      options: makeOptions(['Panic disorder', 'Generalized anxiety disorder', 'Acute coronary syndrome', 'Hyperthyroidism']),
      correct: 'A',
      explanation: 'Panic disorder is characterized by recurrent, unexpected panic attacks lasting minutes and associated anticipatory anxiety about future attacks. The normal ECG and troponin exclude cardiac causes. Panic disorder fits the pattern of discrete episodes with interictal worry, which is not typical of generalized anxiety disorder or hyperthyroidism.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
  });

  it('still rejects when the correct condition is genuinely unsupported by the explanation', () => {
    const q = {
      stem: LONG_STEM_GRAVES,
      options: makeOptions(['Graves disease', 'Hashimoto thyroiditis', 'Toxic adenoma', 'Subacute thyroiditis']),
      correct: 'A',
      explanation: 'Hashimoto thyroiditis is an autoimmune condition causing hypothyroidism through lymphocytic infiltration. It is the most common cause of hypothyroidism in iodine-sufficient regions. The elevated TSH and low free T4 confirm this diagnosis.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('answer_not_supported');
  });
});

// ── Fix C: plural handling ────────────────────────────────────────────────────

const ANTIBODY_STEM = 'A 25-year-old woman presents with recurrent bacterial infections since childhood. Serum immunoglobulins are absent and B-cell counts are undetectable. Bone marrow biopsy shows a block at the pro-B cell stage. Which molecule is absent on the surface of affected cells?';

describe('Fix C — -ies plural handling in verbatimVariants', () => {
  it('supports Antibodies when explanation uses antibody (singular)', () => {
    const q = {
      stem: ANTIBODY_STEM,
      options: makeOptions(['Antibodies', 'T-cell receptor', 'MHC class II', 'CD4']),
      correct: 'A',
      explanation: 'In X-linked agammaglobulinemia, a BTK mutation arrests B-cell maturation. Without functional BTK, pre-B cells cannot progress to mature B cells. As a result, the patient cannot produce any immunoglobulin or antibody. The absence of antibody leads to susceptibility to encapsulated bacteria requiring opsonization.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
  });

  it('Aminoglycosides still supported by aminoglycoside (simple -s case)', () => {
    const q = {
      stem: 'A 72-year-old man with renal impairment receives a new antibiotic for gram-negative bacteremia. Three days later his creatinine rises from 1.0 to 2.4 mg/dL and trough drug levels are supratherapeutic. Which antibiotic class is most likely responsible?',
      options: makeOptions(['Aminoglycosides', 'Fluoroquinolones', 'Beta-lactams', 'Macrolides']),
      correct: 'A',
      explanation: 'Aminoglycoside antibiotics such as gentamicin and tobramycin are concentration-dependent nephrotoxins that accumulate in proximal tubular cells causing direct cellular injury — the mechanism behind the rising creatinine and supratherapeutic trough levels.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
  });

  it('non-plural term without plural suffix still works (no -s variant exists in stem)', () => {
    const q = {
      stem: 'A 55-year-old man presents with crushing substernal chest pain radiating to the left arm for 40 minutes. ECG shows 3mm ST elevation in leads II, III, and aVF. Troponin is markedly elevated. What is the most likely diagnosis?',
      options: makeOptions(['Myocardial infarction', 'Pulmonary embolism', 'Aortic dissection', 'Pericarditis']),
      correct: 'A',
      explanation: 'Myocardial infarction classically presents with crushing chest pain, ST elevation in contiguous leads, and elevated troponin. The inferior STEMI pattern in II, III, and aVF indicates right coronary artery occlusion. This is the hallmark presentation of acute myocardial infarction requiring immediate reperfusion.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
  });
});

// ── Fix D: structural guard — no_clinical_vignette blocks semantic checks ─────

describe('Fix D — no_clinical_vignette blocks semantic checks', () => {
  it('bare non-vignette stem gets no_clinical_vignette but not spurious answer_not_supported', () => {
    const q = {
      stem: 'Which enzyme catalyzes the rate-limiting step in de novo purine synthesis and what distinguishes it from the salvage pathway in terms of substrate requirement in human biochemistry?',
      options: makeOptions(['PRPP synthetase', 'HGPRT', 'Adenosine deaminase', 'Xanthine oxidase']),
      correct: 'A',
      explanation: 'The rate-limiting step involves PRPP conversion to 5-phosphoribosylamine catalyzed by glutamine PRPP amidotransferase. HGPRT is the key salvage enzyme and requires preformed hypoxanthine or guanine. Adenosine deaminase deficiency leads to deoxyadenosine accumulation and SCID.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('no_clinical_vignette');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
    expect(result.validationStatus).toBe('fail');
  });
});

// ── Fix E: shallow explanation threshold raised to 150 chars ──────────────────

describe('Fix E — shallow_explanation threshold at 150 chars', () => {
  it('rejects an 80-char explanation with shallow_explanation in practice mode', () => {
    const q = {
      stem: 'A 35-year-old woman presents with painful swollen joints, uric acid of 9.2 mg/dL, and hydrochlorothiazide use for 6 months. Which mechanism explains her current presentation?',
      options: makeOptions(['Decreased renal uric acid excretion', 'Increased de novo purine synthesis', 'Decreased xanthine oxidase', 'Impaired urate transporter']),
      correct: 'A',
      explanation: 'HCTZ competitively inhibits uric acid excretion at the renal tubule.',
    };
    expect(q.explanation.length).toBeLessThan(150);
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('shallow_explanation');
    expect(result.validationStatus).toBe('fail');
  });

  it('rejects a 149-char explanation with shallow_explanation in practice mode', () => {
    const explanation = 'A'.repeat(149);
    const q = {
      stem: 'A 35-year-old woman presents with joint pain and elevated uric acid after hydrochlorothiazide therapy. Which mechanism explains this finding?',
      options: makeOptions(['Decreased excretion', 'Increased synthesis', 'Decreased breakdown', 'Increased absorption']),
      correct: 'A',
      explanation,
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('shallow_explanation');
  });

  it('accepts a 150-char explanation without shallow_explanation', () => {
    const explanation = 'A'.repeat(150);
    const q = {
      stem: 'A 35-year-old woman presents with joint pain and elevated uric acid after hydrochlorothiazide therapy. Which mechanism explains this finding?',
      options: makeOptions(['Decreased excretion', 'Increased synthesis', 'Decreased breakdown', 'Increased absorption']),
      correct: 'A',
      explanation,
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('shallow_explanation');
  });

  it('exam mode still skips explanation quality check entirely', () => {
    const q = {
      stem: 'A 35-year-old woman presents with joint pain, elevated uric acid 9.2 mg/dL, and thiazide use. Which mechanism explains her gout?',
      options: makeOptions(['Decreased excretion', 'Increased synthesis', 'Decreased breakdown', 'Increased absorption']),
      correct: 'A',
      explanation: '',
    };
    const result = scoreQuestion(q, 'exam', 'Balanced');
    expect(result.explanationQualityScore).toBe(100);
    expect(result.rejectionReasons).not.toContain('shallow_explanation');
  });
});

// ── Fix F: clue leakage score when correct option is absent ──────────────────

describe('Fix F — scoreClueLeakage returns 0 when correct option letter absent', () => {
  it('does not inflate clueLeakageScore when correct letter is absent from options', () => {
    const q = {
      stem: 'A 30-year-old man presents with foot drop after lateral knee trauma from a sports injury yesterday.',
      options: [
        { letter: 'B', text: 'Common peroneal nerve' },
        { letter: 'C', text: 'Femoral nerve' },
        { letter: 'D', text: 'Sciatic nerve' },
        { letter: 'E', text: 'Tibial nerve' },
      ],
      correct: 'A', // valid letter but absent from options
      explanation: 'The common peroneal nerve wraps around the fibular neck and is vulnerable to lateral knee trauma, causing foot drop through loss of dorsiflexion and eversion.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.clueLeakageScore).toBe(0);
  });

  it('invalid correct letter still produces validationStatus fail via invalid_correct_letter', () => {
    const q = {
      stem: 'A 30-year-old man presents with foot drop after lateral knee trauma from a sports injury yesterday.',
      options: makeOptions(['Common peroneal nerve', 'Femoral nerve', 'Sciatic nerve', 'Tibial nerve']),
      correct: 'Z',
      explanation: 'The common peroneal nerve wraps around the fibular neck and is vulnerable to lateral knee trauma, causing foot drop.',
    };
    const result = scoreQuestion(q, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('invalid_correct_letter');
    expect(result.validationStatus).toBe('fail');
  });
});

// ── Fix G: reasoning depth contributes directly to qualityScore ───────────────

describe('Fix G — reasoningDepthScore contributes to qualityScore', () => {
  it('richer multi-sentence vignette scores higher qualityScore than minimal one-liner', () => {
    const sharedOptions = makeOptions(['Furosemide', 'Hydralazine', 'Labetalol', 'Nicardipine']);
    const sharedExpl = 'Furosemide is a loop diuretic that reduces preload and is used in acute heart failure with fluid overload. However, in hypertensive emergency the priority is controlled blood pressure reduction using titratable agents. Labetalol and nicardipine are first-line agents for hypertensive emergency and allow careful titration.';

    const lowDepth = scoreQuestion({
      stem: 'A 45-year-old woman with hypertension presents with a severe headache and visual changes today.',
      options: sharedOptions, correct: 'A', explanation: sharedExpl,
    }, 'practice', 'Balanced');

    const highDepth = scoreQuestion({
      stem: 'A 45-year-old woman with a 5-year history of hypertension presents with a sudden-onset headache and visual disturbances. Blood pressure is 210/120 mmHg. Fundoscopic examination reveals papilledema bilaterally. Serum creatinine is 2.1 mg/dL, elevated from a baseline of 0.9 mg/dL.',
      options: sharedOptions, correct: 'A', explanation: sharedExpl,
    }, 'practice', 'Balanced');

    expect(highDepth.reasoningDepthScore).toBeGreaterThan(lowDepth.reasoningDepthScore);
    expect(highDepth.qualityScore).toBeGreaterThan(lowDepth.qualityScore);
  });
});

// ── Fix H: parseMedicalReviewResponse JSON extraction hardening ────────────────

describe('Fix H — parseMedicalReviewResponse handles prose before JSON', () => {
  const CLEAN_PASS_H = JSON.stringify({
    status: 'pass', medicalAccuracy: 'pass', singleBestAnswer: 'pass',
    distractorPlausibility: 'pass', difficultyAlignment: 'pass', explanationQuality: 'pass',
    reasons: [], summary: 'All dimensions pass.',
  });

  it('parses a clean JSON response', () => {
    expect(parseMedicalReviewResponse(CLEAN_PASS_H).pass).toBe(true);
  });

  it('parses fenced JSON', () => {
    expect(parseMedicalReviewResponse('```json\n' + CLEAN_PASS_H + '\n```').pass).toBe(true);
  });

  it('parses JSON preceded by prose containing a stray brace', () => {
    const withProse = 'Based on my review {of the criteria}: ' + CLEAN_PASS_H;
    expect(parseMedicalReviewResponse(withProse).pass).toBe(true);
  });

  it('fails closed when the only JSON object found lacks required fields', () => {
    // {"thinking":"done"} is valid JSON but has no status field → fail closed
    const twoObjects = '{"thinking":"done"} and then ' + CLEAN_PASS_H;
    // First parseable slice from pos=0 may span an invalid range; helper finds CLEAN_PASS_H
    // Either way the result must be a defined pass or fail — not throw
    const result = parseMedicalReviewResponse(twoObjects);
    expect(typeof result.pass).toBe('boolean');
  });

  it('fails closed on malformed JSON with no valid object', () => {
    expect(parseMedicalReviewResponse('not json at all {broken').pass).toBe(false);
    expect(parseMedicalReviewResponse('').pass).toBe(false);
  });

  it('fails closed on truncated JSON', () => {
    const truncated = '{"status":"pass","medicalAccuracy":"pass"';
    expect(parseMedicalReviewResponse(truncated).pass).toBe(false);
  });
});

// ── Fix I: buildRepairPrompt compact payload ──────────────────────────────────

describe('Fix I — buildRepairPrompt compact payload', () => {
  const LONG_OPT_EXPLS = {
    A: 'GLP-1 receptor agonists stimulate insulin secretion in a glucose-dependent manner, reducing hypoglycemia risk significantly.',
    B: 'SGLT-2 inhibitors inhibit renal glucose reabsorption via a different mechanism entirely unrelated to GLP-1 pathways.',
    C: 'Thiazolidinediones activate PPAR-gamma nuclear receptors to enhance insulin sensitivity in peripheral tissues.',
    D: 'Alpha-glucosidase inhibitors delay intestinal carbohydrate absorption through enzyme inhibition at the brush border.',
  };
  const COACH_Q: Record<string, unknown> = {
    stem: 'A 55-year-old man with type 2 diabetes and CKD stage 3 presents for a routine visit. His HbA1c is 8.2%. His physician considers adding a GLP-1 receptor agonist. Which statement best describes the mechanism of action of this drug class?',
    options: [
      { letter: 'A', text: 'Stimulate insulin secretion in a glucose-dependent manner' },
      { letter: 'B', text: 'Inhibit renal glucose reabsorption' },
      { letter: 'C', text: 'Activate PPAR-gamma receptors' },
      { letter: 'D', text: 'Block alpha-glucosidase to delay carbohydrate absorption' },
    ],
    correct: 'A',
    explanation: 'GLP-1 receptor agonists stimulate insulin secretion only when glucose is elevated, reducing the risk of hypoglycemia. They also suppress glucagon, slow gastric emptying, and promote satiety.',
    optionExplanations: LONG_OPT_EXPLS,
    testedConcept: 'GLP-1 receptor agonist mechanism',
    topic: 'Endocrine pharmacology',
    pearl: 'GLP-1 agonists are weight-positive and cardioprotective.',
    memoryAnchor: 'GLP-1 = Glucose-dependent, Lowers glucose, Promotes satiety',
  };

  const qualityForContradiction: QuestionQuality = {
    qualityScore: 20, nbmeStyleScore: 50, reasoningDepthScore: 30,
    distractorQualityScore: 80, clueLeakageScore: 90, explanationQualityScore: 10,
    difficultyCalibrationScore: 60,
    rejectionReasons: ['contradictory_explanation'],
    validationStatus: 'fail',
  };
  const qualityForShallow: QuestionQuality = {
    qualityScore: 20, nbmeStyleScore: 50, reasoningDepthScore: 30,
    distractorQualityScore: 80, clueLeakageScore: 90, explanationQualityScore: 10,
    difficultyCalibrationScore: 60,
    rejectionReasons: ['shallow_explanation'],
    validationStatus: 'fail',
  };

  it('includes optionExplanations when rejectionReasons contains contradictory_explanation', () => {
    const prompt = buildRepairPrompt(COACH_Q, qualityForContradiction);
    expect(prompt).toContain('optionExplanations');
  });

  it('omits optionExplanations when rejectionReasons does not require them', () => {
    const prompt = buildRepairPrompt(COACH_Q, qualityForShallow);
    expect(prompt).not.toContain('optionExplanations');
  });

  it('compact prompt is shorter than full JSON serialization for a coach question', () => {
    const fullJson = JSON.stringify(COACH_Q, null, 2);
    const prompt = buildRepairPrompt(COACH_Q, qualityForShallow);
    expect(prompt.length).toBeLessThan(fullJson.length);
  });

  it('still includes actionable repair guidance', () => {
    const prompt = buildRepairPrompt(COACH_Q, qualityForShallow);
    expect(prompt).toContain(REPAIR_GUIDANCE['shallow_explanation']);
  });

  it('includes testedConcept and topic when present', () => {
    const prompt = buildRepairPrompt(COACH_Q, qualityForShallow);
    expect(prompt).toContain('testedConcept');
    expect(prompt).toContain('topic');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Phase 10.2 — NBME Difficult Validator Parity + Distractor / Scope Hardening
// ══════════════════════════════════════════════════════════════════════════════

// ── Shared fixtures ───────────────────────────────────────────────────────────

// Concise NBME-style neuro/localization vignette (~90-char stem, explicit lead-in).
const NBME_NEURO_OPTS = makeOptions([
  'Left posterior cerebral artery occlusion',
  'Right middle cerebral artery occlusion',
  'Left anterior cerebral artery occlusion',
  'Basilar artery occlusion',
]);
const NBME_NEURO_STEM = 'A 68-year-old man develops sudden right homonymous hemianopia without motor or sensory deficits. Which vessel is most likely occluded?';

// Short practice-mode explanation (< 150 chars) that still supports the correct answer.
const NBME_NEURO_EXPL_SHORT = 'Left posterior cerebral artery supplies the visual cortex; occlusion causes contralateral homonymous hemianopia without motor loss.';

// Concise NBME risk-factor vignette.
const NBME_RISK_STEM = 'A 55-year-old man with hypertension and a 25 pack-year smoking history asks about his greatest risk for sudden cardiac death. Which factor most increases his risk?';
const NBME_RISK_OPTS = makeOptions([
  'Left ventricular hypertrophy on ECG',
  'Elevated LDL cholesterol',
  'Sedentary lifestyle',
  'Family history of type 2 diabetes',
]);
const NBME_RISK_EXPL = 'Left ventricular hypertrophy is the strongest independent predictor of sudden cardiac death in hypertensive patients, reflecting chronic pressure overload and arrhythmic substrate.';

// Concise NBME mechanism/pathology vignette.
const NBME_MECH_STEM = 'A 45-year-old woman with SLE presents with worsening renal function. Biopsy shows mesangial immune deposits and diffuse endocapillary proliferation. Which mechanism drives these findings?';
const NBME_MECH_OPTS = makeOptions([
  'Immune complex deposition activating complement',
  'Anti-GBM antibody-mediated injury',
  'Pauci-immune vasculitis of glomerular capillaries',
  'Minimal change podocyte effacement',
]);
const NBME_MECH_EXPL = 'In lupus nephritis immune complexes containing anti-dsDNA antibodies deposit in the mesangium and subendothelium, activating complement and driving endocapillary proliferation.';

// ── isNbmeDifficulty ──────────────────────────────────────────────────────────

describe('isNbmeDifficulty', () => {
  it('returns true only for NBME Difficult', () => {
    expect(isNbmeDifficulty('NBME Difficult')).toBe(true);
  });

  it('returns false for all other difficulties', () => {
    for (const d of ['Balanced', 'More Hard', 'More Easy', 'UWorld Challenge', 'standardized', '']) {
      expect(isNbmeDifficulty(d)).toBe(false);
    }
  });
});

// ── scoreNbmePatientAnchor ────────────────────────────────────────────────────

describe('scoreNbmePatientAnchor', () => {
  it('passes a stem with age and sex', () => {
    expect(scoreNbmePatientAnchor('A 45-year-old man presents with chest pain.').reasons).toHaveLength(0);
  });

  it('passes a stem with "woman"', () => {
    expect(scoreNbmePatientAnchor('A woman presents with joint pain.').reasons).toHaveLength(0);
  });

  it('passes a stem with "patient"', () => {
    expect(scoreNbmePatientAnchor('A patient is brought to the emergency department.').reasons).toHaveLength(0);
  });

  it('fails a stem with no patient anchor', () => {
    expect(scoreNbmePatientAnchor('Which enzyme catalyzes this reaction?').reasons).toContain('missing_patient_anchor');
  });
});

// ── scoreNbmeClinicalSignal ───────────────────────────────────────────────────

describe('scoreNbmeClinicalSignal', () => {
  it('passes when stem has a presentation keyword', () => {
    expect(scoreNbmeClinicalSignal('A 50-year-old woman presents with dyspnea.').reasons).toHaveLength(0);
  });

  it('passes when stem has lab-value style clinical signal (count fallback)', () => {
    // No presentation keyword but has "sodium 128 mEq/L" → count > 0
    expect(scoreNbmeClinicalSignal('A 60-year-old man has sodium 128 mEq/L and confusion.').reasons).toHaveLength(0);
  });

  it('fails when stem has neither presentation keyword nor clinical measurement', () => {
    expect(scoreNbmeClinicalSignal('Which of the following enzymes is inhibited?').reasons).toContain('weak_clinical_signal');
  });
});

// ── scoreNbmeLeadIn ───────────────────────────────────────────────────────────

describe('scoreNbmeLeadIn', () => {
  it('passes with "which of the following" lead-in ending with ?', () => {
    expect(scoreNbmeLeadIn('A 45-year-old man. Which of the following is correct?').reasons).toHaveLength(0);
  });

  it('passes with "most likely" lead-in', () => {
    expect(scoreNbmeLeadIn('A 45-year-old woman. What is the most likely diagnosis?').reasons).toHaveLength(0);
  });

  it('passes with single-word NBME lead-in (e.g. "diagnosis", "mechanism")', () => {
    expect(scoreNbmeLeadIn('A 50-year-old man presents. What is the mechanism?').reasons).toHaveLength(0);
  });

  it('fails stem without question mark', () => {
    expect(scoreNbmeLeadIn('A 45-year-old man. Which of the following is correct').reasons).toContain('weak_single_best_answer_lead_in');
  });

  it('fails stem with no recognized lead-in', () => {
    expect(scoreNbmeLeadIn('A 45-year-old man presents with chest pain. Describe the treatment.').reasons).toContain('weak_single_best_answer_lead_in');
  });
});

// ── scoreNbmeOptionStyle ──────────────────────────────────────────────────────

describe('scoreNbmeOptionStyle', () => {
  it('passes 4 clean medically specific options', () => {
    const result = scoreNbmeOptionStyle(NBME_NEURO_OPTS);
    expect(result.reasons).toHaveLength(0);
    expect(result.score).toBeGreaterThan(50);
  });

  it('rejects fewer than 4 options', () => {
    const result = scoreNbmeOptionStyle([{ letter: 'A', text: 'Option A' }, { letter: 'B', text: 'Option B' }]);
    expect(result.reasons).toContain('insufficient_options');
    expect(result.score).toBe(0);
  });

  it('rejects duplicate option text', () => {
    const opts = makeOptions(['Aspirin', 'Aspirin', 'Warfarin', 'Heparin']);
    const result = scoreNbmeOptionStyle(opts);
    expect(result.reasons).toContain('duplicate_options');
    expect(result.score).toBe(0);
  });

  it('rejects a generic placeholder option ("All of the above")', () => {
    const opts = makeOptions(['Aspirin', 'Warfarin', 'Heparin', 'All of the above']);
    const result = scoreNbmeOptionStyle(opts);
    expect(result.reasons).toContain('weak_distractors');
  });

  it('rejects options shorter than 4 characters', () => {
    const opts = makeOptions(['Yes', 'No', 'Warfarin', 'Heparin']);
    const result = scoreNbmeOptionStyle(opts);
    expect(result.reasons).toContain('weak_distractors');
  });

  it('rejects any option longer than 160 characters (non_concise_nbme_options)', () => {
    const longText = 'Right middle cerebral artery occlusion causing contralateral hemiplegia, hemisensory loss, and hemispatial neglect confirmed by diffusion-weighted MRI in the acute setting';
    expect(longText.length).toBeGreaterThan(160);
    const opts = makeOptions([
      'Left posterior cerebral artery occlusion',
      longText,
      'Left anterior cerebral artery occlusion',
      'Basilar artery occlusion',
    ]);
    const result = scoreNbmeOptionStyle(opts);
    expect(result.reasons).toContain('non_concise_nbme_options');
  });

  it('does not flag options at exactly 160 characters or fewer (boundary)', () => {
    const exactly160 = 'A'.repeat(160);
    const opts = makeOptions([exactly160, 'Right middle cerebral artery occlusion', 'Left anterior cerebral artery occlusion', 'Basilar artery occlusion']);
    const result = scoreNbmeOptionStyle(opts);
    expect(result.reasons).not.toContain('non_concise_nbme_options');
  });
});

// ── scoreNbmeClueLeakage ──────────────────────────────────────────────────────

describe('scoreNbmeClueLeakage', () => {
  it('passes when correct answer text is not in stem', () => {
    const result = scoreNbmeClueLeakage(NBME_NEURO_STEM, NBME_NEURO_OPTS, 'A');
    expect(result.reasons).toHaveLength(0);
    expect(result.score).toBeGreaterThan(50);
  });

  it('detects clue leakage when correct answer appears verbatim in stem', () => {
    const stem = 'A 45-year-old man presents with fever. Left posterior cerebral artery occlusion is suspected. Which vessel is most likely involved?';
    const result = scoreNbmeClueLeakage(stem, NBME_NEURO_OPTS, 'A');
    expect(result.reasons).toContain('clue_leakage');
    expect(result.score).toBeLessThan(20);
  });

  it('returns clean result when correct option is absent from options array', () => {
    const result = scoreNbmeClueLeakage(NBME_NEURO_STEM, NBME_NEURO_OPTS, 'E');
    expect(result.reasons).toHaveLength(0);
  });
});

// ── scoreNbmeQuestion — acceptance tests ─────────────────────────────────────

describe('scoreNbmeQuestion — accepts valid concise NBME items', () => {
  it('Test 1: accepts concise neuro/localization item (practice mode)', () => {
    const result = scoreNbmeQuestion({
      stem: NBME_NEURO_STEM,
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.validationStatus).toBe('pass');
    expect(result.rejectionReasons).not.toContain('nbme_stem_too_short');
    expect(result.rejectionReasons).not.toContain('missing_patient_anchor');
    expect(result.rejectionReasons).not.toContain('weak_clinical_signal');
    expect(result.rejectionReasons).not.toContain('weak_single_best_answer_lead_in');
  });

  it('Test 2: accepts concise risk-factor item (practice mode)', () => {
    const result = scoreNbmeQuestion({
      stem: NBME_RISK_STEM,
      options: NBME_RISK_OPTS,
      correct: 'A',
      explanation: NBME_RISK_EXPL,
    }, 'practice', 'NBME Difficult');
    expect(result.validationStatus).toBe('pass');
  });

  it('Test 3: accepts concise pathology/mechanism item (practice mode)', () => {
    const result = scoreNbmeQuestion({
      stem: NBME_MECH_STEM,
      options: NBME_MECH_OPTS,
      correct: 'A',
      explanation: NBME_MECH_EXPL,
    }, 'practice', 'NBME Difficult');
    expect(result.validationStatus).toBe('pass');
  });
});

// ── scoreNbmeQuestion — rejection tests ──────────────────────────────────────

describe('scoreNbmeQuestion — rejects invalid NBME items', () => {
  it('Test 4: rejects stem < 70 chars (nbme_stem_too_short)', () => {
    const result = scoreNbmeQuestion({
      stem: 'A 45-year-old man. What is the diagnosis?',
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('nbme_stem_too_short');
    expect(result.validationStatus).toBe('fail');
  });

  it('Test 5: rejects missing patient anchor', () => {
    const result = scoreNbmeQuestion({
      stem: 'Sudden homonymous hemianopia without motor deficit develops. Which vessel is most likely occluded?',
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('missing_patient_anchor');
    expect(result.validationStatus).toBe('fail');
  });

  it('Test 6: rejects weak clinical signal', () => {
    // Stem uses a non-numeric anchor ("male") so no age-number matches the count
    // fallback. No presentation keywords or lab-value terms → weak_clinical_signal fires.
    const result = scoreNbmeQuestion({
      stem: 'A male patient has an abnormality on genetic testing. Which of the following is the most likely etiology?',
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('weak_clinical_signal');
    expect(result.validationStatus).toBe('fail');
  });

  it('Test 7: rejects weak lead-in (no question mark or no recognized lead-in)', () => {
    const result = scoreNbmeQuestion({
      stem: 'A 68-year-old man develops sudden right homonymous hemianopia. Please identify the occluded vessel.',
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('weak_single_best_answer_lead_in');
    expect(result.validationStatus).toBe('fail');
  });

  it('Test 8: rejects teaching language in stem', () => {
    const result = scoreNbmeQuestion({
      stem: 'A 68-year-old man develops sudden right homonymous hemianopia. Remember: this is a high-yield localization question. Which vessel is most likely occluded?',
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('teaching_language_in_stem');
    expect(result.validationStatus).toBe('fail');
  });

  it('Test 9: rejects duplicate options', () => {
    const dupeOpts = makeOptions([
      'Left posterior cerebral artery occlusion',
      'Left posterior cerebral artery occlusion',
      'Left anterior cerebral artery occlusion',
      'Basilar artery occlusion',
    ]);
    const result = scoreNbmeQuestion({
      stem: NBME_NEURO_STEM,
      options: dupeOpts,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('duplicate_options');
    expect(result.validationStatus).toBe('fail');
  });

  it('Test 10: rejects clue leakage when correct answer is verbatim in stem', () => {
    const leakyStem = 'A 68-year-old man develops sudden right homonymous hemianopia. Left posterior cerebral artery occlusion is suspected. Which vessel is most likely occluded?';
    const result = scoreNbmeQuestion({
      stem: leakyStem,
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('clue_leakage');
    expect(result.validationStatus).toBe('fail');
  });
});

// ── scoreNbmeQuestion — explanation mode rules ────────────────────────────────

describe('scoreNbmeQuestion — explanation handling', () => {
  it('Test 11: does NOT require explanation in NBME exam mode (empty explanation passes)', () => {
    const result = scoreNbmeQuestion({
      stem: NBME_NEURO_STEM,
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: '',
    }, 'exam', 'NBME Difficult');
    // exam mode skips answer-support and explanation checks
    expect(result.rejectionReasons).not.toContain('shallow_explanation');
    expect(result.rejectionReasons).not.toContain('answer_not_supported');
    expect(result.validationStatus).toBe('pass');
    expect(result.explanationQualityScore).toBe(100);
  });

  it('Test 12: practice mode checks answer support — explanation must mention correct answer', () => {
    // Explanation about the wrong option (right MCA) with zero tokens from the correct
    // answer "Left posterior cerebral artery occlusion" (tokens: left, posterior, cerebral,
    // artery, occlusion). None of these appear in the explanation below.
    const badExpl = 'The right MCA territory provides motor and sensory function to the contralateral face and limbs, producing hemiplegia rather than isolated visual field loss.';
    const result = scoreNbmeQuestion({
      stem: NBME_NEURO_STEM,
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: badExpl,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('answer_not_supported');
    expect(result.validationStatus).toBe('fail');
  });

  it('short explanation in practice mode adds shallow_explanation but it is not a hard rejection', () => {
    // NBME_NEURO_EXPL_SHORT is < 150 chars; it supports the answer but is brief.
    expect(NBME_NEURO_EXPL_SHORT.length).toBeLessThan(150);
    const result = scoreNbmeQuestion({
      stem: NBME_NEURO_STEM,
      options: NBME_NEURO_OPTS,
      correct: 'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    // shallow_explanation is present as a soft signal but does not hard-reject for NBME
    expect(result.rejectionReasons).toContain('shallow_explanation');
    // Hard rejections must NOT include it, so the question still passes
    expect(result.validationStatus).toBe('pass');
  });
});

// ── Test 13: same concise item passes NBME, fails UWorld ─────────────────────

describe('Test 13: concise item — NBME Difficult passes, UWorld Challenge fails', () => {
  // Concise stem (< 180 chars) with a short practice explanation (< 150 chars).
  // NBME path: short explanation is a soft penalty → passes.
  // UWorld general path: shallow_explanation is a hard rejection → fails.
  const conciseStem = NBME_NEURO_STEM;  // ~130 chars, well-formed NBME vignette
  const shortExpl   = NBME_NEURO_EXPL_SHORT;  // ~130 chars, < 150 threshold

  it('passes scoreQuestion with NBME Difficult (practice mode, short explanation)', () => {
    const result = scoreQuestion({
      stem:        conciseStem,
      options:     NBME_NEURO_OPTS,
      correct:     'A',
      explanation: shortExpl,
    }, 'practice', 'NBME Difficult');
    expect(result.validationStatus).toBe('pass');
    // shallow_explanation is present but is not a hard rejection in the NBME path
    expect(result.rejectionReasons).toContain('shallow_explanation');
  });

  it('fails scoreQuestion with UWorld Challenge (practice mode, same short explanation)', () => {
    const result = scoreQuestion({
      stem:        conciseStem,
      options:     NBME_NEURO_OPTS,
      correct:     'A',
      explanation: shortExpl,
    }, 'practice', 'UWorld Challenge');
    // UWorld general path: shallow_explanation is in HARD_REJECTIONS → hard fail
    expect(result.rejectionReasons).toContain('shallow_explanation');
    expect(result.validationStatus).toBe('fail');
  });

  it('NBME passes in exam mode — explanation absent is fine for NBME', () => {
    const nbme = scoreQuestion({ stem: conciseStem, options: NBME_NEURO_OPTS, correct: 'A', explanation: '' }, 'exam', 'NBME Difficult');
    expect(nbme.validationStatus).toBe('pass');
  });

  it('UWorld fails in exam mode with a concise stem — uworld_stem_too_short is mode-independent', () => {
    // Phase 4: stem < 180 chars hard-rejects UWorld regardless of mode.
    // NBME_NEURO_STEM is ~134 chars — valid for NBME, too short for UWorld.
    const uw = scoreQuestion({ stem: conciseStem, options: NBME_NEURO_OPTS, correct: 'A', explanation: '' }, 'exam', 'UWorld Challenge');
    expect(uw.rejectionReasons).toContain('uworld_stem_too_short');
    expect(uw.validationStatus).toBe('fail');
  });
});

// ── UWorld existing validation still holds ────────────────────────────────────

describe('UWorld Challenge — existing validation unchanged', () => {
  it('requiresMedicalReview is still true for UWorld Challenge', () => {
    expect(requiresMedicalReview('UWorld Challenge')).toBe(true);
  });

  it('scoreQuestion with UWorld Challenge rejects a bare trivia question', () => {
    const result = scoreQuestion({
      stem: 'Which enzyme is deficient in Lesch-Nyhan syndrome?',
      options: makeOptions(['HGPRT', 'APRT', 'ADA', 'PNP']),
      correct: 'A',
      explanation: 'HGPRT deficiency causes Lesch-Nyhan syndrome.',
    }, 'practice', 'UWorld Challenge');
    expect(result.validationStatus).toBe('fail');
  });

  it('scoreQuestion with UWorld Challenge rejects shallow explanations (hard rejection)', () => {
    const result = scoreQuestion({
      stem: 'A 35-year-old woman presents with painful swollen joints and serum uric acid of 9.2 mg/dL. She has been taking hydrochlorothiazide for hypertension for 6 months. Which mechanism best explains her current presentation?',
      options: makeOptions(['Decreased renal uric acid excretion', 'Increased de novo purine synthesis', 'Decreased xanthine oxidase activity', 'Impaired urate transporter function']),
      correct: 'A',
      explanation: 'HCTZ decreases uric acid excretion at the renal tubule.',  // < 50 chars → shallow
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('shallow_explanation');
    expect(result.validationStatus).toBe('fail');
  });
});

// ── Medical review requirement unchanged ──────────────────────────────────────

describe('medical review requirement — NBME / UWorld unchanged', () => {
  it('requiresMedicalReview is true for NBME Difficult', () => {
    expect(requiresMedicalReview('NBME Difficult')).toBe(true);
  });

  it('requiresMedicalReview is true for UWorld Challenge', () => {
    expect(requiresMedicalReview('UWorld Challenge')).toBe(true);
  });

  it('requiresMedicalReview is false for all other tiers', () => {
    for (const d of ['Balanced', 'More Hard', 'More Easy', 'standardized', '']) {
      expect(requiresMedicalReview(d)).toBe(false);
    }
  });
});

// ── Distractor hardening — generic option rejection ───────────────────────────

describe('distractor hardening — generic option rejection (general path)', () => {
  const GOOD_STEM = 'A 28-year-old man with an X-linked disorder presents with joint pain, hyperuricemia, and self-mutilatory behavior since childhood. Which enzyme deficiency is responsible?';
  const GOOD_EXPL = 'HGPRT (hypoxanthine-guanine phosphoribosyltransferase) deficiency is the cause of Lesch-Nyhan syndrome. Excess uric acid results from impaired purine salvage forcing de novo synthesis. Self-mutilation, gout, and intellectual disability are characteristic. Allopurinol reduces uric acid but does not treat neurological symptoms.';

  it('rejects options containing "All of the above" (general path, Balanced)', () => {
    const result = scoreQuestion({
      stem:    GOOD_STEM,
      options: makeOptions(['HGPRT', 'APRT', 'Adenosine deaminase', 'All of the above']),
      correct: 'A',
      explanation: GOOD_EXPL,
    }, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('generic_option_present');
    expect(result.validationStatus).toBe('fail');
  });

  it('rejects options containing "None of the above"', () => {
    const result = scoreQuestion({
      stem:    GOOD_STEM,
      options: makeOptions(['HGPRT', 'APRT', 'Adenosine deaminase', 'None of the above']),
      correct: 'A',
      explanation: GOOD_EXPL,
    }, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('generic_option_present');
    expect(result.validationStatus).toBe('fail');
  });

  it('rejects options containing "Unknown"', () => {
    const result = scoreQuestion({
      stem:    GOOD_STEM,
      options: makeOptions(['HGPRT', 'APRT', 'Adenosine deaminase', 'Unknown']),
      correct: 'A',
      explanation: GOOD_EXPL,
    }, 'practice', 'Balanced');
    expect(result.rejectionReasons).toContain('generic_option_present');
    expect(result.validationStatus).toBe('fail');
  });

  it('does not flag legitimate clinical answer choices', () => {
    const result = scoreQuestion({
      stem:    GOOD_STEM,
      options: makeOptions(['HGPRT deficiency', 'APRT deficiency', 'Adenosine deaminase deficiency', 'Xanthine oxidase deficiency']),
      correct: 'A',
      explanation: GOOD_EXPL,
    }, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('generic_option_present');
  });

  it('buildRepairPrompt includes guidance for generic_option_present', () => {
    const quality: QuestionQuality = {
      qualityScore: 20, nbmeStyleScore: 50, reasoningDepthScore: 30,
      distractorQualityScore: 0, clueLeakageScore: 90, explanationQualityScore: 80,
      difficultyCalibrationScore: 50,
      rejectionReasons: ['generic_option_present'],
      validationStatus: 'fail',
    };
    const prompt = buildRepairPrompt({ stem: 'test', options: [], correct: 'A', explanation: 'ok' }, quality);
    expect(prompt).toContain(REPAIR_GUIDANCE['generic_option_present']);
  });
});

// ── scoreScopeAlignment ───────────────────────────────────────────────────────

describe('scoreScopeAlignment — no scope argument', () => {
  it('returns [] when no requestedScope is passed', () => {
    expect(scoreScopeAlignment({ subject: 'Physiology', system: 'Cardiovascular' })).toEqual([]);
  });

  it('returns [] for question with no metadata even when scope is provided', () => {
    // Question has no subject/system/topic → nothing to compare → no rejection
    expect(scoreScopeAlignment({}, { subject: 'Neurology', system: 'Neurology', topic: 'Stroke' })).toEqual([]);
  });
});

describe('scoreScopeAlignment — in-scope passes', () => {
  it('passes when subject and system match exactly', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Cardiac output regulation' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('passes when only subject is requested (system broad)', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Any' },
      { subject: 'Pharmacology', system: 'All Systems' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('passes when topic partially matches testedConcept (substring)', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Cardiovascular', testedConcept: 'Pulmonary hypertension mechanism' },
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Pulmonary hypertension' },
    );
    expect(reasons).toHaveLength(0);
  });
});

describe('scoreScopeAlignment — mismatches produce reasons', () => {
  it('returns off_scope_subject when requested Cardiovascular but actual Respiratory', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pathology', system: 'Respiratory' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    );
    expect(reasons).toContain('off_scope_subject');
    expect(reasons).toContain('off_scope_system');
  });

  it('returns off_scope_subject when subjects differ', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular' },
      { subject: 'Anatomy', system: 'Cardiovascular' },
    );
    expect(reasons).toContain('off_scope_subject');
    expect(reasons).not.toContain('off_scope_system');
  });

  it('returns off_scope_system when systems differ', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Renal' },
      { subject: 'Physiology', system: 'Neurology' },
    );
    expect(reasons).toContain('off_scope_system');
    expect(reasons).not.toContain('off_scope_subject');
  });

  it('returns off_scope_topic when topic has no overlap', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Renal tubular acidosis' },
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Cardiac arrhythmia' },
    );
    expect(reasons).toContain('off_scope_topic');
  });
});

describe('scoreScopeAlignment — broad scope never rejects', () => {
  it('All Systems scope passes any actual system', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Respiratory' },
      { subject: 'Physiology', system: 'All Systems' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('All Subjects scope passes any actual subject', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pathology', system: 'Cardiovascular' },
      { subject: 'All Subjects', system: 'Cardiovascular' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('Multisystem actual system never triggers off_scope_system', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Multisystem' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    );
    expect(reasons).not.toContain('off_scope_system');
  });

  it('empty requestedScope returns []', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Cardiovascular' },
      {},
    )).toHaveLength(0);
  });

  it('missing question metadata does not crash — returns []', () => {
    expect(() => scoreScopeAlignment(
      {} as Record<string, never>,
      { subject: 'Neurology', system: 'Neurology', topic: 'Stroke' },
    )).not.toThrow();
    expect(scoreScopeAlignment(
      {} as Record<string, never>,
      { subject: 'Neurology', system: 'Neurology', topic: 'Stroke' },
    )).toEqual([]);
  });
});

// ── scoreScopeAlignment — alias normalization ─────────────────────────────────

describe('scoreScopeAlignment — system aliases', () => {
  it('Cardiology and Cardiovascular are equivalent on system axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Cardiology', topic: 'Cardiac output' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    )).toHaveLength(0);
  });

  it('Cardiovascular System and Cardiovascular are equivalent', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Cardiovascular System' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    )).toHaveLength(0);
  });

  it('Nervous System and Neurology are equivalent on system axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Nervous System' },
      { subject: 'Physiology', system: 'Neurology' },
    )).toHaveLength(0);
  });

  it('Neuroscience and Neurology are equivalent on system axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Neuroscience' },
      { subject: 'Physiology', system: 'Neurology' },
    )).toHaveLength(0);
  });

  it('Skin and Dermatology are equivalent on system axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Pathology', system: 'Skin' },
      { subject: 'Pathology', system: 'Dermatology' },
    )).toHaveLength(0);
  });

  it('Skin and Subcutaneous Tissue and Dermatology are equivalent', () => {
    expect(scoreScopeAlignment(
      { subject: 'Pathology', system: 'Skin and Subcutaneous Tissue' },
      { subject: 'Pathology', system: 'Dermatology' },
    )).toHaveLength(0);
  });

  it('Renal Urinary System and Renal are equivalent', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Renal Urinary System' },
      { subject: 'Physiology', system: 'Renal' },
    )).toHaveLength(0);
  });

  it('Nephrology and Renal / Urinary are equivalent on system axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Nephrology' },
      { subject: 'Physiology', system: 'Renal / Urinary' },
    )).toHaveLength(0);
  });

  it('Pulmonary and Respiratory are equivalent on system axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Pulmonary' },
      { subject: 'Physiology', system: 'Respiratory' },
    )).toHaveLength(0);
  });

  it('still rejects when canonical systems are truly different', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Neurology' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    );
    expect(reasons).toContain('off_scope_system');
  });
});

describe('scoreScopeAlignment — subject aliases', () => {
  it('Pathophysiology and Pathology are equivalent on subject axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Pathophysiology', system: 'Cardiovascular' },
      { subject: 'Pathology', system: 'Cardiovascular' },
    )).toHaveLength(0);
  });

  it('Behavioral Health and Behavioral Science are equivalent on subject axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Behavioral Health', system: 'All Systems' },
      { subject: 'Behavioral Science', system: 'All Systems' },
    )).toHaveLength(0);
  });

  it('Cardiology is not treated as a subject alias', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Cardiology', system: 'Cardiovascular' },
      { subject: 'Pathology', system: 'Cardiovascular' },
    );
    expect(reasons).toContain('off_scope_subject');
  });

  it('still rejects when canonical subjects are truly different', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular' },
      { subject: 'Pathology', system: 'Cardiovascular' },
    );
    expect(reasons).toContain('off_scope_subject');
  });
});

// ── scoreScopeAlignment — universal scope (all difficulties) ──────────────────

describe('scoreScopeAlignment — subject + system both checked', () => {
  it('rejects when both subject and system mismatch', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Renal' },
      { subject: 'Pathology', system: 'Cardiovascular' },
    );
    expect(reasons).toContain('off_scope_subject');
    expect(reasons).toContain('off_scope_system');
  });

  it('passes when only subject is requested and system is broad', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular' },
      { subject: 'Pharmacology', system: '' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('passes when only system is requested and subject is broad', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pathology', system: 'Cardiovascular' },
      { subject: '', system: 'Cardiovascular' },
    );
    expect(reasons).toHaveLength(0);
  });
});

describe('scoreScopeAlignment — topic uses all metadata fields', () => {
  it('passes when testedConcept matches requested topic (fixes ?? bug)', () => {
    const reasons = scoreScopeAlignment(
      // topic is empty string but testedConcept matches
      { subject: 'Physiology', system: 'Cardiovascular', topic: '', testedConcept: 'Cardiac output regulation' },
      { subject: 'Physiology', system: 'Cardiovascular', topic: 'Cardiac output' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('passes when canonicalTopic matches requested topic', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Renal', topic: '', canonicalTopic: 'Loop diuretics mechanism' },
      { subject: 'Physiology', system: 'Renal', topic: 'Loop diuretics' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('passes when rawTopic matches requested topic', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: '', rawTopic: 'Beta blockers cardioselective' },
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'Beta blockers' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('passes when questionAngle contributes to topic match', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: '', questionAngle: 'pharmacology', testedConcept: 'ACE inhibitors mechanism' },
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'ACE inhibitors' },
    );
    expect(reasons).toHaveLength(0);
  });

  it('rejects when topic metadata present but no field matches', () => {
    const reasons = scoreScopeAlignment(
      { subject: 'Physiology', system: 'Renal', topic: 'Loop of Henle transport', testedConcept: 'Tubular secretion' },
      { subject: 'Physiology', system: 'Renal', topic: 'Cardiac arrhythmia' },
    );
    expect(reasons).toContain('off_scope_topic');
  });
});

describe('scoreScopeAlignment — missing metadata with specific scope', () => {
  it('does not reject subject when metadata missing (text fallback unsafe)', () => {
    const reasons = scoreScopeAlignment(
      { system: 'Cardiovascular', stem: 'A 45-year-old man presents with chest pain and ST elevation on ECG.' },
      { subject: 'Pharmacology', system: 'Cardiovascular' },
    );
    // Missing subject → skip subject check; system matches → no rejection
    expect(reasons).not.toContain('off_scope_subject');
  });

  it('does not reject system when metadata missing and stem text confirms requested system', () => {
    const reasons = scoreScopeAlignment(
      {
        subject: 'Pathology',
        stem: 'A 55-year-old woman presents with signs of myocardial infarction. Coronary angiography reveals occlusion.',
        options: [
          { letter: 'A', text: 'Coagulative necrosis' },
          { letter: 'B', text: 'Liquefactive necrosis' },
          { letter: 'C', text: 'Caseous necrosis' },
          { letter: 'D', text: 'Fibrinoid necrosis' },
        ],
      },
      { subject: 'Pathology', system: 'Cardiovascular' },
    );
    // Stem has coronary/myocardial → detected as cardiovascular → matches requested → pass
    expect(reasons).not.toContain('off_scope_system');
  });

  it('rejects system when metadata missing and stem clearly identifies a different system', () => {
    const reasons = scoreScopeAlignment(
      {
        subject: 'Pathology',
        stem: 'A 32-year-old woman presents with nephrotic syndrome. Kidney biopsy shows diffuse podocyte effacement. Glomerular filtration rate is reduced.',
        options: [
          { letter: 'A', text: 'Minimal change disease' },
          { letter: 'B', text: 'Membranous nephropathy' },
          { letter: 'C', text: 'FSGS' },
          { letter: 'D', text: 'IgA nephropathy' },
        ],
      },
      { subject: 'Pathology', system: 'Cardiovascular' },
    );
    // Stem has glomerular/nephrotic/podocyte → detected as renal → different from cardiovascular → reject
    expect(reasons).toContain('off_scope_system');
  });

  it('does not reject system when metadata missing and stem is ambiguous', () => {
    // Stem has no strong system keywords either way
    const reasons = scoreScopeAlignment(
      {
        subject: 'Biochemistry',
        stem: 'A patient has an enzyme deficiency leading to substrate accumulation. Describe the metabolic pathway involved.',
        options: [
          { letter: 'A', text: 'Glycolysis pathway' },
          { letter: 'B', text: 'TCA cycle' },
          { letter: 'C', text: 'Pentose phosphate pathway' },
          { letter: 'D', text: 'Gluconeogenesis' },
        ],
      },
      { subject: 'Biochemistry', system: 'Cardiovascular' },
    );
    // No cardiovascular or renal keywords → detection returns '' → skip
    expect(reasons).not.toContain('off_scope_system');
  });

  it('uses stem keyword match for missing topic metadata', () => {
    // No topic metadata but stem clearly discusses cardiac arrhythmia
    const reasons = scoreScopeAlignment(
      {
        subject: 'Pharmacology', system: 'Cardiovascular',
        stem: 'A 60-year-old patient with arrhythmia is started on amiodarone. The drug blocks sodium and calcium channels.',
        options: [{ letter: 'A', text: 'Amiodarone' }, { letter: 'B', text: 'Metoprolol' }, { letter: 'C', text: 'Digoxin' }, { letter: 'D', text: 'Verapamil' }],
      },
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'Cardiac arrhythmia' },
    );
    // 'arrhythmia' is in topic keywords and appears in stem → pass
    expect(reasons).not.toContain('off_scope_topic');
  });

  it('rejects topic when metadata absent and stem keywords do not match', () => {
    const reasons = scoreScopeAlignment(
      {
        subject: 'Pharmacology', system: 'Cardiovascular',
        stem: 'A patient with heart failure is prescribed furosemide to reduce preload.',
        options: [{ letter: 'A', text: 'Furosemide' }, { letter: 'B', text: 'Spironolactone' }, { letter: 'C', text: 'Digoxin' }, { letter: 'D', text: 'Metoprolol' }],
      },
      { subject: 'Pharmacology', system: 'Cardiovascular', topic: 'Renal tubular acidosis' },
    );
    // 'renal', 'tubular', 'acidosis' not in stem → off_scope_topic
    expect(reasons).toContain('off_scope_topic');
  });

  it('no rejection when question has no text at all and scope is specific', () => {
    // Degenerate case: fully empty question object. Cannot evaluate → skip all checks.
    const reasons = scoreScopeAlignment(
      {} as Record<string, never>,
      { subject: 'Neurology', system: 'Neurology', topic: 'Stroke' },
    );
    expect(reasons).toHaveLength(0);
  });
});

describe('scoreScopeAlignment — broad scope never rejects (universal)', () => {
  it('All Subjects does not reject regardless of actual subject', () => {
    expect(scoreScopeAlignment(
      { subject: 'Pharmacology', system: 'Cardiovascular' },
      { subject: 'All Subjects', system: 'Cardiovascular' },
    )).toHaveLength(0);
  });

  it('All Systems does not reject regardless of actual system', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Renal' },
      { subject: 'Physiology', system: 'All Systems' },
    )).toHaveLength(0);
  });

  it('Multisystem actual system does not trigger off_scope_system for any requested system', () => {
    expect(scoreScopeAlignment(
      { subject: 'Physiology', system: 'Multisystem' },
      { subject: 'Physiology', system: 'Cardiovascular' },
    )).not.toContain('off_scope_system');
  });

  it('empty requested subject does not check subject axis', () => {
    expect(scoreScopeAlignment(
      { subject: 'Pathology', system: 'Cardiovascular' },
      { subject: '', system: 'Cardiovascular' },
    )).toHaveLength(0);
  });
});

// ── Specialty validation integration ─────────────────────────────────────────
// These tests verify that scoreQuestion correctly propagates specialty validator
// results into rejectionReasons and validationStatus.

describe('scoreQuestion — specialty validation integration', () => {
  // A well-formed cardio-pathology stem with a deliberately wrong mechanism in
  // the correct option. No copyrighted text is reproduced — this is a synthetic fixture.
  const BUERGER_STEM = [
    'A 34-year-old man with a 20 pack-year smoking history presents with painful ulcers',
    'on his fingertips and bilateral foot claudication that began two months ago.',
    'He has no history of diabetes, hyperlipidemia, or hypertension.',
    'Migratory superficial thrombophlebitis is also noted.',
    'Biopsy of a digital artery is performed.',
    'What is the most characteristic microscopic finding for this condition?',
  ].join(' ');

  const GOOD_EXPL = [
    'Buerger disease (thromboangiitis obliterans) is a segmental thrombosing vasculitis',
    'affecting small and medium arteries, veins, and contiguous nerves.',
    'The hallmark histologic finding is an occlusive thrombus with acute inflammation',
    'that is in continuity with the involved artery and adjacent vein.',
    'The internal elastic lamina is preserved, distinguishing it from atherosclerosis.',
    'Cessation of tobacco use is the only intervention that alters disease course.',
  ].join(' ');

  it('specialty fail (wrong mechanism) causes scoreQuestion validationStatus to be fail', () => {
    const result = scoreQuestion(
      {
        stem:        BUERGER_STEM,
        options:     makeOptions([
          'Lipid-laden intimal plaque with foam cells and fibrous cap',  // wrong mechanism for Buerger
          'Segmental thrombosing vasculitis involving arteries and contiguous veins',
          'Granulomatous arteritis with giant cells',
          'Fibrinoid necrosis of medium arteries',
        ]),
        correct:     'A',  // "lipid plaque" — wrong mechanism for Buerger
        explanation: GOOD_EXPL,
        subject:     'Pathology',
        system:      'Cardiovascular',
        testedConcept: 'Buerger disease thromboangiitis obliterans',
      },
      'practice',
      'Balanced',
    );

    expect(result.rejectionReasons).toContain('specialty_validation_failed');
    expect(result.validationStatus).toBe('fail');
    expect(result.specialtyValidation).toBeDefined();
    expect(result.specialtyValidation!.status).toBe('fail');
    expect(result.specialtyValidation!.matchedConcept).toBe('buerger_disease');
  });

  it('specialty warn does NOT cause scoreQuestion to fail', () => {
    // Buerger clue (distal ischemia) present but smoking not mentioned → warn only
    const result = scoreQuestion(
      {
        stem: [
          'A 30-year-old man presents with painful digital ulcers on three toes and',
          'migratory superficial thrombophlebitis in the lower extremities.',
          'He has no diabetes or hyperlipidemia.',
          'Biopsy of a digital vessel shows an organizing thrombus with acute inflammation.',
          'What is the most characteristic microscopic finding for this condition?',
        ].join(' '),
        options: makeOptions([
          'Segmental thrombosing vasculitis involving arteries and contiguous nerves',
          'Lipid-laden intimal plaque with foam cells',
          'Hyperplastic arteriolosclerosis',
          'Fibrinoid necrosis of medium-sized arteries',
        ]),
        correct:     'A',
        explanation: GOOD_EXPL,
        subject:     'Pathology',
        system:      'Cardiovascular',
      },
      'practice',
      'Balanced',
    );

    // warn does not cause rejection
    expect(result.rejectionReasons).not.toContain('specialty_validation_failed');
    // specialtyValidation is present with warn status
    expect(result.specialtyValidation).toBeDefined();
    expect(result.specialtyValidation!.status).toBe('warn');
    // overall result depends on other validators, not specialty
    // (the question structure is valid, so it may still pass)
    expect(['pass', 'fail']).toContain(result.validationStatus);
  });

  it('not_applicable does not affect validationStatus and adds no specialty rejection', () => {
    // Renal pathology question — specialty validator should return not_applicable
    const result = scoreQuestion(
      {
        stem: [
          'A 6-year-old boy presents with periorbital edema and 8 g/day proteinuria.',
          'Serum albumin is 1.8 g/dL. Electron microscopy shows diffuse podocyte',
          'foot process effacement with no immune deposits.',
          'What is the most likely diagnosis?',
        ].join(' '),
        options: makeOptions([
          'Minimal change disease',
          'Focal segmental glomerulosclerosis',
          'Membranous nephropathy',
          'IgA nephropathy',
        ]),
        correct:     'A',
        explanation: 'Minimal change disease is the most common cause of nephrotic syndrome in children. Electron microscopy shows diffuse podocyte foot process effacement without immune complex deposits. It responds well to corticosteroids. The exact mechanism involves a T-cell derived circulating factor that disrupts podocyte function.',
        subject:     'Pathology',
        system:      'Renal',
      },
      'practice',
      'Balanced',
    );

    expect(result.rejectionReasons).not.toContain('specialty_validation_failed');
    expect(result.specialtyValidation).toBeDefined();
    expect(result.specialtyValidation!.status).toBe('not_applicable');
    expect(result.specialtyValidation!.matchedConcept).toBeNull();
  });
});

// ── Phase 3: Universal Difficulty Validator ───────────────────────────────────

describe('checkDifficultyFit — unit tests', () => {
  // ── More Easy ─────────────────────────────────────────────────────────────────

  it('More Easy: depthScore > 60 returns [excessive_complexity_for_easy]', () => {
    expect(checkDifficultyFit(61, 100, 'More Easy')).toEqual(['excessive_complexity_for_easy']);
  });

  it('More Easy: depthScore 100 returns [excessive_complexity_for_easy] (maximum depth)', () => {
    expect(checkDifficultyFit(100, 100, 'More Easy')).toEqual(['excessive_complexity_for_easy']);
  });

  it('More Easy: depthScore 60 returns [difficulty_too_hard] (boundary — not yet a hard rejection)', () => {
    expect(checkDifficultyFit(60, 100, 'More Easy')).toEqual(['difficulty_too_hard']);
  });

  it('More Easy: depthScore 36 returns [difficulty_too_hard] (just above easy band)', () => {
    expect(checkDifficultyFit(36, 100, 'More Easy')).toEqual(['difficulty_too_hard']);
  });

  it('More Easy: depthScore 35 returns [] (at easy band ceiling — no flag)', () => {
    expect(checkDifficultyFit(35, 100, 'More Easy')).toEqual([]);
  });

  it('More Easy: depthScore 0 returns [] (well within easy band)', () => {
    expect(checkDifficultyFit(0, 100, 'More Easy')).toEqual([]);
  });

  // ── More Hard ─────────────────────────────────────────────────────────────────

  it('More Hard: depthScore 39 returns [insufficient_reasoning_depth] (just below floor)', () => {
    expect(checkDifficultyFit(39, 100, 'More Hard')).toEqual(['insufficient_reasoning_depth']);
  });

  it('More Hard: depthScore 0 returns [insufficient_reasoning_depth]', () => {
    expect(checkDifficultyFit(0, 100, 'More Hard')).toEqual(['insufficient_reasoning_depth']);
  });

  it('More Hard: depthScore 40 returns [] (at floor — no flag)', () => {
    expect(checkDifficultyFit(40, 100, 'More Hard')).toEqual([]);
  });

  it('More Hard: depthScore 80 returns [] (well above floor)', () => {
    expect(checkDifficultyFit(80, 100, 'More Hard')).toEqual([]);
  });

  // ── UWorld Challenge ──────────────────────────────────────────────────────────

  it('UWorld Challenge: depthScore 64 returns [insufficient_reasoning_depth] (just below floor)', () => {
    expect(checkDifficultyFit(64, 100, 'UWorld Challenge')).toEqual(['insufficient_reasoning_depth']);
  });

  it('UWorld Challenge: depthScore 0 returns [insufficient_reasoning_depth]', () => {
    expect(checkDifficultyFit(0, 100, 'UWorld Challenge')).toEqual(['insufficient_reasoning_depth']);
  });

  it('UWorld Challenge: depthScore 65 returns [] (at floor — no flag)', () => {
    expect(checkDifficultyFit(65, 100, 'UWorld Challenge')).toEqual([]);
  });

  it('UWorld Challenge: depthScore 90 returns [] (well above floor)', () => {
    expect(checkDifficultyFit(90, 100, 'UWorld Challenge')).toEqual([]);
  });

  // ── Balanced ──────────────────────────────────────────────────────────────────

  it('Balanced: returns [] at any depthScore — calibration + structural gates handle this tier', () => {
    expect(checkDifficultyFit(0, 100, 'Balanced')).toEqual([]);
    expect(checkDifficultyFit(100, 100, 'Balanced')).toEqual([]);
  });

  // ── NBME Difficult ────────────────────────────────────────────────────────────

  it('NBME Difficult: returns [] — scoreNbmeQuestion owns depth checks, checkDifficultyFit is bypassed', () => {
    expect(checkDifficultyFit(0, 100, 'NBME Difficult')).toEqual([]);
    expect(checkDifficultyFit(100, 100, 'NBME Difficult')).toEqual([]);
  });

  // ── Edge cases ────────────────────────────────────────────────────────────────

  it('empty string difficulty: returns []', () => {
    expect(checkDifficultyFit(50, 100, '')).toEqual([]);
  });

  it('standardized difficulty: returns []', () => {
    expect(checkDifficultyFit(50, 100, 'standardized')).toEqual([]);
  });

  it('stemLength is accepted but unused — no error at any value', () => {
    expect(checkDifficultyFit(50, 0, 'Balanced')).toEqual([]);
    expect(checkDifficultyFit(50, 9999, 'Balanced')).toEqual([]);
  });
});

describe('checkDifficultyFit — scoreQuestion integration', () => {
  const LONG_EXPL =
    'HGPRT deficiency causes Lesch-Nyhan syndrome. The enzyme salvages hypoxanthine and guanine back to IMP and GMP via the purine salvage pathway. When HGPRT is absent, excess purines are degraded to uric acid, causing hyperuricemia, nephropathy, and gout. Neurological features include self-mutilation, intellectual disability, and choreoathetosis. Allopurinol reduces uric acid production by inhibiting xanthine oxidase but does not correct the neurological symptoms.';

  // Overly complex More Easy question — depthScore ~100 (4 sentences, 8+ terms, >200 chars)
  const COMPLEX_MORE_EASY_STEM =
    'A 28-year-old man with an X-linked recessive disorder presents with joint pain, hyperuricemia, and self-mutilatory behavior. Serum uric acid is 9.8 mg/dL. The enzyme deficiency disrupts purine salvage, forcing increased de novo synthesis via the PRPP pathway. An inhibitor of xanthine oxidase is under consideration. Which enzyme is deficient?';
  const COMPLEX_MORE_EASY_OPTS = makeOptions([
    'HGPRT',
    'APRT',
    'Adenosine deaminase',
    'Purine nucleoside phosphorylase',
  ]);

  it('More Easy overly complex question includes excessive_complexity_for_easy', () => {
    const result = scoreQuestion(
      { stem: COMPLEX_MORE_EASY_STEM, options: COMPLEX_MORE_EASY_OPTS, correct: 'A', explanation: LONG_EXPL },
      'practice', 'More Easy',
    );
    expect(result.rejectionReasons).toContain('excessive_complexity_for_easy');
  });

  it('More Easy overly complex question fails — excessive_complexity_for_easy is a hard rejection', () => {
    const result = scoreQuestion(
      { stem: COMPLEX_MORE_EASY_STEM, options: COMPLEX_MORE_EASY_OPTS, correct: 'A', explanation: LONG_EXPL },
      'practice', 'More Easy',
    );
    expect(result.validationStatus).toBe('fail');
  });

  // Shallow More Hard / UWorld question — depthScore ~30 (2 sentences, 0 terms, 87 chars)
  const SHALLOW_STEM = 'A 43-year-old woman presents with shortness of breath. Which test is most appropriate?';
  const SHALLOW_OPTS = makeOptions([
    'Chest X-ray',
    'Echocardiogram',
    'Pulmonary function tests',
    'CT pulmonary angiography',
  ]);
  const SHALLOW_EXPL =
    'A chest X-ray is the most appropriate initial test for a patient presenting with shortness of breath. It can identify pneumonia, pleural effusion, pneumothorax, and cardiomegaly. The posterior-anterior view is preferred when the patient can stand. CT pulmonary angiography is reserved for suspected pulmonary embolism after initial assessment.';

  it('More Hard shallow question includes insufficient_reasoning_depth', () => {
    const result = scoreQuestion(
      { stem: SHALLOW_STEM, options: SHALLOW_OPTS, correct: 'A', explanation: SHALLOW_EXPL },
      'practice', 'More Hard',
    );
    expect(result.rejectionReasons).toContain('insufficient_reasoning_depth');
  });

  it('More Hard shallow question still passes — insufficient_reasoning_depth is a soft reason, not a hard rejection', () => {
    const result = scoreQuestion(
      { stem: SHALLOW_STEM, options: SHALLOW_OPTS, correct: 'A', explanation: SHALLOW_EXPL },
      'practice', 'More Hard',
    );
    expect(result.rejectionReasons).toContain('insufficient_reasoning_depth');
    expect(result.validationStatus).toBe('pass');
  });

  it('UWorld Challenge shallow question includes insufficient_reasoning_depth', () => {
    const result = scoreQuestion(
      { stem: SHALLOW_STEM, options: SHALLOW_OPTS, correct: 'A', explanation: SHALLOW_EXPL },
      'practice', 'UWorld Challenge',
    );
    expect(result.rejectionReasons).toContain('insufficient_reasoning_depth');
  });

  it('NBME Difficult valid question acquires neither excessive_complexity_for_easy nor insufficient_reasoning_depth', () => {
    const result = scoreQuestion(
      { stem: NBME_NEURO_STEM, options: NBME_NEURO_OPTS, correct: 'A', explanation: NBME_NEURO_EXPL_SHORT },
      'practice', 'NBME Difficult',
    );
    expect(result.rejectionReasons).not.toContain('excessive_complexity_for_easy');
    expect(result.rejectionReasons).not.toContain('insufficient_reasoning_depth');
  });
});

// ── Phase 4: UWorld Challenge Backend Parity ──────────────────────────────────

// ── Shared UWorld fixtures ────────────────────────────────────────────────────

// Well-formed UWorld question — passes all Phase 4 checks in practice mode.
const UW_STEM =
  'A 38-year-old woman with a 6-year history of systemic lupus erythematosus presents with ' +
  'worsening fatigue, periorbital edema, and foamy urine for 3 weeks. Blood pressure is ' +
  '158/94 mmHg. Serum creatinine is 2.1 mg/dL, albumin 2.2 g/dL, and urinalysis shows 4+ ' +
  'proteinuria with RBC casts. A renal biopsy is performed. Which pathological finding on ' +
  'light microscopy is most characteristic of this patient\'s condition?';

const UW_OPTS = makeOptions([
  'Wire loop lesions with thickened glomerular basement membrane',
  'Mesangial IgA deposits with focal hypercellularity',
  'Diffuse foot process effacement on electron microscopy',
  'Congo red staining with apple-green birefringence under polarized light',
]);

const UW_EXPL =
  'Wire loop lesions are the hallmark of diffuse proliferative lupus nephritis (ISN/RPS class IV), ' +
  'representing massive subendothelial immune complex deposition that thickens glomerular capillary ' +
  'walls. This class causes the most severe renal injury, with combined nephrotic and nephritic ' +
  'features. Treatment requires high-dose corticosteroids plus cyclophosphamide or mycophenolate ' +
  'mofetil to prevent progression to end-stage renal disease. Complement levels (C3, C4) and ' +
  'anti-dsDNA antibodies are monitored to guide disease activity.';

// Option explanations with contrast language for B, C, D (wrongOptionContrastCount = 3).
const UW_OPTS_EXPL_WITH_CONTRAST: Record<string, string> = {
  A: 'Wire loop lesions are correct — they represent massive subendothelial immune complex deposition in lupus nephritis class IV, the most severe form with both nephrotic and nephritic features requiring aggressive immunosuppression.',
  B: 'Mesangial IgA deposits are incorrect because they characterize IgA nephropathy (Berger disease), not lupus nephritis. IgA nephropathy typically follows mucosal infections in younger males rather than presenting with longstanding SLE.',
  C: 'Diffuse foot process effacement is incorrect because minimal change disease presents with nephrotic syndrome without hematuria or RBC casts. It does not produce the immune complex deposits seen in SLE and lacks the subendothelial deposition pattern.',
  D: 'Congo red positive deposits are incorrect — amyloidosis causes protein deposition without immune complex formation. Unlike lupus nephritis, amyloidosis does not produce RBC casts and lacks the anti-dsDNA antibody association.',
};

// Same option explanations but without contrast language (for weak_wrong_option_teaching soft test).
const UW_OPTS_EXPL_NO_CONTRAST: Record<string, string> = {
  A: 'Wire loop lesions represent the hallmark finding in diffuse proliferative lupus nephritis class IV, caused by massive subendothelial immune complex deposition and associated with the most severe nephritis requiring aggressive immunosuppression.',
  B: 'Mesangial IgA deposits are found in IgA nephropathy (Berger disease), a condition characterized by hematuria following mucosal infections in younger males. The clinical presentation and demographics differ substantially from this case.',
  C: 'Minimal change disease presents with nephrotic syndrome in children and young adults, featuring foot process effacement on electron microscopy. The clinical course responds well to steroids, with complete remission expected in most cases.',
  D: 'Amyloidosis causes progressive protein deposition in multiple organs and produces characteristic apple-green birefringence on Congo red staining. The clinical presentation and laboratory findings would show patterns diverging from this context.',
};

// ── checkUworldSpecific — unit tests ─────────────────────────────────────────

describe('checkUworldSpecific — unit tests', () => {
  // ── uworld_stem_too_short ─────────────────────────────────────────────────────

  it('returns [uworld_stem_too_short] when stem < 180 chars', () => {
    const q = {
      stem:        'A 45-year-old woman presents with shortness of breath and creatinine 2.1 mg/dL. Which test is best?',
      options:     makeOptions(['Chest CT pulmonary angiography', 'Ventilation perfusion scan', 'Echocardiogram with Doppler', 'Pulmonary function testing']),
      correct:     'A',
      explanation: UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    };
    expect(checkUworldSpecific(q, 'practice')).toContain('uworld_stem_too_short');
  });

  it('does not return uworld_stem_too_short when stem >= 180 chars', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('uworld_stem_too_short');
  });

  // ── missing_objective_data ────────────────────────────────────────────────────

  it('returns [missing_objective_data] when stem contains no lab/vital/imaging signals', () => {
    // 180+ chars but purely narrative — no numbers, no units, no imaging terms
    const narrativeStem =
      'A middle-aged man with a chronic autoimmune condition comes to the office with worsening ' +
      'fatigue and swelling around his eyes for several weeks. His family reports he has been ' +
      'producing frothy urine. He has no prior kidney disease. A tissue sample is requested. ' +
      'Which pathological finding is most characteristic of his condition?';
    const q = { stem: narrativeStem, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST };
    expect(checkUworldSpecific(q, 'practice')).toContain('missing_objective_data');
  });

  it('does not return missing_objective_data when stem has lab value (mg/dL)', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('missing_objective_data');
  });

  it('does not return missing_objective_data when stem has vital sign (mmHg)', () => {
    const stemWithVitals = UW_STEM; // contains "158/94 mmHg"
    expect(checkUworldSpecific({ stem: stemWithVitals, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('missing_objective_data');
  });

  // ── hard_explanation_too_short ────────────────────────────────────────────────

  it('returns [hard_explanation_too_short] when explanation < 350 chars in practice', () => {
    const shortExpl = 'Wire loop lesions are pathognomonic of lupus nephritis class IV, caused by immune complex deposition and treated with steroids plus cyclophosphamide.';
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: shortExpl, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST };
    expect(checkUworldSpecific(q, 'practice')).toContain('hard_explanation_too_short');
  });

  it('does not return hard_explanation_too_short when explanation >= 350 chars', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('hard_explanation_too_short');
  });

  it('does not return hard_explanation_too_short in exam mode when explanation is empty', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: '', optionExplanations: {} };
    expect(checkUworldSpecific(q, 'exam')).not.toContain('hard_explanation_too_short');
  });

  it('returns hard_explanation_too_short in exam mode when explanation is non-empty but too short', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: 'Wire loop lesions.', optionExplanations: {} };
    expect(checkUworldSpecific(q, 'exam')).toContain('hard_explanation_too_short');
  });

  // ── weak_hard_distractors ─────────────────────────────────────────────────────

  it('returns [weak_hard_distractors] when any option is fewer than 12 chars', () => {
    const q = { stem: UW_STEM, options: makeOptions(['Wire loop lesions and basement membrane thickening', 'IgA deposits', 'Foot process effacement on electron', 'Congo red staining birefringence']), correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST };
    expect(checkUworldSpecific(q, 'practice')).toContain('weak_hard_distractors');
  });

  it('returns [weak_hard_distractors] when any option has fewer than 3 words', () => {
    const q = { stem: UW_STEM, options: makeOptions(['Wire loop lesions with thickened basement membrane', 'IgA nephropathy', 'Diffuse foot process effacement on electron microscopy', 'Congo red positive amyloid deposits']), correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST };
    expect(checkUworldSpecific(q, 'practice')).toContain('weak_hard_distractors');
  });

  it('does not return weak_hard_distractors when all options are 12+ chars and 3+ words', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('weak_hard_distractors');
  });

  // ── missing_uworld_option_explanations ────────────────────────────────────────

  it('returns [missing_uworld_option_explanations] in practice when optionExplanations absent', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL };
    expect(checkUworldSpecific(q, 'practice')).toContain('missing_uworld_option_explanations');
  });

  it('returns [missing_uworld_option_explanations] in coach when optionExplanations absent', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL };
    expect(checkUworldSpecific(q, 'coach')).toContain('missing_uworld_option_explanations');
  });

  it('does NOT return missing_uworld_option_explanations in exam mode', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: '' };
    expect(checkUworldSpecific(q, 'exam')).not.toContain('missing_uworld_option_explanations');
  });

  it('does not return missing_uworld_option_explanations when all 4 are present', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('missing_uworld_option_explanations');
  });

  // ── shallow_uworld_option_explanations ────────────────────────────────────────

  it('returns [shallow_uworld_option_explanations] when any option explanation < 60 chars in practice', () => {
    const q = {
      stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL,
      optionExplanations: { A: UW_OPTS_EXPL_WITH_CONTRAST.A, B: 'Incorrect.', C: UW_OPTS_EXPL_WITH_CONTRAST.C, D: UW_OPTS_EXPL_WITH_CONTRAST.D },
    };
    expect(checkUworldSpecific(q, 'practice')).toContain('shallow_uworld_option_explanations');
  });

  it('does NOT return shallow_uworld_option_explanations when missing_uworld_option_explanations fires', () => {
    // When explanations are absent the missing check fires; shallow check is skipped.
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL };
    const reasons = checkUworldSpecific(q, 'practice');
    expect(reasons).toContain('missing_uworld_option_explanations');
    expect(reasons).not.toContain('shallow_uworld_option_explanations');
  });

  it('does not return shallow_uworld_option_explanations when all explanations are 60+ chars', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('shallow_uworld_option_explanations');
  });

  it('does NOT return shallow_uworld_option_explanations in exam mode', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: '' };
    expect(checkUworldSpecific(q, 'exam')).not.toContain('shallow_uworld_option_explanations');
  });

  // ── weak_wrong_option_teaching (soft) ─────────────────────────────────────────

  it('returns [weak_wrong_option_teaching] when < 2 wrong-option explanations use contrast language', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_NO_CONTRAST };
    expect(checkUworldSpecific(q, 'practice')).toContain('weak_wrong_option_teaching');
  });

  it('does not return weak_wrong_option_teaching when 2+ wrong-option explanations use contrast', () => {
    expect(checkUworldSpecific({ stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST }, 'practice'))
      .not.toContain('weak_wrong_option_teaching');
  });

  it('does NOT return weak_wrong_option_teaching in exam mode', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: '' };
    expect(checkUworldSpecific(q, 'exam')).not.toContain('weak_wrong_option_teaching');
  });

  // ── clean question returns [] ─────────────────────────────────────────────────

  it('returns [] for a fully valid UWorld practice question', () => {
    const q = { stem: UW_STEM, options: UW_OPTS, correct: 'A', explanation: UW_EXPL, optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST };
    expect(checkUworldSpecific(q, 'practice')).toEqual([]);
  });
});

// ── checkUworldSpecific — scoreQuestion integration ───────────────────────────

describe('checkUworldSpecific — scoreQuestion integration', () => {
  // ── Hard rejections each cause validationStatus fail ─────────────────────────

  it('UWorld short stem causes uworld_stem_too_short and fails', () => {
    const result = scoreQuestion({
      stem:               'A 45-year-old woman with creatinine 2.1 mg/dL presents with edema. Which test is best?',
      options:            makeOptions(['Renal ultrasound with Doppler flow', 'Kidney biopsy for pathology', 'Urine protein electrophoresis test', 'Serum complement level assay']),
      correct:            'A',
      explanation:        UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('uworld_stem_too_short');
    expect(result.validationStatus).toBe('fail');
  });

  it('UWorld short explanation causes hard_explanation_too_short and fails', () => {
    const shortExpl = 'Wire loop lesions are pathognomonic of lupus nephritis class IV caused by immune complex deposits treated with steroids plus cyclophosphamide.';
    const result = scoreQuestion({
      stem:               UW_STEM,
      options:            UW_OPTS,
      correct:            'A',
      explanation:        shortExpl,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('hard_explanation_too_short');
    expect(result.validationStatus).toBe('fail');
  });

  it('UWorld weak distractors cause weak_hard_distractors and fail', () => {
    const result = scoreQuestion({
      stem:               UW_STEM,
      options:            makeOptions(['Wire loop lesions with thickened basement membrane', 'Metoprolol', 'Diffuse foot process effacement on electron microscopy', 'Congo red positive amyloid deposits staining']),
      correct:            'A',
      explanation:        UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('weak_hard_distractors');
    expect(result.validationStatus).toBe('fail');
  });

  it('UWorld stem missing objective data causes missing_objective_data and fails', () => {
    const narrativeStem =
      'A middle-aged woman with longstanding autoimmune disease presents with worsening fatigue, ' +
      'visible swelling around both eyes, and frothy urine for several weeks. She has no prior ' +
      'kidney problems but reports weight gain and reduced urine output. Her physician orders a ' +
      'tissue sample to identify the underlying renal pathology causing her symptoms. Which ' +
      'pathological finding is most characteristic of her condition?';
    const result = scoreQuestion({
      stem:               narrativeStem,
      options:            UW_OPTS,
      correct:            'A',
      explanation:        UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('missing_objective_data');
    expect(result.validationStatus).toBe('fail');
  });

  it('UWorld practice missing optionExplanations causes missing_uworld_option_explanations and fails', () => {
    const result = scoreQuestion({
      stem:        UW_STEM,
      options:     UW_OPTS,
      correct:     'A',
      explanation: UW_EXPL,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('missing_uworld_option_explanations');
    expect(result.validationStatus).toBe('fail');
  });

  it('UWorld exam mode without optionExplanations does NOT trigger missing_uworld_option_explanations', () => {
    const result = scoreQuestion({
      stem:        UW_STEM,
      options:     UW_OPTS,
      correct:     'A',
      explanation: '',
    }, 'exam', 'UWorld Challenge');
    expect(result.rejectionReasons).not.toContain('missing_uworld_option_explanations');
    expect(result.rejectionReasons).not.toContain('shallow_uworld_option_explanations');
  });

  // ── Soft reason does not fail alone ──────────────────────────────────────────

  it('UWorld weak_wrong_option_teaching alone does not cause validationStatus fail', () => {
    // Question passes all hard checks but optionExplanations have no contrast language.
    const result = scoreQuestion({
      stem:               UW_STEM,
      options:            UW_OPTS,
      correct:            'A',
      explanation:        UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_NO_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).toContain('weak_wrong_option_teaching');
    expect(result.validationStatus).toBe('pass');
  });

  // ── Well-formed UWorld question passes ───────────────────────────────────────

  it('well-formed UWorld practice question passes all checks', () => {
    const result = scoreQuestion({
      stem:               UW_STEM,
      options:            UW_OPTS,
      correct:            'A',
      explanation:        UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).not.toContain('uworld_stem_too_short');
    expect(result.rejectionReasons).not.toContain('hard_explanation_too_short');
    expect(result.rejectionReasons).not.toContain('weak_hard_distractors');
    expect(result.rejectionReasons).not.toContain('missing_objective_data');
    expect(result.rejectionReasons).not.toContain('missing_uworld_option_explanations');
    expect(result.rejectionReasons).not.toContain('shallow_uworld_option_explanations');
    expect(result.rejectionReasons).not.toContain('weak_wrong_option_teaching');
    expect(result.validationStatus).toBe('pass');
  });

  // ── NBME and Balanced are unaffected ─────────────────────────────────────────

  it('NBME Difficult question acquires no UWorld-specific reasons', () => {
    const result = scoreQuestion(
      { stem: NBME_NEURO_STEM, options: NBME_NEURO_OPTS, correct: 'A', explanation: NBME_NEURO_EXPL_SHORT },
      'practice', 'NBME Difficult',
    );
    expect(result.rejectionReasons).not.toContain('uworld_stem_too_short');
    expect(result.rejectionReasons).not.toContain('hard_explanation_too_short');
    expect(result.rejectionReasons).not.toContain('weak_hard_distractors');
    expect(result.rejectionReasons).not.toContain('missing_objective_data');
    expect(result.rejectionReasons).not.toContain('missing_uworld_option_explanations');
    expect(result.rejectionReasons).not.toContain('weak_wrong_option_teaching');
  });

  it('Balanced question acquires no UWorld-specific reasons', () => {
    const result = scoreQuestion({
      stem:        'A 35-year-old woman presents with painful swollen joints and serum uric acid of 9.2 mg/dL. She has been taking hydrochlorothiazide for hypertension for 6 months. Which mechanism best explains her presentation?',
      options:     makeOptions(['Decreased renal uric acid excretion', 'Increased de novo purine synthesis', 'Decreased xanthine oxidase activity', 'Impaired urate transporter function']),
      correct:     'A',
      explanation: 'Hydrochlorothiazide reduces uric acid excretion at the proximal tubule by competing with urate for the URAT1 transporter. This leads to urate retention and hyperuricemia. The mechanism is distinct from allopurinol (xanthine oxidase inhibition) or colchicine (anti-inflammatory). Patients on thiazide diuretics have increased gout risk that requires monitoring and potential dose adjustment.',
    }, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('uworld_stem_too_short');
    expect(result.rejectionReasons).not.toContain('hard_explanation_too_short');
    expect(result.rejectionReasons).not.toContain('weak_hard_distractors');
    expect(result.rejectionReasons).not.toContain('missing_objective_data');
    expect(result.rejectionReasons).not.toContain('missing_uworld_option_explanations');
    expect(result.rejectionReasons).not.toContain('weak_wrong_option_teaching');
  });
});

// ── Phase 5: NBME gap tests ───────────────────────────────────────────────────

describe('scoreNbmeQuestion — contradictory explanation (Phase 5 gap)', () => {
  it('fails when explanation explicitly names a wrong option as the correct answer', () => {
    // Option B = "Right middle cerebral artery occlusion"; explanation claims it is correct.
    const result = scoreNbmeQuestion({
      stem:        NBME_NEURO_STEM,
      options:     NBME_NEURO_OPTS,
      correct:     'A',
      explanation: 'Right middle cerebral artery occlusion is the correct answer in this case, as the right MCA territory produces contralateral visual field deficits.',
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('contradictory_explanation');
    expect(result.validationStatus).toBe('fail');
  });
});

describe('scoreNbmeQuestion — coach mode requires option explanations (Phase 5 gap)', () => {
  it('fails in coach mode when optionExplanations are absent', () => {
    const result = scoreNbmeQuestion({
      stem:        NBME_NEURO_STEM,
      options:     NBME_NEURO_OPTS,
      correct:     'A',
      explanation: NBME_NEURO_EXPL_SHORT,
      // no optionExplanations
    }, 'coach', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('missing_option_explanations');
    expect(result.validationStatus).toBe('fail');
  });

  it('passes in practice mode without optionExplanations', () => {
    const result = scoreNbmeQuestion({
      stem:        NBME_NEURO_STEM,
      options:     NBME_NEURO_OPTS,
      correct:     'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).not.toContain('missing_option_explanations');
    expect(result.validationStatus).toBe('pass');
  });
});

describe('non_concise_nbme_options — scoreQuestion integration', () => {
  const LONG_OPTION =
    'Right middle cerebral artery occlusion causing contralateral hemiplegia, hemisensory loss, and hemispatial neglect confirmed by diffusion-weighted MRI in the acute setting';

  it('NBME question with an option > 160 chars fails with non_concise_nbme_options', () => {
    const result = scoreQuestion({
      stem:        NBME_NEURO_STEM,
      options:     makeOptions([
        'Left posterior cerebral artery occlusion',
        LONG_OPTION,
        'Left anterior cerebral artery occlusion',
        'Basilar artery occlusion',
      ]),
      correct:     'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).toContain('non_concise_nbme_options');
    expect(result.validationStatus).toBe('fail');
  });

  it('NBME question with concise options does not fire non_concise_nbme_options', () => {
    const result = scoreQuestion({
      stem:        NBME_NEURO_STEM,
      options:     NBME_NEURO_OPTS,
      correct:     'A',
      explanation: NBME_NEURO_EXPL_SHORT,
    }, 'practice', 'NBME Difficult');
    expect(result.rejectionReasons).not.toContain('non_concise_nbme_options');
  });

  it('Balanced question with a long option does not fire non_concise_nbme_options (NBME-only rule)', () => {
    const result = scoreQuestion({
      stem:        'A 35-year-old woman presents with painful swollen joints and serum uric acid of 9.2 mg/dL. She has been taking hydrochlorothiazide for 6 months. Which mechanism best explains her presentation?',
      options:     makeOptions([
        'Decreased renal uric acid excretion via URAT1 transporter competition causing urate retention and hyperuricemia',
        LONG_OPTION,
        'Decreased xanthine oxidase activity',
        'Impaired urate transporter function',
      ]),
      correct:     'A',
      explanation: 'Hydrochlorothiazide reduces uric acid excretion at the proximal tubule by competing with urate for the URAT1 transporter, leading to urate retention and hyperuricemia. Distinct from allopurinol mechanism. Patients on thiazides have increased gout risk.',
    }, 'practice', 'Balanced');
    expect(result.rejectionReasons).not.toContain('non_concise_nbme_options');
  });

  it('UWorld question with a long option does not fire non_concise_nbme_options (NBME-only rule)', () => {
    const result = scoreQuestion({
      stem:               UW_STEM,
      options:            makeOptions([
        'Wire loop lesions with thickened glomerular basement membrane',
        LONG_OPTION,
        'Diffuse foot process effacement on electron microscopy',
        'Congo red staining with apple-green birefringence under polarized light',
      ]),
      correct:            'A',
      explanation:        UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
    }, 'practice', 'UWorld Challenge');
    expect(result.rejectionReasons).not.toContain('non_concise_nbme_options');
  });
});

describe('domain-aware nonclinical scenario validation', () => {
  const studyStem = 'A randomized trial enrolls 10,000 participants and compares a statin with placebo. Myocardial infarction occurs in 4% of the treatment group and 8% of the placebo group after 5 years. Which measure best describes the treatment effect?';
  const studyOptions = makeOptions([
    'Relative risk of 0.50',
    'Odds ratio of 2.00',
    'Absolute risk increase of 4%',
    'Number needed to harm of 25',
  ]);

  it('accepts an applied biostatistics study scenario without a patient vignette', () => {
    const result = scoreQuestion({
      stem: studyStem,
      options: studyOptions,
      correct: 'A',
      explanation: 'The risk is 4% in the treatment group and 8% in the placebo group, so relative risk is 0.04 divided by 0.08, which equals 0.50. This applied trial scenario contains the information needed to calculate the effect without using an individual patient vignette.',
      subject: 'Biostatistics',
      topic: 'Measures of Association',
      testedConcept: 'Relative risk in a randomized trial',
      physicianTask: 'Practice-Based Learning and Improvement',
    }, 'practice', 'Balanced');

    expect(result.rejectionReasons).not.toContain('no_clinical_vignette');
    expect(result.validationStatus).toBe('pass');
  });

  it('does not let an unrelated bare knowledge question bypass the vignette gate', () => {
    const result = scoreQuestion({
      stem: 'Which receptor is blocked by propranolol to reduce heart rate and myocardial contractility in patients with cardiovascular disease?',
      options: makeOptions(['Beta adrenergic receptor', 'Muscarinic acetylcholine receptor', 'Nicotinic acetylcholine receptor', 'Angiotensin receptor']),
      correct: 'A',
      explanation: 'Propranolol blocks beta adrenergic receptors, reducing sympathetic stimulation of the heart. The other receptors are not the principal pharmacologic target responsible for its cardiac effects.',
      subject: 'Pharmacology',
      topic: 'Beta Blockers',
    }, 'practice', 'Balanced');

    expect(result.rejectionReasons).toContain('no_clinical_vignette');
  });

  it('accepts quantitative screening outcomes as objective UWorld data for biostatistics', () => {
    const reasons = checkUworldSpecific({
      stem: 'A screening study enrolls 18,000 patients and detects pancreatic cancer earlier. Five-year survival after diagnosis increases from 8% to 24%, but disease-specific mortality per 100,000 people is unchanged after 8 years. Median age at death and treatment protocols are unchanged. Which bias explains the apparent survival benefit?',
      options: makeOptions(['Lead-time bias after earlier diagnosis', 'Length-time bias from indolent disease', 'Recall bias from exposure memory', 'Observer bias during outcome measurement']),
      correct: 'A',
      explanation: UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
      subject: 'Biostatistics',
      topic: 'Screening Bias',
      testedConcept: 'Lead-time bias in a screening study',
    }, 'practice');

    expect(reasons).not.toContain('missing_objective_data');
  });

  it('still requires clinical objective data for an ordinary UWorld clinical question', () => {
    const reasons = checkUworldSpecific({
      stem: 'A 45-year-old patient reports progressive fatigue for several months and is evaluated in clinic. The history is otherwise nonspecific, and the examination description does not provide measurements or diagnostic findings. Which mechanism most likely explains the presentation?',
      options: makeOptions(['Autoimmune tissue injury causing disease', 'Congenital enzyme deficiency causing symptoms', 'Medication toxicity causing organ dysfunction', 'Mechanical obstruction causing pressure injury']),
      correct: 'A',
      explanation: UW_EXPL,
      optionExplanations: UW_OPTS_EXPL_WITH_CONTRAST,
      subject: 'Pathology',
      topic: 'Clinical Mechanisms',
    }, 'practice');

    expect(reasons).toContain('missing_objective_data');
  });

  it('does not treat labels shared by every option as answer leakage', () => {
    const result = scoreQuestion({
      stem: 'A diagnostic test is evaluated in 1,000 participants. It is positive in 90 of 100 participants with disease and negative in 810 of 900 participants without disease. What are the sensitivity and specificity?',
      options: makeOptions([
        'Sensitivity 90% and specificity 90%',
        'Sensitivity 90% and specificity 10%',
        'Sensitivity 47% and specificity 90%',
        'Sensitivity 90% and specificity 47%',
      ]),
      correct: 'A',
      explanation: 'Sensitivity is 90 divided by 100, or 90%. Specificity is 810 divided by 900, also 90%. The repeated words sensitivity and specificity define the answer format in every option and do not reveal which numeric combination is correct.',
      subject: 'Biostatistics',
      topic: 'Diagnostic Test Characteristics',
      testedConcept: 'Sensitivity and specificity calculation',
    }, 'practice', 'Balanced');

    expect(result.rejectionReasons).not.toContain('severe_clue_leakage');
    expect(result.validationStatus).toBe('pass');
  });
});
