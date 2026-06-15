import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const microbiologyFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'microbiology_tuberculosis_acid_fast_caseating',
    domain: 'Microbiology',
    expected: 'Mycobacterium tuberculosis: acid-fast bacillus causing caseating granulomas and delayed-type hypersensitivity',
    appliesTo: [/\b(mycobacterium\s+tuberculosis|tuberculosis|acid[-\s]?fast|caseating\s+granuloma|positive\s+ppd)\b/i],
    contradictions: [/\b(gram[-\s]?positive\s+cocci|gram[-\s]?negative\s+rod|coagulase[-\s]?positive|optochin[-\s]?sensitive|encapsulated\s+yeast)\b/i],
    requiredSupport: [/\b(acid[-\s]?fast|mycolic\s+acid|caseating|granuloma|ppd|interferon[-\s]?gamma)\b/i],
  }),

  {
    id:       'micro_001',
    domain:   'Microbiology',
    expected: 'N. meningitidis ferments BOTH glucose AND maltose; N. gonorrhoeae ferments glucose ONLY — maltose is the key differential',
    appliesTo: [
      /\b(neisseria|n\.\s*(meningitidis|gonorrhoeae))\b.{0,60}(maltose|ferment)/i,
    ],
    contradictions: [
      /n\.\s*meningitidis.{0,40}glucose\s+only/i,
      /n\.\s*meningitidis.{0,40}does\s+not.{0,20}ferment\s+maltose/i,
      /n\.\s*gonorrhoeae.{0,40}maltose\s+(positive|ferment)/i,
    ],
    requiredSupport: [
      /meningitidis.{0,40}(maltose|glucose\s+and\s+maltose)/i,
      /gonorrhoeae.{0,40}glucose\s+only/i,
    ],
    source:         'First Aid 2025 p.137; Murray\'s Medical Microbiology 9e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'micro_002',
    domain:   'Microbiology',
    expected: 'S. saprophyticus: novobiocin RESISTANT (causes UTI in young women); S. epidermidis: novobiocin SENSITIVE',
    appliesTo: [
      /\b(s\.\s*saprophyticus|staphylococcus\s+saprophyticus)\b.{0,60}novobiocin/i,
    ],
    contradictions: [
      /saprophyticus.{0,40}novobiocin\s+(sensitive|susceptible)/i,
    ],
    requiredSupport: [/saprophyticus.{0,40}novobiocin\s+(resistant|resistance)/i],
    source:         'First Aid 2025 p.131',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'micro_003',
    domain:   'Microbiology',
    expected: 'Aspergillus: SEPTATE hyphae at 45° angles; Mucor/Rhizopus: NON-SEPTATE (pauciseptate) hyphae at 90° (right) angles',
    appliesTo: [
      /\b(aspergillus|mucor|rhizopus)\b.{0,60}(hyphae|septate|angle)/i,
    ],
    contradictions: [
      /aspergillus.{0,40}non.septate/i,
      /aspergillus.{0,40}(90.degree|right.angle)/i,
      /mucor.{0,40}septate\s+hyphae/i,
      /rhizopus.{0,40}septate\s+hyphae/i,
      /mucor.{0,40}45.degree/i,
    ],
    source:         'First Aid 2025 p.153; Murray\'s Medical Microbiology 9e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'micro_004',
    domain:   'Microbiology',
    expected: 'M. tuberculosis: ACID-FAST (not gram-positive, not gram-negative) — detected with Ziehl-Neelsen or auramine-rhodamine stain',
    appliesTo: [
      /\b(m\.\s*tuberculosis|mycobacterium\s+tuberculosis)\b.{0,40}(gram|stain|acid.fast)/i,
    ],
    contradictions: [
      /m\.\s*tuberculosis.{0,40}gram.positive/i,
      /m\.\s*tuberculosis.{0,40}gram.negative/i,
      /tuberculosis.{0,40}gram\s+stain\s+(positive|negative)/i,
    ],
    requiredSupport: [/(tuberculosis|mtb).{0,40}acid.fast/i],
    source:         'First Aid 2025 p.144; Murray\'s Medical Microbiology 9e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'micro_005',
    domain:   'Microbiology',
    expected: 'E. coli O157:H7 produces Shiga-LIKE toxin (not Shiga toxin of Shigella); AVOID antibiotics in STEC infection — antibiotic treatment increases HUS risk by increasing toxin release',
    appliesTo: [
      /\b(e\.?\s*coli\s+o157|stec|o157.h7)\b.{0,60}(antibiotic|treatment|hus)/i,
    ],
    contradictions: [
      /o157.{0,40}antibiotics?.{0,20}(treat|recommended|beneficial|require)/i,
      /stec.{0,40}antibiotics?.{0,20}(treat|first.line|required)/i,
    ],
    source:         'First Aid 2025 p.142; CDC STEC Guidelines',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'micro_006',
    domain:   'Microbiology',
    expected: 'Listeria monocytogenes: gram-POSITIVE ROD (not coccus); tumbling motility; intracellular; treat with AMPICILLIN (penicillin); immunocompromised and pregnant women at risk',
    appliesTo: [
      /\b(listeria|l\.\s*monocytogenes)\b/i,
    ],
    contradictions: [
      /listeria.{0,40}gram.negative/i,
      /listeria.{0,40}gram.positive\s+coccus/i,
      /listeria.{0,40}treat.{0,20}(vancomycin|metronidazole|cephalosporin).{0,10}(first.line|drug\s+of\s+choice)/i,
    ],
    requiredSupport: [/listeria.{0,40}(ampicillin|penicillin|gram.positive\s+rod)/i],
    source:         'First Aid 2025 p.139; Harrison\'s 21e Ch.113',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'micro_007',
    domain:   'Microbiology',
    expected: 'C. difficile: first-line treatment is oral VANCOMYCIN or FIDAXOMICIN — NOT metronidazole (metronidazole is no longer first-line per current IDSA 2021 guidelines)',
    appliesTo: [
      /\b(c\.\s*difficile|clostridioides|clostridium\s+difficile)\b.{0,60}treat/i,
    ],
    contradictions: [
      /c\.\s*difficile.{0,40}metronidazole.{0,20}(first.line|drug\s+of\s+choice|preferred|first\s+choice)/i,
    ],
    requiredSupport: [/c\.\s*difficile.{0,40}(vancomycin|fidaxomicin)/i],
    source:         'IDSA/SHEA 2021 C. difficile Guidelines; First Aid 2025 p.142',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
