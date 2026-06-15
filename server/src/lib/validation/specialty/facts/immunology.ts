import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const immunologyFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'immunology_sle_anti_dsdna_smith',
    domain: 'Immunology',
    expected: 'Systemic lupus erythematosus: immune-complex disease associated with anti-dsDNA and anti-Smith antibodies',
    appliesTo: [/\b(systemic\s+lupus|sle\b|anti[-\s]?dsdna|anti[-\s]?smith|malar\s+rash|lupus\s+nephritis)\b/i],
    contradictions: [/\b(anti[-\s]?centromere|anti[-\s]?topoisomerase|anti[-\s]?mitochondrial|p[-\s]?anca|c[-\s]?anca)\b/i],
    requiredSupport: [/\b(anti[-\s]?dsdna|anti[-\s]?smith|immune\s+complex|malar|photosensitivity|lupus\s+nephritis)\b/i],
  }),

  {
    id:       'immuno_001',
    domain:   'Immunology',
    expected: 'Type IV hypersensitivity (delayed): T-CELL mediated, not antibody-mediated; delayed 24–72 hours; examples: TB test, contact dermatitis, transplant rejection, granulomas',
    appliesTo: [
      /type\s+(iv|4|four)\s+hypersensitiv/i,
      /delayed.type\s+hypersensitiv/i,
    ],
    contradictions: [
      /type\s+(iv|4|four)\s+hypersensitiv.{0,40}(igE|igG|antibody.mediat|mast\s+cell)/i,
      /delayed\s+hypersensitiv.{0,40}antibody.mediat/i,
    ],
    requiredSupport: [/type\s+(iv|4).{0,40}t.cell\s+mediat/i],
    source:         'First Aid 2025 p.107; Robbins 10e Ch.5',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'immuno_002',
    domain:   'Immunology',
    expected: 'DiGeorge syndrome: 22q11.2 DELETION; absent thymus (T-cell deficiency) + absent parathyroids (hypocalcemia); conotruncal heart defects',
    appliesTo: [
      /\b(digeorge|velocardio|22q11)\b/i,
    ],
    contradictions: [
      /digeorge.{0,40}(chromosome\s*(7|11|9|x)|[^2]2q11|21q|22p)/i,
      /digeorge.{0,40}b.cell\s+deficien/i,
    ],
    requiredSupport: [/digeorge.{0,40}22q11/i],
    source:         'First Aid 2025 p.113; Harrison\'s 21e Ch.345',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'immuno_003',
    domain:   'Immunology',
    expected: 'Bruton agammaglobulinemia (XLA): BTK gene mutation; X-linked recessive; ABSENT B cells; no immunoglobulins; presents after 6 months when maternal IgG wanes',
    appliesTo: [
      /\b(bruton|xla|btk)\b.{0,60}(b.cell|immunoglobulin|agammaglobulinemia)/i,
    ],
    contradictions: [
      /bruton.{0,40}t.cell\s+(deficien|absent|lack)/i,
      /bruton.{0,40}normal\s+b.cell/i,
      /bruton.{0,40}autosomal\s+(dominant|recessive)/i,
    ],
    requiredSupport: [/bruton.{0,40}(btk|x.linked|absent\s+b.cell)/i],
    source:         'First Aid 2025 p.113; Harrison\'s 21e Ch.345',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'immuno_004',
    domain:   'Immunology',
    expected: 'SLE: anti-dsDNA most specific for DISEASE ACTIVITY and lupus nephritis; anti-Smith most specific for SLE overall; ANA most sensitive (screening)',
    appliesTo: [
      /\b(sle|systemic\s+lupus)\b.{0,60}(anti.ds.?dna|anti.smith|ana\b)/i,
    ],
    contradictions: [
      /sle.{0,40}anti.smith.{0,20}(disease\s+activity|nephritis|most\s+active)/i,
      /sle.{0,40}ana\b.{0,20}(specific|most\s+specific)/i,
    ],
    requiredSupport: [
      /sle.{0,40}anti.ds.?dna.{0,30}(activity|nephritis|specific\s+for\s+activity)/i,
    ],
    source:         'First Aid 2025 p.467; Harrison\'s 21e Ch.349',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
