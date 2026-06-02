import { describe, it, expect } from 'vitest';
import {
  scoreQuestion, buildRepairPrompt, isSuspectStem, REPAIR_GUIDANCE,
  requiresMedicalReview, buildMedicalReviewPrompt, parseMedicalReviewResponse,
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
