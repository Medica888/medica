import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const gastroenterologyFactRules: MedicalFactRule[] = [
  {
    id:       'gi_001',
    domain:   'Gastroenterology',
    expected: 'Crohn disease: TRANSMURAL (full-thickness) inflammation, skip lesions, mouth-to-anus, non-caseating granulomas; UC: MUCOSAL only, continuous, starts in rectum',
    appliesTo: [
      /\b(crohn|ulcerative\s+colitis)\b.{0,60}(transmural|mucosal|skip|continuous)/i,
    ],
    contradictions: [
      /crohn.{0,40}mucosal\s+only/i,
      /crohn.{0,40}continuous.{0,20}(rectum|colon)/i,
      /ulcerative\s+colitis.{0,40}transmural/i,
      /ulcerative\s+colitis.{0,40}(skip\s+lesion|mouth.to.anus)/i,
    ],
    source:         'First Aid 2025 p.378; Robbins 10e p.817',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_002',
    domain:   'Gastroenterology',
    expected: 'HBV window period: only IgM anti-HBc is positive; HBsAg becomes negative before anti-HBs appears',
    appliesTo: [
      /\b(hepatitis\s+b|hbv)\b.{0,60}window/i,
      /window\s+period.{0,40}(hbv|hepatitis\s+b)/i,
    ],
    contradictions: [
      /window\s+period.{0,40}hbs\s*ag\s*(positive|present|detected)/i,
      /window\s+period.{0,40}anti.hbs\s*(positive|present|detected)/i,
    ],
    requiredSupport: [/window.{0,40}anti.hbc.{0,20}(igm|only\s+positive)/i],
    source:         'First Aid 2025 p.169; Harrison\'s 21e Ch.340',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_003',
    domain:   'Gastroenterology',
    expected: 'Wilson disease: DECREASED ceruloplasmin (copper accumulates, cannot incorporate into ceruloplasmin); ATP7B gene; Kayser-Fleischer rings',
    appliesTo: [
      /\bwilson\b.{0,60}(ceruloplasmin|copper|atp7b)/i,
    ],
    contradictions: [
      /wilson.{0,40}(high|elevated|increased|raised)\s+ceruloplasmin/i,
    ],
    requiredSupport: [/wilson.{0,40}(low|decreased|reduced)\s+ceruloplasmin/i],
    source:         'First Aid 2025 p.393; Robbins 10e p.855',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_004',
    domain:   'Gastroenterology',
    expected: 'Hemochromatosis: HFE gene mutation (C282Y most common); increased ferritin AND transferrin saturation; decreased TIBC; autosomal recessive',
    appliesTo: [
      /\bhemochromatosis\b/i,
    ],
    contradictions: [
      /hemochromatosis.{0,40}(low|decreased|reduced)\s+ferritin/i,
      /hemochromatosis.{0,40}(high|elevated|increased)\s+tibc/i,
      /hemochromatosis.{0,40}autosomal\s+dominant/i,
    ],
    requiredSupport: [/hemochromatosis.{0,40}(hfe|c282y|autosomal\s+recessive)/i],
    source:         'First Aid 2025 p.392; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_005',
    domain:   'Gastroenterology',
    expected: 'HCV: RNA virus with ~85% chronic infection rate — HIGHEST chronicity of all hepatitis viruses; HBV is DNA virus',
    appliesTo: [
      /\b(hepatitis\s+c|hcv)\b.{0,40}(dna|rna|chronic)/i,
    ],
    contradictions: [
      /hcv.{0,30}dna\s+virus/i,
      /hcv.{0,50}(rare|low\s+rate).{0,20}chronic/i,
    ],
    requiredSupport: [/hcv.{0,30}rna\s+virus/i],
    source:         'First Aid 2025 p.170',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_006',
    domain:   'Gastroenterology',
    expected: 'Barrett esophagus: intestinal metaplasia (columnar with goblet cells) in distal esophagus → risk of ADENOCARCINOMA (not squamous cell)',
    appliesTo: [
      /\bbarrett\b.{0,60}(esophagus|cancer|carcinoma|adenocarcinoma)/i,
    ],
    contradictions: [
      /barrett.{0,40}squamous\s+cell\s+carcinoma/i,
      /barrett.{0,40}scc\b/i,
    ],
    requiredSupport: [/barrett.{0,40}adenocarcinoma/i],
    source:         'First Aid 2025 p.375; Harrison\'s 21e Ch.315',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_007',
    domain:   'Gastroenterology',
    expected: 'Celiac disease antibodies: anti-tissue transglutaminase (anti-tTG IgA) most sensitive and specific; also anti-endomysial IgA; HLA-DQ2/DQ8',
    appliesTo: [
      /\b(celiac|coeliac)\b.{0,60}(antibod|anti|hla)/i,
    ],
    contradictions: [
      /celiac.{0,40}anti.gluten\b.{0,20}(most\s+specific|diagnostic)/i,
      /celiac.{0,40}anti.gliadin\b.{0,20}(most\s+specific|most\s+sensitive)/i,
    ],
    requiredSupport: [/celiac.{0,40}(anti.ttg|anti.tissue\s+transglutaminase|anti.endomysial)/i],
    source:         'First Aid 2025 p.379; Harrison\'s 21e Ch.317',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
