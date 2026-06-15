import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const pharmacologyFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'pharmacology_lithium_toxicity',
    domain: 'Pharmacology',
    expected: 'Lithium toxicity: tremor, nephrogenic diabetes insipidus, hypothyroidism, and Ebstein anomaly risk',
    appliesTo: [/\b(lithium|bipolar\s+maintenance|nephrogenic\s+diabetes\s+insipidus|ebstein)\b/i],
    contradictions: [/\b(serotonin\s+reuptake|d2\s+blockade|gaba[-\s]?a|irreversible\s+mao|safe\s+in\s+pregnancy)\b/i],
    requiredSupport: [/\b(nephrogenic\s+diabetes\s+insipidus|tremor|hypothyroid|ebstein)\b/i],
  }),

  defineRule({
    id: 'pharmacology_digoxin_toxicity',
    domain: 'Pharmacology',
    expected: 'Digoxin toxicity: Na/K ATPase inhibition with increased intracellular calcium; toxicity may cause visual changes and arrhythmias',
    appliesTo: [/\b(digoxin|cardiac\s+glycoside|na\/k\s+atpase|yellow\s+vision)\b/i],
    contradictions: [/\b(beta[-\s]?1\s+blockade|calcium\s+channel\s+blockade|ace\s+inhibition|sodium\s+channel\s+blockade\s+only)\b/i],
    requiredSupport: [/\b(na\/k\s+atpase|intracellular\s+calcium|yellow\s+vision|arrhythmia)\b/i],
  }),

  {
    id:       'pharm_001',
    domain:   'Pharmacology',
    expected: 'Thiazide diuretics cause HYPERCALCEMIA (increase DCT calcium reabsorption); Loop diuretics (furosemide) cause HYPOCALCEMIA',
    appliesTo: [
      /\b(thiazide|hctz|hydrochlorothiazide)\b.{0,60}(calcium|calciur)/i,
      /\b(furosemide|loop\s+diuretic)\b.{0,60}(calcium|calciur)/i,
    ],
    contradictions: [
      /thiazide.{0,40}(hypocalcemia|low\s+calcium|decreased\s+calcium)/i,
      /furosemide.{0,40}(hypercalcemia|elevated\s+calcium|increased\s+calcium)/i,
      /loop\s+diuretic.{0,40}hypercalcemia/i,
    ],
    source:         'First Aid 2025 p.614; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_002',
    domain:   'Pharmacology',
    expected: 'ACE inhibitor cough is caused by BRADYKININ accumulation (not angiotensin II); ARBs have no cough because they do not affect bradykinin',
    appliesTo: [
      /\b(ace\s+inhibitor|acei|captopril|lisinopril|enalapril)\b.{0,60}(cough|bradykinin)/i,
    ],
    contradictions: [
      /ace\s+inhibitor.{0,40}cough.{0,40}angiotensin\s+ii\b/i,
      /acei.{0,40}cough.{0,40}caused\s+by\s+angiotensin/i,
    ],
    requiredSupport: [/ace\s+inhibitor.{0,40}cough.{0,40}bradykinin/i],
    source:         'First Aid 2025 p.316; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_003',
    domain:   'Pharmacology',
    expected: 'Heparin reversal: PROTAMINE SULFATE; Warfarin reversal: Vitamin K (slow) or FFP/PCC (fast); these agents are NOT interchangeable',
    appliesTo: [
      /\b(heparin|warfarin)\b.{0,60}reversal/i,
      /revers.{0,30}(heparin|warfarin)/i,
    ],
    contradictions: [
      /heparin.{0,40}revers.{0,30}(vitamin\s+k|warfarin)/i,
      /warfarin.{0,40}revers.{0,30}protamine/i,
    ],
    requiredSupport: [
      /heparin.{0,40}protamine/i,
      /warfarin.{0,40}(vitamin\s+k|ffp|pcc)/i,
    ],
    source:         'First Aid 2025 p.420; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_004',
    domain:   'Pharmacology',
    expected: 'Aspirin: IRREVERSIBLE COX-1/COX-2 inhibitor (covalent acetylation); platelet effect lasts 7–10 days (platelet lifespan); NSAIDs are reversible competitive inhibitors',
    appliesTo: [
      /\baspirin\b.{0,60}(irrevers|reversible|cox|platelet|lifespan)/i,
    ],
    contradictions: [
      /aspirin.{0,40}reversible\s+(cox|inhibit)/i,
      /nsaid.{0,40}irreversible\s+(cox|inhibit)/i,
    ],
    requiredSupport: [/aspirin.{0,40}irreversible/i],
    source:         'First Aid 2025 p.483; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_005',
    domain:   'Pharmacology',
    expected: 'Aminoglycosides: nephrotoxicity (synergistic with vancomycin) + ototoxicity (sensorineural hearing loss); NOT primarily hepatotoxic; monitor peak/trough levels',
    appliesTo: [
      /\b(aminoglycoside|gentamicin|tobramycin|amikacin)\b.{0,60}(toxicity|ototoxic|nephrotoxic)/i,
    ],
    contradictions: [
      /aminoglycoside.{0,40}hepatotoxic.{0,20}(primary|main|most\s+common)/i,
      /aminoglycoside.{0,40}ototoxic.{0,20}conductive/i,
    ],
    requiredSupport: [/aminoglycoside.{0,40}(ototoxic|nephrotoxic|sensorineural)/i],
    source:         'First Aid 2025 p.191; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_006',
    domain:   'Pharmacology',
    expected: 'Vancomycin "Red Man Syndrome": NOT an IgE-mediated allergic reaction; rate-related direct mast cell/basophil degranulation → histamine release; treat by slowing infusion rate',
    appliesTo: [
      /\b(vancomycin|red\s+man\s+syndrome)\b.{0,60}(allerg|iGe|histamine|reaction)/i,
    ],
    contradictions: [
      /red\s+man.{0,40}(ige.mediat|type\s+i\s+hypersensitiv|allerg\w*\s+reaction)/i,
      /red\s+man.{0,40}(anaphylactic|anaphylaxis)/i,
    ],
    source:         'First Aid 2025 p.192; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_007',
    domain:   'Pharmacology',
    expected: 'Metformin: biguanide; DECREASES hepatic gluconeogenesis; does NOT cause hypoglycemia alone; risk of lactic acidosis (hold before contrast dye, contraindicated in renal failure)',
    appliesTo: [
      /\bmetformin\b.{0,60}(mechanism|gluconeogenesis|lactic\s+acidosis|renal)/i,
    ],
    contradictions: [
      /metformin.{0,40}(increase|stimulate).{0,20}(insulin\s+secretion|insulin\s+release)/i,
      /metformin.{0,40}sulfonylurea.{0,20}(same|similar)\s+mechanism/i,
    ],
    requiredSupport: [/metformin.{0,40}(hepatic\s+gluconeogenesis|decrease\s+glucose\s+production)/i],
    source:         'First Aid 2025 p.356; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
