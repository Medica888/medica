import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const renalFactRules: MedicalFactRule[] = [
  {
    id:       'renal_001',
    domain:   'Renal',
    expected: 'Minimal change disease: most common nephrotic syndrome in CHILDREN; foot-process effacement on EM; steroid-responsive',
    appliesTo: [
      /minimal\s+change\s+disease/i,
      /\bmcd\b.{0,30}(nephrotic|children|podocyte)/i,
    ],
    contradictions: [
      /minimal\s+change.{0,40}most\s+common.{0,30}adult/i,
      /minimal\s+change.{0,40}(spike\s+and\s+dome|thickened\s+gbm|subepithelial\s+deposit)/i,
      /minimal\s+change.{0,40}(immune\s+complex|mesangial\s+iga)/i,
    ],
    requiredSupport: [
      /minimal\s+change.{0,40}(child|podocyte|foot.process|steroid)/i,
    ],
    source:         'First Aid 2025 p.557; Robbins 10e p.887',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'renal_002',
    domain:   'Renal',
    expected: 'Type 1 (distal) RTA: inability to acidify urine → urine pH >5.5; HYPOKALEMIA; calcium phosphate stones; amphotericin B is classic cause',
    appliesTo: [
      /type\s+(1|i|one)\s+rta|distal\s+rta/i,
      /rta.{0,30}(type\s+[1i]|distal)/i,
    ],
    contradictions: [
      /type\s+(1|i|one)\s+rta.{0,40}hyperkalem/i,
      /distal\s+rta.{0,40}hyperkalem/i,
    ],
    requiredSupport: [/(distal|type\s+[1i]).{0,30}rta.{0,30}hypokalem/i],
    source:         'First Aid 2025 p.577; Harrison\'s 21e Ch.309',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'renal_003',
    domain:   'Renal',
    expected: 'Type 4 RTA (hypoaldosteronism): HYPERKALEMIA — opposite of Type 1 and Type 2 RTA which cause hypokalemia',
    appliesTo: [
      /type\s+(4|iv|four)\s+rta|type\s+4\s+renal\s+tubular/i,
    ],
    contradictions: [
      /type\s+(4|iv|four)\s+rta.{0,40}hypokalem/i,
    ],
    requiredSupport: [/type\s+(4|iv|four).{0,30}rta.{0,30}hyperkalem/i],
    source:         'First Aid 2025 p.577',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'renal_004',
    domain:   'Renal',
    expected: 'IgA nephropathy: hematuria occurs WITHIN 1–2 DAYS of URI; PSGN: hematuria occurs 2–3 WEEKS after strep infection',
    appliesTo: [
      /\b(iga\s+nephropathy|berger\s+disease)\b/i,
      /\bpsgn\b|post.streptococ.{0,20}nephritis/i,
    ],
    contradictions: [
      /iga\s+nephropathy.{0,40}(weeks?\s+after|2.3\s+week)/i,
      /psgn.{0,40}(days?\s+after|during\s+uri|concurrent\s+with)/i,
    ],
    source:         'First Aid 2025 p.558; Robbins 10e p.892',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'renal_005',
    domain:   'Renal',
    expected: 'ADPKD: PKD1 gene on CHROMOSOME 16 (~85% of cases); PKD2 on chromosome 4; associated with berry aneurysms and hepatic cysts',
    appliesTo: [
      /\badpkd\b|autosomal\s+dominant.{0,20}(polycystic|pkd)/i,
    ],
    contradictions: [
      /adpkd.{0,30}pkd1.{0,20}(chr|chromosome)\s*(4|22|x|9)/i,
      /adpkd.{0,30}(chr|chromosome)\s*4.{0,20}pkd1/i,
    ],
    requiredSupport: [/pkd1.{0,30}(chr|chromosome)\s*16/i],
    source:         'First Aid 2025 p.574; Harrison\'s 21e Ch.315',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'renal_006',
    domain:   'Renal',
    expected: 'Nephrotic syndrome criteria: proteinuria >3.5 g/day, hypoalbuminemia, edema, hyperlipidemia; RBC casts indicate NEPHRITIC (not nephrotic)',
    appliesTo: [
      /\bnephrotic\b.{0,60}(rbc|red\s+blood\s+cell).{0,20}cast/i,
      /(rbc|red\s+blood\s+cell).{0,30}cast.{0,60}\bnephrotic\b/i,
    ],
    contradictions: [
      /nephrotic\s+syndrome.{0,40}rbc\s+cast/i,
    ],
    source:         'First Aid 2025 p.556',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
