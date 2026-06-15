import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const hematologyOncologyFactRules: MedicalFactRule[] = [
  {
    id:       'heme_007',
    domain:   'Hematology/Oncology',
    expected: 'Burkitt lymphoma: t(8;14) translocation → c-MYC overexpression; "starry sky" pattern; EBV associated (especially African form); highly aggressive',
    appliesTo: [
      /\bbburkitt\b|\bbburkitt.s?\s+lymphoma\b/i,
      /burkitt/i,
    ],
    contradictions: [
      /burkitt.{0,40}t\s*\(\s*(14|18|11)\s*;\s*(14|18)\s*\)/i,
      /burkitt.{0,40}bcl.?2\s+overexpression/i,
    ],
    requiredSupport: [/burkitt.{0,40}(t\s*\(\s*8\s*;\s*14\)|c.myc|cmyc)/i],
    source:         'First Aid 2025 p.416; WHO Classification 5e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_008',
    domain:   'Hematology/Oncology',
    expected: 'Hodgkin lymphoma: Reed-Sternberg cells are CD15+ AND CD30+ (bimodal distribution; not T-cell markers CD3/CD5)',
    appliesTo: [
      /\b(hodgkin|reed.sternberg)\b.{0,60}(cd|cell\s+marker)/i,
    ],
    contradictions: [
      /reed.sternberg.{0,40}(cd3|cd5|cd19|cd20).{0,20}(positive|expressed)/i,
    ],
    requiredSupport: [/reed.sternberg.{0,40}(cd15|cd30)/i],
    source:         'First Aid 2025 p.414; WHO Classification 5e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
