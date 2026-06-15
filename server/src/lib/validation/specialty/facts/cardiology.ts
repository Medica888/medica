import type { MedicalFactRule } from '../medicalFactRuleTypes.js';

export const cardiologyFactRules: MedicalFactRule[] = [
  {
    id:       'card_001',
    domain:   'Cardiology',
    expected: 'Inferior MI (ST elevation in leads II, III, aVF) is caused by RCA occlusion in right-dominant circulation (~80% of patients)',
    appliesTo: [
      /\binferior\b.{0,40}\b(mi|infarct|stemi|myocardial)/i,
      /st.{0,10}elevat.{0,20}(leads?\s+)?(ii|iii|avf)/i,
    ],
    contradictions: [
      /inferior.{0,30}(left\s+anterior\s+descend|lad\b)/i,
      /inferior.{0,30}left\s+circumflex(?!\s+in.*left.{0,10}dominant)/i,
    ],
    requiredSupport: [/right\s+coronary|rca\b/i],
    source:         'First Aid 2025 p.303; AHA/ACC STEMI Guidelines',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'card_002',
    domain:   'Cardiology',
    expected: 'Anterior MI (ST elevation in V1–V4) is caused by LAD occlusion',
    appliesTo: [
      /\banterior\b.{0,40}\b(mi|infarct|stemi|myocardial)/i,
      /st.{0,10}elevat.{0,20}(v[1-4]|anterior\s+leads?)/i,
    ],
    contradictions: [
      /anterior.{0,30}right\s+coronary/i,
      /anterior.{0,30}\brca\b/i,
      /anterior.{0,30}left\s+circumflex/i,
    ],
    requiredSupport: [/left\s+anterior\s+descend|lad\b/i],
    source:         'First Aid 2025 p.303',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'card_003',
    domain:   'Cardiology',
    expected: 'HCM murmur INCREASES with Valsalva and standing (decreased preload), DECREASES with squatting and leg raise (increased preload)',
    appliesTo: [
      /hypertrophic.{0,30}(cardio|obstructive|hcm)/i,
      /\bhcm\b.{0,50}(murmur|valsalva|squat)/i,
    ],
    contradictions: [
      /hcm.{0,40}(decrease|louder|worsen|exacerbat).{0,30}squat/i,
      /hcm.{0,40}(increase|louder).{0,30}(leg\s+raise|squatting)/i,
      /valsalva.{0,30}(decrease|softer|diminish).{0,30}hcm/i,
    ],
    requiredSupport: [/(valsalva|standing).{0,30}(increase|louder|worsen|exacerbat)/i],
    source:         'First Aid 2025 p.298; Harrison\'s 21e Ch.54',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'card_004',
    domain:   'Cardiology',
    expected: 'Infective endocarditis: Osler nodes = PAINFUL (immune complex, fingertips/toes); Janeway lesions = PAINLESS (septic emboli, palms/soles)',
    appliesTo: [
      /\b(osler|janeway)\b/i,
      /infective\s+endocarditis.{0,60}(skin|peripheral|emboli)/i,
    ],
    contradictions: [
      /osler.{0,20}painless/i,
      /janeway.{0,20}pain(?!less)/i,
      /janeway.{0,20}tender/i,
    ],
    source:       'First Aid 2025 p.309; Robbins 10e p.614',
    reviewStatus: 'expert_reviewed',
    lastReviewed: '2026-06-15',
  },

  {
    id:       'card_005',
    domain:   'Cardiology',
    expected: 'Digoxin toxicity risk is INCREASED by hypokalemia (K+ competes with digoxin at Na/K-ATPase); hyperkalemia is protective',
    appliesTo: [
      /\bdigoxin\b.{0,60}(toxic|hyperkalem|hypokalem)/i,
      /(hyperkalem|hypokalem).{0,60}\bdigoxin\b/i,
    ],
    contradictions: [
      /hyperkalem.{0,30}(increase|worsen|exacerbat|predispose).{0,30}digoxin\s+toxic/i,
      /hypokalem.{0,30}(protect|prevent|decreas).{0,30}digoxin\s+toxic/i,
    ],
    requiredSupport: [/hypokalem.{0,30}(increase|worsen|exacerbat|predispose).{0,30}digoxin/i],
    source:         'First Aid 2025 p.318; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'card_006',
    domain:   'Cardiology',
    expected: 'Dressler syndrome (post-MI autoimmune pericarditis) occurs 2–10 WEEKS after MI, not within the first 24 hours',
    appliesTo: [
      /\bdressler\b/i,
      /post.{0,15}(mi|infarct).{0,30}(autoimmune|pericarditis)/i,
    ],
    contradictions: [
      /dressler.{0,40}(hours?|days?|24\s*h|immediate|acute\s+onset)/i,
      /dressler.{0,40}first\s+(24|48)\s*hour/i,
    ],
    requiredSupport: [/dressler.{0,40}(week|2.{0,5}10|delayed)/i],
    source:         'First Aid 2025 p.306; Harrison\'s 21e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'card_007',
    domain:   'Cardiology',
    expected: 'Wolff-Parkinson-White (WPW): SHORT PR interval + delta wave + widened QRS — not prolonged PR',
    appliesTo: [
      /\b(wolff.parkinson.white|wpw|accessory\s+pathway|delta\s+wave)/i,
    ],
    contradictions: [
      /wpw.{0,40}(long|prolonged|increas).{0,20}pr/i,
      /delta\s+wave.{0,40}long\s+pr/i,
    ],
    requiredSupport: [/(short|shortened|decreas).{0,20}pr.{0,20}(delta|wpw|accessory)/i],
    source:         'First Aid 2025 p.304',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'card_008',
    domain:   'Cardiology',
    expected: 'Torsades de pointes is caused by PROLONGED QT interval — not prolonged QRS or PR interval',
    appliesTo: [
      /\b(torsades|torsade\s+de\s+pointes|tdp)\b/i,
    ],
    contradictions: [
      /torsades.{0,40}(prolonged|long).{0,20}(qrs|pr\s+interval)/i,
      /torsades.{0,40}(short|shortened)\s+qt/i,
    ],
    requiredSupport: [/(prolonged|long).{0,20}qt.{0,40}torsades/i],
    source:         'First Aid 2025 p.305',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
