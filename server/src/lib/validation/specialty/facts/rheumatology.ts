import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const rheumatologyFactRules: MedicalFactRule[] = [
  {
    id:       'msk_001',
    domain:   'Rheumatology',
    expected: 'RA: anti-CCP (anti-cyclic citrullinated peptide) most SPECIFIC; DIP joints SPARED; symmetric proximal joint involvement (MCP, PIP); morning stiffness >1 hour',
    appliesTo: [
      /\b(rheumatoid\s+arthritis|ra\b).{0,60}(dip|distal|anti.ccp|joint)/i,
    ],
    contradictions: [
      /rheumatoid\s+arthritis.{0,40}dip\s+(involv|affect)/i,
      /ra.{0,30}dip\s+(involv|affect)/i,
    ],
    source:         'First Aid 2025 p.461; Harrison\'s 21e Ch.351',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_002',
    domain:   'Rheumatology',
    expected: 'Gout crystals: NEGATIVELY birefringent, needle-shaped monosodium urate (MSU); Pseudogout (CPPD): WEAKLY POSITIVELY birefringent, rhomboid-shaped',
    appliesTo: [
      /\b(gout|pseudogout|cppd)\b.{0,60}(birefringent|crystal|polariz)/i,
    ],
    contradictions: [
      /gout.{0,40}(positive|weakly\s+positive)\s+birefringent/i,
      /gout.{0,40}rhomboid.{0,20}crystal/i,
      /pseudogout.{0,40}negative\s+birefringent/i,
      /pseudogout.{0,40}needle.shape/i,
    ],
    source:         'First Aid 2025 p.462; Harrison\'s 21e Ch.355',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_003',
    domain:   'Rheumatology',
    expected: 'Marfan syndrome lens dislocation: SUPEROTEMPORAL (upward and outward); Homocystinuria lens dislocation: INFEROMEDIAL (downward and inward)',
    appliesTo: [
      /\b(marfan|homocystinuria)\b.{0,60}(lens\s+disloc|ectopia\s+lentis)/i,
    ],
    contradictions: [
      /marfan.{0,40}lens.{0,20}(inferomedial|downward|inferior)/i,
      /homocystinuria.{0,40}lens.{0,20}(superotemporal|upward|superior)/i,
    ],
    source:         'First Aid 2025 p.57; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_004',
    domain:   'Rheumatology',
    expected: 'Systemic sclerosis: diffuse form → anti-Scl-70 (anti-topoisomerase I); limited form/CREST → anti-centromere antibody',
    appliesTo: [
      /\b(systemic\s+sclerosis|scleroderma|crest)\b.{0,60}(anti|antibod)/i,
    ],
    contradictions: [
      /diffuse\s+scleroderma.{0,40}anti.centromere/i,
      /crest.{0,40}anti.scl.?70/i,
      /limited.{0,20}scleroderma.{0,40}anti.scl.?70/i,
    ],
    source:         'First Aid 2025 p.468; Harrison\'s 21e Ch.354',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_005',
    domain:   'Rheumatology',
    expected: 'Sjögren syndrome: anti-Ro/SSA (more common) and anti-La/SSB antibodies; increased risk of B-cell lymphoma; sicca complex (dry eyes + dry mouth)',
    appliesTo: [
      /\bsjogren\b.{0,60}(antibod|anti|lymphoma)/i,
    ],
    contradictions: [
      /sjogren.{0,40}anti.ds.?dna.{0,20}(specific|diagnostic)/i,
      /sjogren.{0,40}anti.centromere.{0,20}(specific|diagnostic)/i,
    ],
    requiredSupport: [/sjogren.{0,40}(anti.ro|ssa|anti.la|ssb)/i],
    source:         'First Aid 2025 p.468; Harrison\'s 21e Ch.353',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
