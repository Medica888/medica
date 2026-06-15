import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const geneticsFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'genetics_cystic_fibrosis_cftr',
    domain: 'Genetics',
    expected: 'Cystic fibrosis: CFTR chloride channel defect causing thick secretions, recurrent sinopulmonary infections, and pancreatic insufficiency',
    appliesTo: [/\b(cystic\s+fibrosis|cftr|chloride\s+channel|sweat\s+chloride|pancreatic\s+insufficiency)\b/i],
    contradictions: [/\b(dystrophin|fibrillin|hexosaminidase|phenylalanine\s+hydroxylase|collagen\s+type\s+i)\b/i],
    requiredSupport: [/\b(cftr|chloride|thick\s+secretions|sweat\s+chloride|pancreatic\s+insufficiency)\b/i],
  }),

  defineRule({
    id: 'genetics_marfan_fibrillin',
    domain: 'Genetics',
    expected: 'Marfan syndrome: FBN1 fibrillin-1 defect causing tall habitus, lens dislocation, and aortic root dilation/dissection risk',
    appliesTo: [/\b(marfan|fibrillin|fBN1|ectopia\s+lentis|aortic\s+root\s+dilation)\b/i],
    contradictions: [/\b(collagen\s+type\s+i|osteogenesis\s+imperfecta|lysyl\s+hydroxylase|elastin\s+deletion|nf1)\b/i],
    requiredSupport: [/\b(fibrillin|fbn1|aortic\s+root|lens|ectopia\s+lentis|tall\s+habitus)\b/i],
  }),

  {
    id:       'genet_001',
    domain:   'Genetics',
    expected: 'Prader-Willi syndrome: PATERNAL chromosome 15 deletion (or maternal uniparental disomy); hyperphagia, obesity, hypogonadism, intellectual disability, almond-shaped eyes',
    appliesTo: [
      /\bprader.willi\b.{0,60}(chromosome|deletion|maternal|paternal|uniparental)/i,
    ],
    contradictions: [
      /prader.willi.{0,40}maternal\s+(chromosome\s+15\s+deletion|deletion\s+of\s+chromosome\s+15)/i,
    ],
    requiredSupport: [/prader.willi.{0,40}paternal/i],
    source:         'First Aid 2025 p.60; Harrison\'s 21e Ch.64',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'genet_002',
    domain:   'Genetics',
    expected: 'Angelman syndrome: MATERNAL chromosome 15 deletion (or paternal UPD); happy demeanor, seizures, absent speech, ataxia — "happy puppet syndrome"',
    appliesTo: [
      /\bangelman\b.{0,60}(chromosome|deletion|maternal|paternal|uniparental)/i,
    ],
    contradictions: [
      /angelman.{0,40}paternal\s+(chromosome\s+15\s+deletion|deletion\s+of\s+chromosome\s+15)/i,
    ],
    requiredSupport: [/angelman.{0,40}maternal/i],
    source:         'First Aid 2025 p.60',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'genet_003',
    domain:   'Genetics',
    expected: 'Fragile X syndrome: CGG trinucleotide repeat expansion in FMR1 gene on X chromosome; most common cause of INHERITED intellectual disability; macroorchidism, long face, prominent ears',
    appliesTo: [
      /\bfragile\s+x\b.{0,60}(repeat|cgG|most\s+common|intellectual\s+disab)/i,
    ],
    contradictions: [
      /fragile\s+x.{0,40}(cag|ctg|gaa).{0,20}repeat/i,
      /fragile\s+x.{0,40}autosomal\s+(dominant|recessive)/i,
    ],
    requiredSupport: [/fragile\s+x.{0,40}(cgg|fmr1|x.linked)/i],
    source:         'First Aid 2025 p.59; Harrison\'s 21e Ch.64',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'genet_004',
    domain:   'Genetics',
    expected: 'Cystic fibrosis: CFTR gene (chromosome 7); ΔF508 most common mutation; autosomal recessive; chloride channel defect → thick secretions',
    appliesTo: [
      /\b(cystic\s+fibrosis|cftr)\b.{0,60}(gene|chromosome|mutation|delta\s*f508)/i,
    ],
    contradictions: [
      /cystic\s+fibrosis.{0,40}(chromosome\s*(1|2|3|4|5|6|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|x))/i,
      /cftr.{0,40}chromosome\s*(1[^7]|[^17]7)/i,
      /cystic\s+fibrosis.{0,40}autosomal\s+dominant/i,
    ],
    requiredSupport: [/cftr.{0,40}(chromosome\s*7|deltaf508|7q)/i],
    source:         'First Aid 2025 p.64; Harrison\'s 21e Ch.286',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'genet_005',
    domain:   'Genetics',
    expected: 'Mitochondrial inheritance: maternally inherited ONLY (sperm mitochondria degraded after fertilization); ALL children of an affected mother are at risk; variable expression due to heteroplasmy',
    appliesTo: [
      /\bmitochondrial\b.{0,60}(inherit|melas|merrf|leigh|leber)/i,
    ],
    contradictions: [
      /mitochondrial.{0,40}(paternal|autosomal|x.linked)\s+inherit/i,
      /melas.{0,40}autosomal/i,
    ],
    requiredSupport: [/mitochondrial.{0,40}(maternal|mother|heteroplasmy)/i],
    source:         'First Aid 2025 p.56; Harrison\'s 21e Ch.451',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
