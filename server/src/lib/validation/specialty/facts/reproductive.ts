import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const reproductiveFactRules: MedicalFactRule[] = [
  {
    id:       'repro_001',
    domain:   'Reproductive',
    expected: 'Turner syndrome: 45,XO; short stature, webbed neck, coarctation of aorta, streak ovaries, primary amenorrhea, shield chest',
    appliesTo: [
      /\bturner\b.{0,60}(chromosome|45|karyotype|x[o0])/i,
    ],
    contradictions: [
      /turner.{0,40}(47|trisomy|extra\s+chromosome)/i,
      /turner.{0,40}47.{0,10}xx/i,
    ],
    requiredSupport: [/turner.{0,40}(45\s*[,\s]*xo|45\s*x\b)/i],
    source:         'First Aid 2025 p.616; Harrison\'s 21e Ch.398',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'repro_002',
    domain:   'Reproductive',
    expected: 'Klinefelter syndrome: 47,XXY; ELEVATED FSH and LH (hypergonadotropic hypogonadism); DECREASED testosterone; small testes; gynecomastia; tall stature',
    appliesTo: [
      /\bklinefelter\b.{0,60}(fsh|lh|testosterone|hypogonadism)/i,
    ],
    contradictions: [
      /klinefelter.{0,40}(low|decreased|suppressed)\s+(fsh|lh)/i,
      /klinefelter.{0,40}(high|elevated|raised)\s+testosterone/i,
    ],
    source:         'First Aid 2025 p.617; Harrison\'s 21e Ch.399',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'repro_003',
    domain:   'Reproductive',
    expected: 'Complete hydatidiform mole: 46,XX with ALL paternal chromosomes (androgenetic); no fetal parts; markedly elevated β-hCG; snowstorm on ultrasound',
    appliesTo: [
      /\b(complete\s+mole|complete\s+hydatidiform\s+mole)\b/i,
    ],
    contradictions: [
      /complete\s+mole.{0,40}(partial\s+maternal|maternal\s+and\s+paternal|biparental)/i,
      /complete\s+mole.{0,40}(fetal\s+parts?|fetal\s+tissue)/i,
      /complete\s+mole.{0,40}69.{0,10}(xxy|xxx)/i,
    ],
    requiredSupport: [/complete\s+mole.{0,40}(all\s+paternal|46\s*,?\s*xx\s*paternal|androgenetic)/i],
    source:         'First Aid 2025 p.621; Robbins 10e p.1066',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'repro_004',
    domain:   'Reproductive',
    expected: 'MgSO4 in preeclampsia is for SEIZURE PROPHYLAXIS — NOT an antihypertensive agent; first-line antihypertensives are labetalol, hydralazine, or nifedipine',
    appliesTo: [
      /\b(preeclampsia|eclampsia)\b.{0,60}(mgso4|magnesium\s+sulfate)/i,
    ],
    contradictions: [
      /mgso4.{0,40}preeclampsia.{0,40}(antihypertensive|lower\s+blood\s+pressure|bp\s+control)/i,
      /magnesium.{0,40}preeclampsia.{0,40}antihypertensive/i,
    ],
    requiredSupport: [/mgso4.{0,40}(seizure|convulsion|eclampsia\s+prophylaxis)/i],
    source:         'First Aid 2025 p.618; ACOG Preeclampsia Guidelines',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
