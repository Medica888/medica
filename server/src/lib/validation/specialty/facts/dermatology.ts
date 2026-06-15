import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const dermatologyFactRules: MedicalFactRule[] = [
  {
    id:       'derm_001',
    domain:   'Dermatology',
    expected: 'Pemphigus vulgaris: anti-desmoglein 1 and 3 (desmosome); INTRAEPIDERMAL blister (acantholysis); Nikolsky sign POSITIVE; flaccid bullae; IgG',
    appliesTo: [
      /\bpemphigus\s+vulgaris\b/i,
    ],
    contradictions: [
      /pemphigus\s+vulgaris.{0,40}subepidermal/i,
      /pemphigus\s+vulgaris.{0,40}nikolsky.{0,20}(negative|absent)/i,
      /pemphigus\s+vulgaris.{0,40}anti.bp\w+/i,
    ],
    requiredSupport: [/pemphigus\s+vulgaris.{0,40}(intraepidermal|desmoglein|nikolsky.{0,20}positive)/i],
    source:         'First Aid 2025 p.482; Robbins 10e p.1155',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'derm_002',
    domain:   'Dermatology',
    expected: 'Bullous pemphigoid: anti-BPAG1/BPAG2 (hemidesmosome at DEJ); SUBEPIDERMAL blister; Nikolsky sign NEGATIVE; tense bullae; elderly patients',
    appliesTo: [
      /\bbullous\s+pemphigoid\b/i,
    ],
    contradictions: [
      /bullous\s+pemphigoid.{0,40}intraepidermal/i,
      /bullous\s+pemphigoid.{0,40}nikolsky.{0,20}(positive|present)/i,
      /bullous\s+pemphigoid.{0,40}anti.desmoglein/i,
    ],
    requiredSupport: [/bullous\s+pemphigoid.{0,40}(subepidermal|hemidesmosome|nikolsky.{0,20}negative|tense)/i],
    source:         'First Aid 2025 p.482; Robbins 10e p.1156',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'derm_003',
    domain:   'Dermatology',
    expected: 'SJS/TEN most common drug causes: sulfonamides, anticonvulsants (carbamazepine, phenytoin, lamotrigine), allopurinol, nevirapine; SJS <10% BSA, TEN >30% BSA',
    appliesTo: [
      /\b(stevens.johnson|sjs|toxic\s+epidermal\s+necrolysis|ten\b).{0,40}(drug|caused|sulfa)/i,
    ],
    contradictions: [
      /sjs.{0,40}most\s+common.{0,20}penicillin/i,
      /ten.{0,40}most\s+common.{0,20}amoxicillin/i,
    ],
    source:         'First Aid 2025 p.484; UpToDate 2025',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
