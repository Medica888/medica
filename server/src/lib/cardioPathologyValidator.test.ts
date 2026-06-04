/**
 * Cardiovascular Pathology Validator Tests
 *
 * All test fixtures are original synthetic vignettes written to exercise the
 * concept-level rules. No screenshot question text is reproduced here.
 */

import { describe, it, expect } from 'vitest';
import { validateCardiovascularPathology, type SpecialtyQuestionInput } from './cardioPathologyValidator.js';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeOptions(texts: string[]) {
  return texts.map((text, i) => ({ letter: 'ABCD'[i] as string, text }));
}

function q(
  stem: string,
  options: string[],
  correctIndex: number,
  overrides: Partial<SpecialtyQuestionInput> = {},
): SpecialtyQuestionInput {
  return {
    stem,
    options: makeOptions(options),
    correct: 'ABCD'[correctIndex],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Buerger disease / thromboangiitis obliterans
// ══════════════════════════════════════════════════════════════════════════════

describe('Buerger disease', () => {
  it('pass — young smoker with distal ischemia, correct answer is thrombosing vasculitis', () => {
    const result = validateCardiovascularPathology(q(
      'A 35-year-old man with a 15 pack-year smoking history presents with painful ulcers on his fingertips and bilateral foot claudication. He has no diabetes or hyperlipidemia. Biopsy of an affected vessel shows an organizing thrombus with acute inflammation. What is the most characteristic microscopic finding for this condition?',
      [
        'Segmental thrombosing vasculitis involving arteries, contiguous veins, and nerves',
        'Lipid-laden intimal plaque with foam cells and fibrous cap',
        'Granulomatous inflammation with internal elastic lamina fragmentation',
        'Hyperplastic arteriolosclerosis with onion-skin laminated thickening',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('buerger_disease');
    expect(result.score).toBeGreaterThan(0.6);
    expect(result.rejectionReasons).toHaveLength(0);
  });

  it('fail — Buerger clues present but correct answer is wrong mechanism (granulomatous)', () => {
    const result = validateCardiovascularPathology(q(
      'A 38-year-old male with a heavy tobacco history presents with painful toe ulcers and migratory superficial thrombophlebitis. He has no cardiovascular risk factors. Biopsy of a digital vessel is performed. What microscopic finding is most characteristic?',
      [
        'Granulomatous inflammation of the vessel media with giant cells',
        'Segmental thrombosing vasculitis with organizing thrombus',
        'Lipid-laden intimal plaque with fibrous cap',
        'Fibrinoid necrosis with transmural inflammation',
      ],
      0,  // "granulomatous inflammation" — wrong for Buerger
    ));
    expect(result.status).toBe('fail');
    expect(result.matchedConcept).toBe('buerger_disease');
    expect(result.rejectionReasons.length).toBeGreaterThan(0);
    expect(result.rejectionReasons.join(' ')).toMatch(/inconsistent|mechanism|wrong/i);
  });

  it('warn — Buerger clues partially match (distal ischemia present but no smoking mentioned)', () => {
    const result = validateCardiovascularPathology(q(
      'A 32-year-old man presents with painful digital ulcers on three toes and episodic migratory thrombophlebitis in the lower extremities. He has no diabetes or hyperlipidemia. Biopsy shows an organizing thrombus with acute inflammation involving the artery and adjacent vein. What is the most characteristic finding?',
      [
        'Segmental thrombosing vasculitis with contiguous nerve involvement',
        'Lipid-laden intimal plaque with foam cells',
        'Hyperplastic arteriolosclerosis with onion-skin thickening',
        'Granulomatous media inflammation with giant cells',
      ],
      0,
    ));
    // Smoking not mentioned → should warn (missing required smoking clue)
    expect(result.status).toBe('warn');
    expect(result.matchedConcept).toBe('buerger_disease');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('pass (atherosclerosis) — elderly diabetic with claudication should NOT match Buerger, and correct atherosclerosis answer should pass', () => {
    const result = validateCardiovascularPathology(q(
      'A 68-year-old man with type 2 diabetes and hyperlipidemia presents with bilateral calf claudication. He has a 40 pack-year smoking history. Angiography shows diffuse narrowing of the femoral arteries. Biopsy of the lesion shows lipid-laden intimal plaque with foam cells. What is the underlying pathology?',
      [
        'Lipid-laden intimal plaque with foam cells and fibrous cap',
        'Segmental thrombosing vasculitis involving arteries and veins',
        'Granulomatous inflammation of vessel media',
        'Fibrinoid necrosis with transmural inflammation',
      ],
      0,
    ));
    // Must NOT fail on Buerger — correct answer positively matches atherosclerosis
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('atherosclerosis');
    expect(result.rejectionReasons).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Giant cell arteritis
// ══════════════════════════════════════════════════════════════════════════════

describe('Giant cell arteritis', () => {
  it('pass — elderly patient with jaw claudication and correct granulomatous answer', () => {
    const result = validateCardiovascularPathology(q(
      'A 72-year-old woman presents with a 3-week history of right temporal headache, jaw claudication, and sudden vision loss in the right eye. ESR is markedly elevated. Biopsy of the temporal artery is performed. What is the most characteristic microscopic finding?',
      [
        'Granulomatous inflammation with giant cells and fragmentation of the internal elastic lamina',
        'Fibrinoid necrosis with transmural neutrophilic inflammation',
        'Lipid-laden intimal plaque with foam cells',
        'Hyperplastic arteriolosclerosis with onion-skin thickening',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('giant_cell_arteritis');
    expect(result.score).toBeGreaterThan(0.6);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Polyarteritis nodosa
// ══════════════════════════════════════════════════════════════════════════════

describe('Polyarteritis nodosa (PAN)', () => {
  it('pass — medium-vessel vasculitis with hepatitis B, fibrinoid necrosis answer', () => {
    const result = validateCardiovascularPathology(q(
      'A 45-year-old man with a history of hepatitis B infection presents with hypertension, mononeuritis multiplex, and abdominal pain. Angiography shows multiple microaneurysms in the mesenteric and renal arteries. Lung involvement is absent. Biopsy of an affected artery reveals the characteristic pathology. What is most likely seen on microscopy?',
      [
        'Segmental fibrinoid necrosis with transmural neutrophilic inflammation of medium arteries',
        'Granulomatous inflammation with giant cells and internal elastic lamina disruption',
        'Hyperplastic arteriolosclerosis with concentric laminar thickening',
        'Foam cell–laden intimal plaque with fibrous cap',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('polyarteritis_nodosa');
    expect(result.score).toBeGreaterThan(0.5);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Atherosclerosis
// ══════════════════════════════════════════════════════════════════════════════

describe('Atherosclerosis', () => {
  it('pass — typical risk factors with intimal plaque/foam cell answer', () => {
    const result = validateCardiovascularPathology(q(
      'A 62-year-old man with a 20-year history of type 2 diabetes, hyperlipidemia, and hypertension presents with exertional chest pain. Coronary angiography shows a 70% stenosis of the left anterior descending artery. A biopsy of the lesion is obtained. What is the most likely microscopic finding?',
      [
        'Lipid-laden intimal plaque with foam cells, cholesterol clefts, and a fibrous cap',
        'Fibrinoid necrosis with transmural inflammation of the coronary wall',
        'Granulomatous arteritis with giant cells and elastic lamina fragmentation',
        'Concentric onion-skin arteriolar thickening with smooth muscle proliferation',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('atherosclerosis');
    expect(result.rejectionReasons).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Malignant hypertension — onion-skin pathology
// ══════════════════════════════════════════════════════════════════════════════

describe('Malignant hypertension vascular pathology', () => {
  it('pass — severe hypertension with papilledema, onion-skin arteriolar answer', () => {
    const result = validateCardiovascularPathology(q(
      'A 51-year-old man presents to the emergency department with a blood pressure of 240/130 mmHg, severe headache, and bilateral papilledema. Serum creatinine is 4.2 mg/dL, elevated from a baseline of 0.9 mg/dL six months ago. What is the most characteristic histologic finding in the arterioles of the kidney?',
      [
        'Hyperplastic arteriolosclerosis with concentric onion-skin laminar smooth muscle thickening',
        'Lipid-laden intimal plaque with foam cells and cholesterol clefts',
        'Granulomatous inflammation with internal elastic lamina disruption',
        'Segmental transmural fibrinoid necrosis of medium-sized arteries',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('malignant_hypertension');
    expect(result.score).toBeGreaterThan(0.5);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// not_applicable cases
// ══════════════════════════════════════════════════════════════════════════════

describe('not_applicable — non-cardiovascular-pathology questions', () => {
  it('not_applicable — renal pathology question (nephrotic syndrome, podocyte effacement)', () => {
    const result = validateCardiovascularPathology(q(
      'A 6-year-old boy presents with periorbital edema and proteinuria of 8 g/day. Serum albumin is 1.8 g/dL. Electron microscopy of the kidney biopsy shows diffuse podocyte foot process effacement with no immune deposits. What is the most likely diagnosis?',
      [
        'Minimal change disease',
        'Focal segmental glomerulosclerosis',
        'Membranous nephropathy',
        'IgA nephropathy',
      ],
      0,
      { subject: 'Pathology', system: 'Renal' },
    ));
    expect(result.status).toBe('not_applicable');
    expect(result.matchedConcept).toBeNull();
  });

  it('not_applicable — generic cardiology physiology question (cardiac output regulation)', () => {
    const result = validateCardiovascularPathology(q(
      'A 28-year-old healthy man undergoes exercise stress testing. As his heart rate increases from 70 to 130 beats per minute, cardiac output increases substantially. Which of the following best explains the increased cardiac output during moderate aerobic exercise?',
      [
        'Increased heart rate with maintained stroke volume via Frank-Starling mechanism',
        'Decreased systemic vascular resistance leading to increased venous return',
        'Sympathetic activation increasing contractility and heart rate',
        'Increased end-diastolic volume due to enhanced venous return',
      ],
      2,
    ));
    expect(result.status).toBe('not_applicable');
    expect(result.matchedConcept).toBeNull();
  });

  it('not_applicable — pharmacology question (beta-blockers for hypertension)', () => {
    const result = validateCardiovascularPathology(q(
      'A 55-year-old man with hypertension and a recent myocardial infarction is started on a new medication. Which of the following best describes the primary mechanism of action of beta-1 selective adrenergic receptor antagonists in reducing cardiac afterload?',
      [
        'Competitive inhibition of beta-1 receptors reducing heart rate and myocardial contractility',
        'Direct vasodilation of peripheral arteries lowering systemic vascular resistance',
        'Inhibition of aldosterone release reducing sodium and water retention',
        'Blockade of calcium channels preventing vascular smooth muscle contraction',
      ],
      0,
    ));
    expect(result.status).toBe('not_applicable');
    expect(result.matchedConcept).toBeNull();
  });

  it('not_applicable — clinical diagnosis question about MI (no histology task)', () => {
    // This fixture mirrors what exists in questionValidator.test.ts — must not trigger cardio-path validation
    const result = validateCardiovascularPathology(q(
      'A 55-year-old man presents with crushing substernal chest pain radiating to the left arm for 40 minutes. ECG shows 3mm ST elevation in leads II, III, and aVF. Troponin is markedly elevated. What is the most likely diagnosis?',
      [
        'Myocardial infarction',
        'Pulmonary embolism',
        'Aortic dissection',
        'Pericarditis',
      ],
      0,
    ));
    // Diagnosis question, no histology task language → not_applicable
    expect(result.status).toBe('not_applicable');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Additional edge cases
// ══════════════════════════════════════════════════════════════════════════════

describe('edge cases', () => {
  it('Kawasaki disease — pass with pediatric fever and coronary aneurysm answer', () => {
    const result = validateCardiovascularPathology(q(
      'A 4-year-old boy has had fever for 6 days accompanied by bilateral conjunctivitis, a strawberry tongue, a diffuse maculopapular rash, and cervical lymphadenopathy. An echocardiogram shows fusiform dilation of the proximal left coronary artery. Which of the following is the most characteristic complication of this condition?',
      [
        'Coronary artery aneurysm due to medium-vessel vasculitis',
        'Granulomatous inflammation of large-vessel walls with internal elastic lamina disruption',
        'Fibrinoid necrosis of medium arteries with transmural inflammation',
        'Onion-skin arteriolar thickening with smooth muscle hyperplasia',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('kawasaki_disease');
  });

  it('MI timeline — pass when explicit time and histology task specified', () => {
    const result = validateCardiovascularPathology(q(
      'A 62-year-old man dies 5 days after a myocardial infarction. Autopsy is performed. What cells would you most likely expect to see on histologic examination of the infarcted myocardium at this time point?',
      [
        'Macrophages and beginning granulation tissue formation',
        'Abundant neutrophils with coagulative necrosis of myocytes',
        'Dense fibrosis with collagen deposition and minimal cellularity',
        'Normal-appearing cardiomyocytes with preserved architecture',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('mi_timeline');
  });

  it('Rheumatic heart disease — pass with Aschoff body answer', () => {
    const result = validateCardiovascularPathology(q(
      'A 19-year-old woman presents with migratory polyarthritis and a new pansystolic murmur 3 weeks after an episode of streptococcal pharyngitis. Echocardiography shows mitral regurgitation. Biopsy of the myocardium shows characteristic inflammatory nodules. What is the most likely histologic finding?',
      [
        'Aschoff bodies composed of fibrinoid necrosis surrounded by Anitschkow cells',
        'Granulomatous inflammation with giant cells and internal elastic lamina disruption',
        'Lipid-laden intimal plaque with cholesterol clefts',
        'Large friable vegetations on the valve leaflets with neutrophilic infiltration',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('rheumatic_heart_disease');
  });

  it('Takayasu arteritis — pass with young woman and pulseless disease', () => {
    const result = validateCardiovascularPathology(q(
      'A 24-year-old woman presents with exertional pain in her left arm and absent radial pulse on the left side. Blood pressure is 140/90 mmHg in the right arm and 90/60 mmHg in the left arm. MRA shows stenosis of the left subclavian artery just beyond the aortic arch. Biopsy of the vessel wall shows panarteritis with granulomatous inflammation. What is the most characteristic microscopic finding?',
      [
        'Granulomatous large-vessel panarteritis with adventitial fibrosis and intimal hyperplasia',
        'Segmental fibrinoid necrosis with transmural neutrophilic infiltration',
        'Lipid-laden intimal plaque with foam cells and fibrous cap',
        'Onion-skin concentric thickening of arteriolar walls',
      ],
      0,
    ));
    expect(result.status).toBe('pass');
    expect(result.matchedConcept).toBe('takayasu_arteritis');
  });

  it('returns not_applicable for a question with no cardiovascular pathology signals', () => {
    const result = validateCardiovascularPathology(q(
      'A 45-year-old woman with rheumatoid arthritis and renal insufficiency presents with progressive dyspnea. Which drug class is most likely responsible for a dry persistent cough in this patient?',
      [
        'ACE inhibitors',
        'Beta blockers',
        'Calcium channel blockers',
        'Loop diuretics',
      ],
      0,
    ));
    expect(result.status).toBe('not_applicable');
    expect(result.matchedConcept).toBeNull();
    expect(result.rejectionReasons).toHaveLength(0);
  });

  it('specialty field is always cardiovascular_pathology', () => {
    const r1 = validateCardiovascularPathology(q('Simple non-cardio question', ['A', 'B', 'C', 'D'], 0));
    expect(r1.specialty).toBe('cardiovascular_pathology');
    const r2 = validateCardiovascularPathology(q(
      'A 38-year-old smoker with toe ulcers and thrombophlebitis. Microscopy shows thrombosing vasculitis.',
      ['Segmental thrombosing vasculitis involving arteries and contiguous veins', 'Foam cells', 'Giant cells', 'Fibrinoid necrosis'],
      0,
    ));
    expect(r2.specialty).toBe('cardiovascular_pathology');
  });

  it('score is always between 0 and 1', () => {
    const fixtures = [
      q('Cardiac output physiology question about Frank-Starling mechanism', ['A', 'B', 'C', 'D'], 0),
      q(
        'A 35-year-old smoker with painful toe ulcers. Biopsy shows thrombosing vasculitis. What is the finding?',
        ['Segmental thrombosing vasculitis involving arteries and nerves', 'Foam cells', 'Giant cells', 'Fibrinoid necrosis'],
        0,
      ),
    ];
    for (const f of fixtures) {
      const r = validateCardiovascularPathology(f);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
