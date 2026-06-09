import { describe, expect, it } from 'vitest';
import { validateQuestion } from './validationEngine.js';

function baseQuestion(overrides: Record<string, unknown> = {}) {
  return {
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    topic: 'ACE inhibitors',
    testedConcept: 'ACE inhibitor bradykinin cough mechanism',
    questionAngle: 'adverse-effect',
    usmleContentArea: 'Cardiovascular System',
    physicianTask: 'Mechanism',
    stem: 'A 58-year-old man with hypertension and proteinuria starts lisinopril. Two weeks later he develops a persistent dry nonproductive cough without fever, wheezing, or abnormal chest radiograph findings. Which mechanism best explains this adverse effect?',
    options: [
      { letter: 'A', text: 'Accumulation of bradykinin due to angiotensin-converting enzyme inhibition' },
      { letter: 'B', text: 'Direct activation of beta-2 adrenergic receptors in bronchial smooth muscle' },
      { letter: 'C', text: 'Inhibition of cyclooxygenase causing excess leukotriene production' },
      { letter: 'D', text: 'Increased aldosterone secretion causing airway mucosal edema' },
    ],
    correct: 'A',
    explanation: 'ACE inhibitors block angiotensin-converting enzyme, which normally degrades bradykinin. Accumulation of bradykinin can cause a persistent dry cough, making bradykinin accumulation the correct mechanism.',
    optionExplanations: {
      A: 'Correct: ACE inhibition increases bradykinin, producing cough.',
      B: 'Beta-2 activation causes bronchodilation, not ACE inhibitor cough.',
      C: 'Leukotriene excess is associated with aspirin-exacerbated respiratory disease.',
      D: 'ACE inhibitors reduce aldosterone rather than increase it.',
    },
    ...overrides,
  };
}

describe('validationEngine', () => {
  it('passes aligned subject and system labels', async () => {
    const result = await validateQuestion({
      question: baseQuestion(),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Pharmacology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(true);
    expect(result.validators.find(v => v.name === 'subject')?.status).toBe('pass');
    expect(result.validators.find(v => v.name === 'system')?.status).toBe('pass');
  });

  it('fails subject mismatch', async () => {
    const result = await validateQuestion({
      question: baseQuestion({ subject: 'Pathology' }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Pharmacology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('subject:subject_mismatch');
  });

  it('fails system mismatch', async () => {
    const result = await validateQuestion({
      question: baseQuestion({ system: 'Renal / Urinary' }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Pharmacology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('system:system_mismatch');
  });

  it('accepts cardiovascular pathology content for Pathology + Cardiovascular', async () => {
    const result = await validateQuestion({
      question: baseQuestion({
        subject: 'Pathology',
        topic: 'Atherosclerosis',
        testedConcept: 'Atherosclerotic plaque rupture causing myocardial infarction pathology',
        stem: 'A 63-year-old man develops crushing chest pain and dies suddenly. Autopsy shows a ruptured atherosclerotic plaque with overlying coronary thrombus and coagulative necrosis of myocardial tissue. Which pathologic process caused the infarction?',
        options: [
          { letter: 'A', text: 'Plaque rupture with coronary thrombosis causing myocardial infarction' },
          { letter: 'B', text: 'Accumulation of bradykinin from ACE inhibition causing cough' },
          { letter: 'C', text: 'Beta-1 receptor blockade decreasing heart rate' },
          { letter: 'D', text: 'Aldosterone increase causing sodium retention' },
        ],
        explanation: 'Rupture of an atherosclerotic plaque exposes thrombogenic subendothelial material, causing platelet adhesion, thrombus formation, coronary artery occlusion, ischemia, and myocardial infarction with coagulative necrosis. This pathologic cascade explains the sudden fatal chest pain.',
      }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Pathology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(true);
    expect(result.validators.find(v => v.name === 'subject_system')?.status).toBe('pass');
  });

  it('rejects cardiovascular pharmacology content for Pathology + Cardiovascular', async () => {
    const result = await validateQuestion({
      question: baseQuestion({ subject: 'Pathology' }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Pathology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('subject_system:cardio_pharmacology_not_pathology');
  });

  it('accepts renal physiology content for Physiology + Renal / Urinary', async () => {
    const result = await validateQuestion({
      question: baseQuestion({
        subject: 'Physiology',
        system: 'Renal / Urinary',
        topic: 'GFR',
        testedConcept: 'Afferent arteriolar constriction lowers GFR physiology',
        stem: 'A 45-year-old man receives a medication that preferentially constricts the afferent arteriole supplying the glomerulus. Renal plasma flow falls, and the pressure driving filtration across the glomerular capillary wall decreases. Which change is expected in renal filtration?',
        options: [
          { letter: 'A', text: 'Reduced filtration rate from lower pressure entering the capillary tuft' },
          { letter: 'B', text: 'Increased filtration rate from selective dilation of the outgoing arteriole' },
          { letter: 'C', text: 'Unchanged filtration rate because Bowman space pressure fully compensates' },
          { letter: 'D', text: 'Increased filtration rate from decreased oncotic pressure in the capillary' },
        ],
        explanation: 'Afferent arteriolar constriction decreases renal plasma flow into the glomerulus and lowers glomerular capillary hydrostatic pressure. Because hydrostatic pressure is the main force favoring filtration, the net filtration pressure and GFR decrease.',
      }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Physiology', system: 'Renal / Urinary' },
    });

    expect(result.passed).toBe(true);
    expect(result.validators.find(v => v.name === 'subject_system')?.status).toBe('pass');
  });

  it('rejects renal pathology content for Physiology + Renal / Urinary', async () => {
    const result = await validateQuestion({
      question: baseQuestion({
        subject: 'Physiology',
        system: 'Renal / Urinary',
        topic: 'Glomerulonephritis',
        testedConcept: 'Poststreptococcal glomerulonephritis pathology with immune complex deposition',
        stem: 'A child develops cola-colored urine after pharyngitis. Renal biopsy shows immune complex deposition in the glomeruli with a granular pattern. Which pathologic process explains the glomerulonephritis?',
        options: [
          { letter: 'A', text: 'Immune complex deposition in glomeruli causing nephritic syndrome' },
          { letter: 'B', text: 'Afferent arteriolar constriction lowering glomerular capillary pressure' },
          { letter: 'C', text: 'Increased proximal bicarbonate reabsorption causing metabolic alkalosis' },
          { letter: 'D', text: 'Loop diuretic blockade of sodium-potassium-chloride transporters' },
        ],
        explanation: 'Poststreptococcal glomerulonephritis is an immune complex-mediated renal pathology. Immune deposits activate complement and inflame glomeruli, producing hematuria, RBC casts, and nephritic syndrome after infection.',
      }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Physiology', system: 'Renal / Urinary' },
    });

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('subject_system:renal_pathology_not_physiology');
  });

  it('warns on mild difficulty mismatch but keeps the question usable', async () => {
    const result = await validateQuestion({
      question: baseQuestion({
        stem: 'A 58-year-old man with hypertension starts lisinopril. Two weeks later he develops a persistent dry cough. Which mechanism best explains this adverse effect?',
        explanation: 'ACE inhibitors block angiotensin-converting enzyme, which normally degrades bradykinin. Increased bradykinin can cause a persistent dry cough, making bradykinin accumulation the best answer.',
      }),
      mode: 'practice',
      difficulty: 'More Easy',
      requestedScope: { subject: 'Pharmacology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(true);
    expect(result.validators.find(v => v.name === 'difficulty')?.status).toBe('warn');
  });

  it('fails extreme difficulty mismatch', async () => {
    const result = await validateQuestion({
      question: baseQuestion({
        stem: 'A 67-year-old man with chronic kidney disease, diabetes, heart failure, hyperkalemia, elevated creatinine, metabolic acidosis, and worsening dyspnea is admitted. His ECG shows peaked T waves. Urine microscopy shows muddy brown casts. After initial stabilization, multiple pathways must be integrated to determine the main mechanism of his renal injury, electrolyte abnormality, acid-base disorder, and medication vulnerability. Which integrated mechanism best explains the presentation and management priority?',
        explanation: 'This requires integrating renal perfusion, tubular injury, potassium handling, acid-base physiology, medication effects, and emergency stabilization. The correct answer follows from several linked reasoning steps rather than a single recall fact.',
      }),
      mode: 'practice',
      difficulty: 'More Easy',
      requestedScope: { subject: 'Pharmacology', system: 'Cardiovascular' },
    });

    expect(result.passed).toBe(false);
    expect(result.validators.find(v => v.name === 'difficulty')?.status).toBe('fail');
  });

  it('calculates a validation score and fails below the threshold', async () => {
    const result = await validateQuestion({
      question: baseQuestion({ subject: 'Unknownology', system: 'Unknown System' }),
      mode: 'practice',
      difficulty: 'Balanced',
      requestedScope: { subject: 'Pharmacology', system: 'Cardiovascular' },
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThan(70);
    expect(result.passed).toBe(false);
  });
});

// ── Difficulty band boundary consistency ──────────────────────────────────────
// These tests assert engine-level pass/fail at depth-boundary questions so that
// any future divergence between structural and engine validators is caught early.
// They pin the result.passed / validator status — not the internal depth score —
// because the two depth functions use different scales (see difficultyBands.ts).

describe('difficulty band boundary — engine-level results', () => {
  // A minimal 1-sentence More Easy stem (low depth on both scales)
  function easyQuestion() {
    return {
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      difficulty: 'More Easy',
      topic: 'ACE inhibitors',
      testedConcept: 'ACE inhibitor cough mechanism',
      questionAngle: 'adverse-effect',
      usmleContentArea: 'Cardiovascular System',
      physicianTask: 'Mechanism',
      stem: 'A 45-year-old man develops a persistent dry cough after starting lisinopril. Which mechanism explains this adverse effect?',
      options: [
        { letter: 'A', text: 'Bradykinin accumulation from ACE inhibition' },
        { letter: 'B', text: 'Direct bronchial irritation from the drug' },
        { letter: 'C', text: 'Reflex bronchoconstriction from blood pressure drop' },
        { letter: 'D', text: 'Histamine release from mast cell activation' },
      ],
      correct: 'A',
      explanation: 'ACE inhibitors block the breakdown of bradykinin, leading to its accumulation and causing a persistent dry cough.',
      optionExplanations: {
        A: 'Correct: bradykinin accumulates when ACE is inhibited.',
        B: 'Not the mechanism for ACE inhibitor cough.',
        C: 'Reflex bronchoconstriction is not the cause.',
        D: 'Histamine is not involved in this drug class effect.',
      },
    };
  }

  it('More Easy question with minimal depth passes the difficulty validator', async () => {
    const result = await validateQuestion({
      question: easyQuestion(),
      mode: 'practice',
      difficulty: 'More Easy',
    });

    const difficultyResult = result.validators.find(v => v.name === 'difficulty');
    // Simple 1-step question should pass or only mildly warn — never extreme fail
    expect(difficultyResult?.status).not.toBe('fail');
  });

  it('More Easy question with a very complex multi-step stem fails the difficulty check', async () => {
    const complexStem =
      'A 67-year-old man with chronic kidney disease, diabetes, heart failure, hyperkalemia, elevated creatinine, ' +
      'metabolic acidosis, and worsening dyspnea is admitted. His ECG shows peaked T waves. Urine microscopy shows ' +
      'muddy brown casts. After initial stabilization, multiple pathways must be integrated to determine the main ' +
      'mechanism of his renal injury, electrolyte abnormality, acid-base disorder, and medication vulnerability. ' +
      'Which integrated mechanism best explains the presentation and management priority?';

    const complexExplanation =
      'This requires integrating renal perfusion failure, acute tubular necrosis, potassium handling in CKD, ' +
      'metabolic acidosis compensation, ACE inhibitor risk in hyperkalemia, and emergency management of peaked T waves ' +
      'from hyperkalemia. The correct answer follows from several linked reasoning steps including tubular injury, ' +
      'renin-angiotensin system effects, potassium redistribution, and bicarbonate buffering mechanisms working together.';

    const complexResult = await validateQuestion({
      question: {
        ...easyQuestion(),
        stem: complexStem,
        explanation: complexExplanation,
      },
      mode: 'practice',
      difficulty: 'More Easy',
    });

    // Complex question should fail the engine-level difficulty gate (extreme mismatch)
    // OR fail structural (excessive_complexity_for_easy hard rejection).
    expect(complexResult.passed).toBe(false);
  });

  it('policy override requiresMedicalReview:false allows rule-based pass for NBME question', async () => {
    const nbmeQuestion = {
      subject: 'Pharmacology',
      system: 'Cardiovascular',
      difficulty: 'NBME Difficult',
      topic: 'ACE inhibitors',
      testedConcept: 'ACE inhibitor bradykinin cough mechanism',
      questionAngle: 'adverse-effect',
      usmleContentArea: 'Cardiovascular System',
      physicianTask: 'Mechanism',
      stem: 'A 58-year-old man with hypertension starts lisinopril. Two weeks later he develops a persistent dry nonproductive cough. Which mechanism explains this adverse effect?',
      options: [
        { letter: 'A', text: 'Bradykinin accumulation from ACE inhibition' },
        { letter: 'B', text: 'Beta-2 receptor activation causing bronchospasm' },
        { letter: 'C', text: 'Cyclooxygenase inhibition causing leukotriene excess' },
        { letter: 'D', text: 'Aldosterone increase causing airway edema' },
      ],
      correct: 'A',
      explanation: 'ACE inhibitors block bradykinin degradation, causing accumulation and a persistent dry cough.',
      optionExplanations: {
        A: 'Correct: bradykinin accumulates.',
        B: 'Beta-2 activation causes bronchodilation not cough.',
        C: 'COX inhibition explains aspirin-exacerbated disease, not ACE cough.',
        D: 'ACE inhibitors reduce aldosterone.',
      },
    };

    // Without policy override: medical review required but not provided → fail
    const blocked = await validateQuestion({
      question: nbmeQuestion,
      mode: 'practice',
      difficulty: 'NBME Difficult',
    });
    const mrResult = blocked.validators.find(v => v.name === 'medical_review');
    expect(mrResult?.reasons).toContain('medical_review_required_but_not_available');

    // With policy override: MR gate bypassed → rule-based result only
    const ruleOnly = await validateQuestion({
      question: nbmeQuestion,
      mode: 'practice',
      difficulty: 'NBME Difficult',
      policy: { requiresMedicalReview: false },
    });
    const mrSkipped = ruleOnly.validators.find(v => v.name === 'medical_review');
    expect(mrSkipped?.status).toBe('pass');
    expect(mrSkipped?.reasons).not.toContain('medical_review_required_but_not_available');
  });
});
