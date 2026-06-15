import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const pulmonaryFactRules: MedicalFactRule[] = [
  {
    id:       'pulm_001',
    domain:   'Pulmonary',
    expected: 'Alpha-1 antitrypsin deficiency causes LOWER LOBE emphysema (panacinar), not upper lobe (smoking causes upper-lobe centrilobular emphysema)',
    appliesTo: [
      /alpha.{0,5}1.{0,15}antitrypsin/i,
      /\ba1at\b|\baat\b.{0,20}(deficien|emphysema)/i,
    ],
    contradictions: [
      /alpha.{0,5}1.{0,15}antitrypsin.{0,40}upper\s+lobe/i,
      /a1at.{0,40}upper\s+lobe/i,
    ],
    requiredSupport: [
      /alpha.{0,5}1.{0,15}antitrypsin.{0,40}lower\s+lobe/i,
      /panacinar/i,
    ],
    source:         'First Aid 2025 p.656; Robbins 10e p.680',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pulm_002',
    domain:   'Pulmonary',
    expected: 'Obstructive pattern on PFTs: decreased FEV1/FVC ratio (<0.70); Restrictive pattern: decreased TLC with normal or INCREASED FEV1/FVC',
    appliesTo: [
      /\b(pfts?|pulmonary\s+function\s+test|spirometr)/i,
      /\b(obstructive|restrictive).{0,30}(fev1|fvc|tlc)/i,
    ],
    contradictions: [
      /restrictive.{0,30}(decreased|reduced|low).{0,20}fev1.{0,20}fvc/i,
      /obstructive.{0,30}(normal|increased|elevated).{0,20}fev1.{0,20}fvc/i,
    ],
    source:         'First Aid 2025 p.648',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pulm_003',
    domain:   'Pulmonary',
    expected: 'Silicosis: UPPER LOBE nodules + eggshell hilar calcification; Asbestosis: LOWER LOBE fibrosis + pleural plaques (and risk of mesothelioma)',
    appliesTo: [
      /\b(silicosis|silica|asbestosis|asbestos)\b/i,
    ],
    contradictions: [
      /silicosis.{0,40}lower\s+lobe/i,
      /asbestosis.{0,40}upper\s+lobe/i,
      /silicosis.{0,40}pleural\s+plaque/i,
    ],
    source:         'First Aid 2025 p.660; Robbins 10e p.688',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pulm_004',
    domain:   'Pulmonary',
    expected: 'Goodpasture syndrome is caused by anti-GBM antibodies (type II hypersensitivity), NOT type III immune complex disease',
    appliesTo: [
      /\bgoodpasture\b/i,
    ],
    contradictions: [
      /goodpasture.{0,40}(type\s+iii|immune\s+complex|type\s+3)/i,
      /goodpasture.{0,40}(p-anca|c-anca|pr3|mpo\b)/i,
    ],
    requiredSupport: [/goodpasture.{0,40}(anti.gbm|type\s+ii|anti.collagen\s+iv)/i],
    source:         'First Aid 2025 p.568; Robbins 10e p.900',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pulm_005',
    domain:   'Pulmonary',
    expected: 'Sarcoidosis: NON-CASEATING granulomas (not caseating like TB); elevated ACE; bilateral hilar lymphadenopathy',
    appliesTo: [
      /\bsarcoidosis\b/i,
    ],
    contradictions: [
      /sarcoidosis.{0,40}caseating\s+granuloma/i,
      /sarcoidosis.{0,40}acid.fast/i,
    ],
    requiredSupport: [/sarcoidosis.{0,40}non.caseating/i],
    source:         'First Aid 2025 p.659; Harrison\'s 21e Ch.171',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pulm_006',
    domain:   'Pulmonary',
    expected: 'ARDS diagnostic criterion: PaO2/FiO2 ratio <300 mmHg (severe <100); non-cardiogenic pulmonary edema',
    appliesTo: [
      /\bards\b|acute\s+respiratory\s+distress/i,
    ],
    contradictions: [
      /ards.{0,40}pao2.{0,15}fio2.{0,20}(>|greater\s+than|above)\s*(300|400|500)/i,
      /ards.{0,40}cardiogenic\s+edema/i,
    ],
    source:         'Berlin Definition 2012; First Aid 2025 p.661',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
