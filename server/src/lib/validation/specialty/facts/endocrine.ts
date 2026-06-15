import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const endocrineFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'endocrine_hashimoto_autoimmune_hypothyroid',
    domain: 'Endocrine',
    expected: 'Hashimoto thyroiditis: autoimmune thyroid destruction with anti-TPO/anti-thyroglobulin antibodies causing hypothyroidism',
    appliesTo: [/\b(hashimoto|anti[-\s]?tpo|anti[-\s]?thyroglobulin|autoimmune\s+hypothyroid)\b/i],
    contradictions: [/\b(tsh\s+receptor\s+stimulation|thyroid[-\s]?stimulating\s+immunoglobulin|graves|hyperthyroidism\s+from\s+receptor\s+activation)\b/i],
    requiredSupport: [/\b(anti[-\s]?tpo|anti[-\s]?thyroglobulin|hypothyroid|destruction)\b/i],
  }),

  defineRule({
    id: 'endocrine_pheochromocytoma_catecholamines',
    domain: 'Endocrine',
    expected: 'Pheochromocytoma: catecholamine-secreting chromaffin tumor causing episodic headache, sweating, tachycardia, and hypertension',
    appliesTo: [/\b(pheochromocytoma|episodic\s+headache|catecholamine|chromaffin|metanephrine)\b/i],
    contradictions: [/\b(aldosterone[-\s]?secreting|primary\s+hyperaldosteronism|cortisol[-\s]?secreting|insulinoma|hypoglycemia)\b/i],
    requiredSupport: [/\b(catecholamine|chromaffin|metanephrine|headache|sweating|tachycardia|hypertension)\b/i],
  }),

  defineRule({
    id: 'endocrine_21_hydroxylase_cah',
    domain: 'Endocrine',
    expected: '21-hydroxylase deficiency: decreased cortisol/aldosterone with increased androgens, salt wasting, hypotension, and virilization',
    appliesTo: [/\b(21[-\s]?hydroxylase|congenital\s+adrenal\s+hyperplasia|cah\b|virilization|salt\s+wasting)\b/i],
    contradictions: [/\b(increased\s+cortisol|increased\s+aldosterone|decreased\s+androgens|11[-\s]?hydroxylase|17[-\s]?hydroxylase)\b/i],
    requiredSupport: [/\b(low\s+cortisol|decreased\s+cortisol|low\s+aldosterone|decreased\s+aldosterone|increased\s+androgens|high\s+androgens|salt\s+wasting|virilization)\b/i],
  }),

  defineRule({
    id: 'endocrine_graves_tsh_receptor_stimulation',
    domain: 'Endocrine',
    expected: 'Graves disease: thyroid-stimulating immunoglobulins activate the TSH receptor, causing hyperthyroidism and diffuse goiter',
    appliesTo: [/\b(graves\s+disease|thyroid[-\s]?stimulating\s+immunoglobulin|tsh\s+receptor|diffuse\s+goiter|exophthalmos)\b/i],
    contradictions: [/\b(anti[-\s]?tpo|anti[-\s]?thyroglobulin|thyroid\s+destruction|hashimoto|hypothyroidism\s+from\s+autoimmune\s+destruction)\b/i],
    requiredSupport: [/\b(tsh\s+receptor|thyroid[-\s]?stimulating\s+immunoglobulin|hyperthyroid|diffuse\s+goiter|exophthalmos)\b/i],
  }),

  {
    id:       'endo_001',
    domain:   'Endocrine',
    expected: 'Primary hypothyroidism: LOW T4 + HIGH TSH; Secondary hypothyroidism: LOW T4 + LOW (or normal) TSH',
    appliesTo: [
      /\b(hypothyroid|hashimoto)\b.{0,60}(tsh|t4)/i,
    ],
    contradictions: [
      /primary\s+hypothyroid.{0,40}(low|decreased|reduced)\s+tsh/i,
      /secondary\s+hypothyroid.{0,40}(high|elevated|raised)\s+tsh/i,
    ],
    source:         'First Aid 2025 p.338',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_002',
    domain:   'Endocrine',
    expected: 'Graves disease specific antibody: anti-TSH receptor (TSI/TRAb) — stimulating IgG; anti-TPO is present but not specific to Graves',
    appliesTo: [
      /\bgraves\b.{0,60}(antibod|autoantibod|anti)/i,
    ],
    contradictions: [
      /graves.{0,40}anti.{0,5}(tpo|thyroid\s+peroxidase).{0,20}(specific|diagnostic|classic)/i,
      /graves.{0,40}anti.{0,5}thyroglobulin.{0,20}(specific|diagnostic|classic)/i,
    ],
    requiredSupport: [/graves.{0,40}(tsi|trab|anti.tsh\s+receptor|thyroid.stimulat.{0,20}immuno)/i],
    source:         'First Aid 2025 p.336; Harrison\'s 21e Ch.379',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_003',
    domain:   'Endocrine',
    expected: 'Cushing syndrome from adrenal adenoma: LOW ACTH (negative feedback on pituitary); pituitary Cushing (disease): HIGH ACTH; ectopic (SCLC): VERY HIGH ACTH',
    appliesTo: [
      /\bcushing\b.{0,60}(acth|adrenal\s+adenoma|pituitary|ectopic)/i,
    ],
    contradictions: [
      /adrenal\s+(adenoma|tumor).{0,40}(high|elevated|raised|increased)\s+acth/i,
      /adrenal\s+source.{0,40}(high|elevated)\s+acth/i,
    ],
    requiredSupport: [
      /adrenal\s+(adenoma|tumor).{0,40}(low|decreased|suppressed)\s+acth/i,
    ],
    source:         'First Aid 2025 p.342; Harrison\'s 21e Ch.380',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_004',
    domain:   'Endocrine',
    expected: 'Primary hyperaldosteronism (Conn syndrome): HIGH aldosterone + LOW renin (negative feedback); secondary hyperaldosteronism: both aldosterone and renin are HIGH',
    appliesTo: [
      /\b(conn|primary\s+hyperaldosteronism)\b/i,
    ],
    contradictions: [
      /conn.{0,40}(high|elevated|raised)\s+renin/i,
      /primary\s+hyperaldosteronism.{0,40}(high|elevated)\s+renin/i,
    ],
    requiredSupport: [/(conn|primary\s+hyperaldosteronism).{0,40}(low|suppressed)\s+renin/i],
    source:         'First Aid 2025 p.344; Harrison\'s 21e Ch.380',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_005',
    domain:   'Endocrine',
    expected: 'MEN1 (Wermer syndrome): Parathyroid + Pituitary + Pancreas (3 P\'s); gene MEN1 on chromosome 11; NOT MEN2A components',
    appliesTo: [
      /\bmen\s*(type\s*)?(1|i|one)\b|multiple\s+endocrine\s+neoplasia\s+(type\s*)?(1|i)/i,
    ],
    contradictions: [
      /men\s*(type\s*)?(1|i).{0,40}medullary\s+thyroid/i,
      /men\s*(type\s*)?(1|i).{0,40}pheochromocytoma/i,
    ],
    requiredSupport: [/men\s*(type\s*)?(1|i).{0,60}(parathyroid|pituitary|pancrea)/i],
    source:         'First Aid 2025 p.348; Harrison\'s 21e Ch.382',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_006',
    domain:   'Endocrine',
    expected: 'MEN2A: Medullary thyroid cancer + Pheochromocytoma + Parathyroid hyperplasia; MEN2B adds mucosal neuromas and marfanoid habitus; BOTH caused by RET proto-oncogene mutation',
    appliesTo: [
      /\bmen\s*(type\s*)?(2[ab]?|ii[ab]?)\b|multiple\s+endocrine\s+neoplasia\s+(type\s*)?(2|ii)/i,
    ],
    contradictions: [
      /men\s*(type\s*)?(2a|iia).{0,40}(papillary|follicular)\s+thyroid/i,
      /men\s*(type\s*)?(2|ii).{0,40}(men1|chromosome\s+11)/i,
    ],
    requiredSupport: [/men.{0,10}(2|ii).{0,40}(ret\s+proto.oncogene|ret\s+gene|medullary\s+thyroid)/i],
    source:         'First Aid 2025 p.348',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_007',
    domain:   'Endocrine',
    expected: 'SIADH: hyponatremia + urine osmolality GREATER THAN serum osmolality + urine Na >20 mEq/L (concentrated urine despite low serum Na)',
    appliesTo: [
      /\bsiadh\b|syndrome\s+of\s+inappropriate\s+(adh|antidiuretic)/i,
    ],
    contradictions: [
      /siadh.{0,40}urine\s+osmolality.{0,20}(<|less\s+than|lower\s+than)\s*serum/i,
      /siadh.{0,40}dilute\s+urine/i,
    ],
    source:         'First Aid 2025 p.346; Harrison\'s 21e Ch.374',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'endo_008',
    domain:   'Endocrine',
    expected: 'Drug-induced lupus: anti-HISTONE antibodies; common culprits: Hydralazine, Isoniazid, Procainamide, Quinidine — NOT anti-dsDNA',
    appliesTo: [
      /drug.{0,10}induced\s+lupus/i,
      /(hydralazine|procainamide|isoniazid).{0,60}lupus/i,
    ],
    contradictions: [
      /drug.{0,10}induced\s+lupus.{0,40}anti.ds\s*dna/i,
      /drug.{0,10}induced\s+lupus.{0,40}anti.smith/i,
    ],
    requiredSupport: [/drug.{0,10}induced\s+lupus.{0,40}anti.histone/i],
    source:         'First Aid 2025 p.468; Harrison\'s 21e Ch.349',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  }
];
