import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const biochemistryFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'biochemistry_von_gierke_g6pase',
    domain: 'Biochemistry',
    expected: 'Von Gierke disease: glucose-6-phosphatase deficiency causing severe fasting hypoglycemia, lactic acidosis, hyperuricemia, and hepatomegaly',
    appliesTo: [/\b(von\s+gierke|glycogen\s+storage\s+disease\s+type\s+i|glucose[-\s]?6[-\s]?phosphatase|severe\s+fasting\s+hypoglycemia)\b/i],
    contradictions: [/\b(debranching\s+enzyme|myophosphorylase|lysosomal\s+acid\s+alpha[-\s]?glucosidase|cori\s+disease|mcardle)\b/i],
    requiredSupport: [/\b(glucose[-\s]?6[-\s]?phosphatase|fasting\s+hypoglycemia|lactic\s+acidosis|hyperuricemia|hepatomegaly)\b/i],
  }),

  {
    id:       'biochem_001',
    domain:   'Biochemistry',
    expected: 'Tay-Sachs: hexosaminidase A deficiency; GM2 ganglioside accumulation; NO hepatosplenomegaly (unlike Niemann-Pick); cherry-red macula; Ashkenazi Jewish; AR',
    appliesTo: [
      /\btay.sachs\b.{0,60}(hepato|liver|splen|hepatosplenomegaly)/i,
    ],
    contradictions: [
      /tay.sachs.{0,40}(hepatosplenomegaly|hepatomegaly|splenomegaly)/i,
    ],
    source:         'First Aid 2025 p.85; Robbins 10e p.151',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'biochem_002',
    domain:   'Biochemistry',
    expected: 'Lesch-Nyhan syndrome: HGPRT deficiency; X-linked recessive; hyperuricemia, self-mutilation, intellectual disability, choreoathetosis, gout',
    appliesTo: [
      /\b(lesch.nyhan|hgprt)\b/i,
    ],
    contradictions: [
      /lesch.nyhan.{0,40}autosomal\s+(dominant|recessive)/i,
      /lesch.nyhan.{0,40}adenosine\s+deaminase/i,
    ],
    requiredSupport: [/lesch.nyhan.{0,40}(hgprt|x.linked|self.mutilat)/i],
    source:         'First Aid 2025 p.35; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'biochem_003',
    domain:   'Biochemistry',
    expected: 'OTC deficiency (most common urea cycle disorder): X-linked; HIGH orotic acid (distinguishes from CPS-I deficiency); elevated ammonia; low BUN',
    appliesTo: [
      /\b(otc\s+deficien|ornithine\s+transcarbamylase)\b/i,
    ],
    contradictions: [
      /otc\s+deficien.{0,40}autosomal\s+(dominant|recessive)/i,
      /otc\s+deficien.{0,40}(low|decreased|normal)\s+orotic\s+acid/i,
    ],
    requiredSupport: [/otc.{0,40}(x.linked|orotic\s+acid\s+(elevated|high|increased))/i],
    source:         'First Aid 2025 p.79; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'biochem_004',
    domain:   'Biochemistry',
    expected: 'Homocystinuria: cystathionine β-synthase deficiency (most common); elevated methionine; lens dislocation INFEROMEDIAL; thrombosis; marfanoid habitus; AR — distinct from Marfan (normal methionine, superotemporal lens)',
    appliesTo: [
      /\bhomocystinuria\b.{0,60}(lens|methionine|marfan)/i,
    ],
    contradictions: [
      /homocystinuria.{0,40}lens.{0,20}(superotemporal|upward|superior)/i,
      /homocystinuria.{0,40}autosomal\s+dominant/i,
      /homocystinuria.{0,40}(low|normal)\s+methionine/i,
    ],
    requiredSupport: [/homocystinuria.{0,40}(inferomedial|inferior|cystathionine\s+beta)/i],
    source:         'First Aid 2025 p.78; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'biochem_005',
    domain:   'Biochemistry',
    expected: 'Von Gierke disease (GSD type I): glucose-6-phosphatase deficiency; severe fasting hypoglycemia that does NOT respond to glucagon (glucagon cannot bypass G6Pase step)',
    appliesTo: [
      /\b(von\s+gierke|gsd\s+type\s+[i1]|glucose.6.phosphatase\s+deficien)\b.{0,60}(glucagon|hypoglycemia)/i,
    ],
    contradictions: [
      /von\s+gierke.{0,40}glucagon.{0,30}(corrects|treats|raises|restores)\s+(blood\s+glucose|glucose|hypoglycemia)/i,
    ],
    source:         'First Aid 2025 p.84; Robbins 10e p.154',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'biochem_006',
    domain:   'Biochemistry',
    expected: 'Pompe disease (GSD type II): acid α-1,4-glucosidase (acid maltase) deficiency; LYSOSOMAL storage; infantile form presents with cardiomegaly; AR',
    appliesTo: [
      /\b(pompe|acid\s+maltase\s+deficien|gsd\s+type\s+ii|alpha.1.4.glucosidase)\b/i,
    ],
    contradictions: [
      /pompe.{0,40}(cytoplasmic|cytosolic).{0,20}(storage|accumulation)/i,
      /pompe.{0,40}glucose.6.phosphatase\s+deficien/i,
    ],
    requiredSupport: [/pompe.{0,40}(lysosomal|cardiomegaly|acid\s+maltase)/i],
    source:         'First Aid 2025 p.85; Robbins 10e p.155',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
