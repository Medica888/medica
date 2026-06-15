import type { ValidationQuestion, ValidatorResult } from '../validationTypes.js';

export type MedicalFactRule = {
  id: string;
  domain: string;
  expected: string;
  appliesTo: RegExp[];
  contradictions: RegExp[];
  requiredSupport?: RegExp[];
  source: string;
  reviewStatus: 'seed_review_required' | 'expert_reviewed';
  lastReviewed: string;
};

const DEFAULT_SOURCE = 'Medica internal USMLE high-yield seed rule';
const DEFAULT_REVIEW_STATUS = 'seed_review_required';
const DEFAULT_LAST_REVIEWED = '2026-06-15';

function defineRule(rule: Omit<MedicalFactRule, 'source' | 'reviewStatus' | 'lastReviewed'> & Partial<Pick<MedicalFactRule, 'source' | 'reviewStatus' | 'lastReviewed'>>): MedicalFactRule {
  return {
    ...rule,
    source: rule.source ?? DEFAULT_SOURCE,
    reviewStatus: rule.reviewStatus ?? DEFAULT_REVIEW_STATUS,
    lastReviewed: rule.lastReviewed ?? DEFAULT_LAST_REVIEWED,
  };
}

function has(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function answerSupport(question: ValidationQuestion): string {
  const correct = String(question.correct || '').trim().toUpperCase();
  const correctText = (question.options || []).find(o => o.letter === correct)?.text || '';
  const correctExplanation = question.optionExplanations?.[correct] || '';
  return [correctText, question.explanation, correctExplanation].filter(Boolean).join(' ');
}

function intentTextFor(question: ValidationQuestion): string {
  return [
    question.subject,
    question.system,
    question.topic,
    question.testedConcept,
    question.questionAngle,
    question.usmleContentArea,
    question.physicianTask,
    question.stem,
    answerSupport(question),
  ].filter(Boolean).join(' ');
}

function truncate(value: string | undefined, maxLength = 500): string {
  if (!value) return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

function combinedFactFailure(failures: Array<{ rule: MedicalFactRule; detected: string }>): ValidatorResult {
  return {
    name: 'specialty',
    status: 'fail',
    blocking: true,
    score: 0,
    expected: truncate(failures.map(({ rule }) => rule.expected).join(' | '), 600),
    detected: truncate(failures.map(({ detected }) => detected).join(' | '), 600),
    confidence: 0.92,
    reasons: failures.map(({ rule }) => `fact_registry_${rule.id}_contradiction`),
    details: failures.map(({ rule, detected }) => ({
      reason: `fact_registry_${rule.id}_contradiction`,
      factId: rule.id,
      domain: rule.domain,
      expected: truncate(rule.expected),
      detected: truncate(detected),
      source: rule.source,
      reviewStatus: rule.reviewStatus,
      lastReviewed: rule.lastReviewed,
      confidence: 0.92,
      score: 0,
    })),
  };
}

export const medicalFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'pharmacology_lithium_toxicity',
    domain: 'Pharmacology',
    expected: 'Lithium toxicity: tremor, nephrogenic diabetes insipidus, hypothyroidism, and Ebstein anomaly risk',
    appliesTo: [/\b(lithium|bipolar\s+maintenance|nephrogenic\s+diabetes\s+insipidus|ebstein)\b/i],
    contradictions: [/\b(serotonin\s+reuptake|d2\s+blockade|gaba[-\s]?a|irreversible\s+mao|safe\s+in\s+pregnancy)\b/i],
    requiredSupport: [/\b(nephrogenic\s+diabetes\s+insipidus|tremor|hypothyroid|ebstein)\b/i],
  }),
  defineRule({
    id: 'pharmacology_digoxin_toxicity',
    domain: 'Pharmacology',
    expected: 'Digoxin toxicity: Na/K ATPase inhibition with increased intracellular calcium; toxicity may cause visual changes and arrhythmias',
    appliesTo: [/\b(digoxin|cardiac\s+glycoside|na\/k\s+atpase|yellow\s+vision)\b/i],
    contradictions: [/\b(beta[-\s]?1\s+blockade|calcium\s+channel\s+blockade|ace\s+inhibition|sodium\s+channel\s+blockade\s+only)\b/i],
    requiredSupport: [/\b(na\/k\s+atpase|intracellular\s+calcium|yellow\s+vision|arrhythmia)\b/i],
  }),
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
    id: 'neurology_parkinson_dopamine_loss',
    domain: 'Neurology',
    expected: 'Parkinson disease: loss of dopaminergic neurons in substantia nigra pars compacta with Lewy bodies',
    appliesTo: [/\b(parkinson|resting\s+tremor|bradykinesia|substantia\s+nigra|lewy\s+bodies)\b/i],
    contradictions: [/\b(huntingtin|caudate\s+atrophy|amyloid\s+plaques|upper\s+motor\s+neuron\s+only|dopamine\s+excess)\b/i],
    requiredSupport: [/\b(dopaminergic|substantia\s+nigra|lewy|bradykinesia|resting\s+tremor)\b/i],
  }),
  defineRule({
    id: 'neurology_huntington_cag_caudate',
    domain: 'Neurology',
    expected: 'Huntington disease: autosomal dominant CAG repeat expansion with caudate atrophy and chorea',
    appliesTo: [/\b(huntington|cag\s+repeat|caudate\s+atrophy|chorea)\b/i],
    contradictions: [/\b(dopaminergic\s+neuron\s+loss|lewy\s+bodies|amyloid\s+plaques|cgg\s+repeat|fmr1)\b/i],
    requiredSupport: [/\b(cag|caudate|chorea|autosomal\s+dominant)\b/i],
  }),
  defineRule({
    id: 'cardiology_mitral_regurgitation_murmur',
    domain: 'Cardiovascular',
    expected: 'Mitral regurgitation: holosystolic murmur at apex radiating to axilla',
    appliesTo: [/\b(mitral\s+regurgitation|holosystolic\s+murmur|apex\s+radiat(?:es|ing)?\s+to\s+axilla)\b/i],
    contradictions: [/\b(crescendo[-\s]?decrescendo|radiat(?:es|ing)?\s+to\s+carotids?|diastolic\s+rumble|opening\s+snap)\b/i],
    requiredSupport: [/\b(holosystolic|apex|axilla)\b/i],
  }),
  defineRule({
    id: 'biochemistry_von_gierke_g6pase',
    domain: 'Biochemistry',
    expected: 'Von Gierke disease: glucose-6-phosphatase deficiency causing severe fasting hypoglycemia, lactic acidosis, hyperuricemia, and hepatomegaly',
    appliesTo: [/\b(von\s+gierke|glycogen\s+storage\s+disease\s+type\s+i|glucose[-\s]?6[-\s]?phosphatase|severe\s+fasting\s+hypoglycemia)\b/i],
    contradictions: [/\b(debranching\s+enzyme|myophosphorylase|lysosomal\s+acid\s+alpha[-\s]?glucosidase|cori\s+disease|mcardle)\b/i],
    requiredSupport: [/\b(glucose[-\s]?6[-\s]?phosphatase|fasting\s+hypoglycemia|lactic\s+acidosis|hyperuricemia|hepatomegaly)\b/i],
  }),
  defineRule({
    id: 'neurology_alzheimer_amyloid_tau',
    domain: 'Neurology',
    expected: 'Alzheimer disease: beta-amyloid plaques and hyperphosphorylated tau neurofibrillary tangles causing progressive dementia',
    appliesTo: [/\b(alzheimer|amyloid\s+plaques|neurofibrillary\s+tangles|tau|progressive\s+dementia)\b/i],
    contradictions: [/\b(caudate\s+atrophy|huntingtin|lewy\s+bodies|substantia\s+nigra|prion\s+protein|frontotemporal\s+only)\b/i],
    requiredSupport: [/\b(beta[-\s]?amyloid|amyloid\s+plaques|tau|neurofibrillary\s+tangles|progressive\s+dementia)\b/i],
  }),
  defineRule({
    id: 'neurology_multiple_sclerosis_demyelination',
    domain: 'Neurology',
    expected: 'Multiple sclerosis: autoimmune CNS demyelination with lesions separated in time and space and oligoclonal IgG bands',
    appliesTo: [/\b(multiple\s+sclerosis|oligoclonal\s+bands|internuclear\s+ophthalmoplegia|cns\s+demyelination)\b/i],
    contradictions: [/\b(peripheral\s+demyelination|schwann\s+cells|anterior\s+horn\s+cells|dopaminergic\s+loss|amyloid\s+plaques)\b/i],
    requiredSupport: [/\b(cns|oligoclonal|demyelination|time\s+and\s+space|optic\s+neuritis)\b/i],
  }),
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
  defineRule({
    id: 'hematology_sickle_cell_beta_globin',
    domain: 'Hematology',
    expected: 'Sickle cell disease: beta-globin missense mutation causing HbS polymerization, vaso-occlusion, and hemolytic anemia',
    appliesTo: [/\b(sickle\s+cell|hbs\b|beta[-\s]?globin|vaso[-\s]?occlusive|autosplenectomy)\b/i],
    contradictions: [/\b(alpha[-\s]?globin\s+deletion|spectrin\s+defect|g6pd\s+deficiency|iron\s+deficiency|b12\s+deficiency)\b/i],
    requiredSupport: [/\b(beta[-\s]?globin|hbs|sickling)\b/i],
  }),
  defineRule({
    id: 'hematology_g6pd_oxidative_hemolysis',
    domain: 'Hematology',
    expected: 'G6PD deficiency: impaired NADPH generation causing oxidative hemolysis with bite cells and Heinz bodies after triggers',
    appliesTo: [/\b(g6pd|glucose[-\s]?6[-\s]?phosphate\s+dehydrogenase|heinz\s+bodies|bite\s+cells|oxidative\s+hemolysis)\b/i],
    contradictions: [/\b(spectrin\s+defect|hereditary\s+spherocytosis|iron\s+deficiency|b12\s+deficiency|beta[-\s]?globin\s+polymerization)\b/i],
    requiredSupport: [/\b(nadph|oxidative|heinz|bite\s+cells|g6pd|glutathione)\b/i],
  }),
  defineRule({
    id: 'hepatology_wilson_atp7b_copper',
    domain: 'Gastrointestinal',
    expected: 'Wilson disease: ATP7B copper excretion defect causing hepatic disease, neurologic signs, and Kayser-Fleischer rings',
    appliesTo: [/\b(wilson\s+disease|atp7b|kayser[-\s]?fleischer|copper\s+excretion|ceruloplasmin)\b/i],
    contradictions: [/\b(hfe|iron\s+overload|alpha[-\s]?1\s+antitrypsin|hepcidin|bilirubin\s+conjugation)\b/i],
    requiredSupport: [/\b(atp7b|copper|kayser|ceruloplasmin|hepatic|neurologic)\b/i],
  }),
  defineRule({
    id: 'hepatology_hemochromatosis_hfe_iron',
    domain: 'Gastrointestinal',
    expected: 'Hereditary hemochromatosis: HFE-related increased intestinal iron absorption causing high ferritin/transferrin saturation, cirrhosis, diabetes, and bronze skin',
    appliesTo: [/\b(hemochromatosis|hfe|bronze\s+diabetes|iron\s+overload|transferrin\s+saturation)\b/i],
    contradictions: [/\b(atp7b|copper|low\s+ferritin|low\s+transferrin\s+saturation|ceruloplasmin)\b/i],
    requiredSupport: [/\b(hfe|iron|ferritin|transferrin\s+saturation|bronze|cirrhosis|diabetes)\b/i],
  }),
  defineRule({
    id: 'endocrine_21_hydroxylase_cah',
    domain: 'Endocrine',
    expected: '21-hydroxylase deficiency: decreased cortisol/aldosterone with increased androgens, salt wasting, hypotension, and virilization',
    appliesTo: [/\b(21[-\s]?hydroxylase|congenital\s+adrenal\s+hyperplasia|cah\b|virilization|salt\s+wasting)\b/i],
    contradictions: [/\b(increased\s+cortisol|increased\s+aldosterone|decreased\s+androgens|11[-\s]?hydroxylase|17[-\s]?hydroxylase)\b/i],
    requiredSupport: [/\b(low\s+cortisol|decreased\s+cortisol|low\s+aldosterone|decreased\s+aldosterone|increased\s+androgens|high\s+androgens|salt\s+wasting|virilization)\b/i],
  }),
];

export function validateAgainstFactRegistry(question: ValidationQuestion): ValidatorResult | null {
  const haystack = intentTextFor(question);
  const support = answerSupport(question);
  const failures: Array<{ rule: MedicalFactRule; detected: string }> = [];

  for (const rule of medicalFactRules) {
    const applies = rule.appliesTo.some(pattern => has(haystack, pattern));
    if (!applies) continue;

    const hasContradiction = rule.contradictions.some(pattern => has(support, pattern));
    if (!hasContradiction) continue;

    const hasRequiredSupport = (rule.requiredSupport || []).some(pattern => has(support, pattern));
    if (hasRequiredSupport) continue;

    failures.push({ rule, detected: support.toLowerCase() });
  }

  return failures.length > 0 ? combinedFactFailure(failures) : null;
}
