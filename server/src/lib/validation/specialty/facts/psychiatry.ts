import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const psychiatryFactRules: MedicalFactRule[] = [
  {
    id:       'psych_001',
    domain:   'Psychiatry',
    expected: 'Neuroleptic malignant syndrome (NMS): LEAD-PIPE rigidity (not cogwheel), hyperthermia, autonomic instability; treat with dantrolene + bromocriptine/amantadine',
    appliesTo: [
      /\b(neuroleptic\s+malignant|nms)\b.{0,60}(rigid|treat|dantrolene)/i,
    ],
    contradictions: [
      /nms.{0,40}cogwheel\s+rigid/i,
      /neuroleptic\s+malignant.{0,40}cogwheel\s+rigid/i,
    ],
    requiredSupport: [/nms.{0,40}(lead.pipe|dantrolene|bromocriptine)/i],
    source:         'First Aid 2025 p.562; Harrison\'s 21e Ch.443e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'psych_002',
    domain:   'Psychiatry',
    expected: 'Serotonin syndrome vs NMS: serotonin syndrome = CLONUS, diarrhea, hyperreflexia, rapid onset hours; NMS = lead-pipe rigidity, autonomic instability, slower onset days',
    appliesTo: [
      /\bserotonin\s+syndrome\b.{0,60}(clonus|rigid|vs\s*nms)/i,
    ],
    contradictions: [
      /serotonin\s+syndrome.{0,40}lead.pipe\s+rigid/i,
      /serotonin\s+syndrome.{0,40}(hyporeflexia|diminished\s+reflex)/i,
    ],
    requiredSupport: [/serotonin\s+syndrome.{0,40}(clonus|hyperreflexia)/i],
    source:         'First Aid 2025 p.562; Harrison\'s 21e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'psych_003',
    domain:   'Psychiatry',
    expected: 'Clozapine: atypical antipsychotic; unique risk of AGRANULOCYTOSIS (requires ANC monitoring weekly); does NOT cause EPS; weight gain; sedation',
    appliesTo: [
      /\bclozapine\b.{0,60}(agranulocytosis|eps|extrapyramidal|side\s+effect)/i,
    ],
    contradictions: [
      /clozapine.{0,40}(cause|high\s+risk).{0,20}eps/i,
      /clozapine.{0,40}extrapyramidal.{0,20}(most\s+common|frequent|classic)/i,
    ],
    requiredSupport: [/clozapine.{0,40}agranulocytosis/i],
    source:         'First Aid 2025 p.563; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'psych_004',
    domain:   'Psychiatry',
    expected: 'Bupropion: NE and dopamine reuptake inhibitor; LOWERS seizure threshold (contraindicated in bulimia/anorexia, seizure disorders); NO sexual dysfunction; NO weight gain',
    appliesTo: [
      /\bbupropion\b.{0,60}(seizure|mechanism|sexual|weight)/i,
    ],
    contradictions: [
      /bupropion.{0,40}raise.{0,20}seizure\s+threshold/i,
      /bupropion.{0,40}serotonin.{0,20}(reuptake|mechanism)/i,
    ],
    source:         'First Aid 2025 p.562; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
