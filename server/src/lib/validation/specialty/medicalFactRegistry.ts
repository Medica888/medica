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
  defineRule({
    id: 'endocrine_graves_tsh_receptor_stimulation',
    domain: 'Endocrine',
    expected: 'Graves disease: thyroid-stimulating immunoglobulins activate the TSH receptor, causing hyperthyroidism and diffuse goiter',
    appliesTo: [/\b(graves\s+disease|thyroid[-\s]?stimulating\s+immunoglobulin|tsh\s+receptor|diffuse\s+goiter|exophthalmos)\b/i],
    contradictions: [/\b(anti[-\s]?tpo|anti[-\s]?thyroglobulin|thyroid\s+destruction|hashimoto|hypothyroidism\s+from\s+autoimmune\s+destruction)\b/i],
    requiredSupport: [/\b(tsh\s+receptor|thyroid[-\s]?stimulating\s+immunoglobulin|hyperthyroid|diffuse\s+goiter|exophthalmos)\b/i],
  }),
  defineRule({
    id: 'neurology_myasthenia_ach_receptor',
    domain: 'Neurology',
    expected: 'Myasthenia gravis: antibodies against postsynaptic acetylcholine receptors cause fatigable weakness that improves with rest',
    appliesTo: [/\b(myasthenia\s+gravis|fatigable\s+weakness|ptosis|acetylcholine\s+receptor|thymoma)\b/i],
    contradictions: [/\b(presynaptic\s+calcium\s+channel|p\/q[-\s]?type\s+calcium|lambert[-\s]?eaton|improves\s+with\s+repeated\s+use)\b/i],
    requiredSupport: [/\b(acetylcholine\s+receptor|postsynaptic|fatigable|ptosis|thymoma|improves\s+with\s+rest)\b/i],
  }),
  defineRule({
    id: 'immunology_sle_anti_dsdna_smith',
    domain: 'Immunology',
    expected: 'Systemic lupus erythematosus: immune-complex disease associated with anti-dsDNA and anti-Smith antibodies',
    appliesTo: [/\b(systemic\s+lupus|sle\b|anti[-\s]?dsdna|anti[-\s]?smith|malar\s+rash|lupus\s+nephritis)\b/i],
    contradictions: [/\b(anti[-\s]?centromere|anti[-\s]?topoisomerase|anti[-\s]?mitochondrial|p[-\s]?anca|c[-\s]?anca)\b/i],
    requiredSupport: [/\b(anti[-\s]?dsdna|anti[-\s]?smith|immune\s+complex|malar|photosensitivity|lupus\s+nephritis)\b/i],
  }),
  defineRule({
    id: 'microbiology_tuberculosis_acid_fast_caseating',
    domain: 'Microbiology',
    expected: 'Mycobacterium tuberculosis: acid-fast bacillus causing caseating granulomas and delayed-type hypersensitivity',
    appliesTo: [/\b(mycobacterium\s+tuberculosis|tuberculosis|acid[-\s]?fast|caseating\s+granuloma|positive\s+ppd)\b/i],
    contradictions: [/\b(gram[-\s]?positive\s+cocci|gram[-\s]?negative\s+rod|coagulase[-\s]?positive|optochin[-\s]?sensitive|encapsulated\s+yeast)\b/i],
    requiredSupport: [/\b(acid[-\s]?fast|mycolic\s+acid|caseating|granuloma|ppd|interferon[-\s]?gamma)\b/i],
  }),
  defineRule({
    id: 'gastrointestinal_celiac_ttg_villous_atrophy',
    domain: 'Gastrointestinal',
    expected: 'Celiac disease: gluten-sensitive enteropathy with anti-tTG/anti-endomysial antibodies and small-bowel villous atrophy',
    appliesTo: [/\b(celiac|gluten[-\s]?sensitive|anti[-\s]?ttg|anti[-\s]?endomysial|villous\s+atrophy)\b/i],
    contradictions: [/\b(transmural\s+inflammation|noncaseating\s+granulomas|skip\s+lesions|crohn|crypt\s+abscesses)\b/i],
    requiredSupport: [/\b(gluten|anti[-\s]?ttg|anti[-\s]?endomysial|villous\s+atrophy|dermatitis\s+herpetiformis)\b/i],
  }),


  // Broad cross-domain medical fact registry imported from reviewed seed set.

  // ══════════════════════════════════════════════════════════════════════════
  // CARDIOLOGY
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PULMONARY
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // RENAL
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ENDOCRINE
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GASTROENTEROLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'gi_001',
    domain:   'Gastroenterology',
    expected: 'Crohn disease: TRANSMURAL (full-thickness) inflammation, skip lesions, mouth-to-anus, non-caseating granulomas; UC: MUCOSAL only, continuous, starts in rectum',
    appliesTo: [
      /\b(crohn|ulcerative\s+colitis)\b.{0,60}(transmural|mucosal|skip|continuous)/i,
    ],
    contradictions: [
      /crohn.{0,40}mucosal\s+only/i,
      /crohn.{0,40}continuous.{0,20}(rectum|colon)/i,
      /ulcerative\s+colitis.{0,40}transmural/i,
      /ulcerative\s+colitis.{0,40}(skip\s+lesion|mouth.to.anus)/i,
    ],
    source:         'First Aid 2025 p.378; Robbins 10e p.817',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_002',
    domain:   'Gastroenterology',
    expected: 'HBV window period: only IgM anti-HBc is positive; HBsAg becomes negative before anti-HBs appears',
    appliesTo: [
      /\b(hepatitis\s+b|hbv)\b.{0,60}window/i,
      /window\s+period.{0,40}(hbv|hepatitis\s+b)/i,
    ],
    contradictions: [
      /window\s+period.{0,40}hbs\s*ag\s*(positive|present|detected)/i,
      /window\s+period.{0,40}anti.hbs\s*(positive|present|detected)/i,
    ],
    requiredSupport: [/window.{0,40}anti.hbc.{0,20}(igm|only\s+positive)/i],
    source:         'First Aid 2025 p.169; Harrison\'s 21e Ch.340',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_003',
    domain:   'Gastroenterology',
    expected: 'Wilson disease: DECREASED ceruloplasmin (copper accumulates, cannot incorporate into ceruloplasmin); ATP7B gene; Kayser-Fleischer rings',
    appliesTo: [
      /\bwilson\b.{0,60}(ceruloplasmin|copper|atp7b)/i,
    ],
    contradictions: [
      /wilson.{0,40}(high|elevated|increased|raised)\s+ceruloplasmin/i,
    ],
    requiredSupport: [/wilson.{0,40}(low|decreased|reduced)\s+ceruloplasmin/i],
    source:         'First Aid 2025 p.393; Robbins 10e p.855',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_004',
    domain:   'Gastroenterology',
    expected: 'Hemochromatosis: HFE gene mutation (C282Y most common); increased ferritin AND transferrin saturation; decreased TIBC; autosomal recessive',
    appliesTo: [
      /\bhemochromatosis\b/i,
    ],
    contradictions: [
      /hemochromatosis.{0,40}(low|decreased|reduced)\s+ferritin/i,
      /hemochromatosis.{0,40}(high|elevated|increased)\s+tibc/i,
      /hemochromatosis.{0,40}autosomal\s+dominant/i,
    ],
    requiredSupport: [/hemochromatosis.{0,40}(hfe|c282y|autosomal\s+recessive)/i],
    source:         'First Aid 2025 p.392; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_005',
    domain:   'Gastroenterology',
    expected: 'HCV: RNA virus with ~85% chronic infection rate — HIGHEST chronicity of all hepatitis viruses; HBV is DNA virus',
    appliesTo: [
      /\b(hepatitis\s+c|hcv)\b.{0,40}(dna|rna|chronic)/i,
    ],
    contradictions: [
      /hcv.{0,30}dna\s+virus/i,
      /hcv.{0,50}(rare|low\s+rate).{0,20}chronic/i,
    ],
    requiredSupport: [/hcv.{0,30}rna\s+virus/i],
    source:         'First Aid 2025 p.170',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_006',
    domain:   'Gastroenterology',
    expected: 'Barrett esophagus: intestinal metaplasia (columnar with goblet cells) in distal esophagus → risk of ADENOCARCINOMA (not squamous cell)',
    appliesTo: [
      /\bbarrett\b.{0,60}(esophagus|cancer|carcinoma|adenocarcinoma)/i,
    ],
    contradictions: [
      /barrett.{0,40}squamous\s+cell\s+carcinoma/i,
      /barrett.{0,40}scc\b/i,
    ],
    requiredSupport: [/barrett.{0,40}adenocarcinoma/i],
    source:         'First Aid 2025 p.375; Harrison\'s 21e Ch.315',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'gi_007',
    domain:   'Gastroenterology',
    expected: 'Celiac disease antibodies: anti-tissue transglutaminase (anti-tTG IgA) most sensitive and specific; also anti-endomysial IgA; HLA-DQ2/DQ8',
    appliesTo: [
      /\b(celiac|coeliac)\b.{0,60}(antibod|anti|hla)/i,
    ],
    contradictions: [
      /celiac.{0,40}anti.gluten\b.{0,20}(most\s+specific|diagnostic)/i,
      /celiac.{0,40}anti.gliadin\b.{0,20}(most\s+specific|most\s+sensitive)/i,
    ],
    requiredSupport: [/celiac.{0,40}(anti.ttg|anti.tissue\s+transglutaminase|anti.endomysial)/i],
    source:         'First Aid 2025 p.379; Harrison\'s 21e Ch.317',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // NEUROLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'neuro_001',
    domain:   'Neurology',
    expected: 'Alzheimer disease: cholinergic deficit (ACh); amyloid plaques + neurofibrillary tangles (tau); NOT a dopamine or serotonin deficiency',
    appliesTo: [
      /\balzheimer\b.{0,60}(neurotransmitter|cholinergic|dopamine|deficit)/i,
    ],
    contradictions: [
      /alzheimer.{0,40}dopamine\s+(deficien|decreas|loss)/i,
      /alzheimer.{0,40}serotonin\s+(deficien|decreas|loss)/i,
    ],
    requiredSupport: [/alzheimer.{0,40}(acetylcholine|cholinergic|ach\b)/i],
    source:         'First Aid 2025 p.519; Harrison\'s 21e Ch.423',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_002',
    domain:   'Neurology',
    expected: 'Lambert-Eaton syndrome: IMPROVES with repetitive stimulation (pre-synaptic Ca channel defect → more Ca released with repeat); myasthenia gravis WORSENS with repetition',
    appliesTo: [
      /\b(lambert.eaton|lems?)\b/i,
    ],
    contradictions: [
      /lambert.eaton.{0,40}(wors|decreas|fatiguabl).{0,30}(repet|use)/i,
      /lambert.eaton.{0,40}post.synaptic/i,
      /lambert.eaton.{0,40}anti.achr/i,
    ],
    requiredSupport: [/lambert.eaton.{0,40}(improve|increas|facilitat).{0,30}(repet|stimulat|use)/i],
    source:         'First Aid 2025 p.527; Harrison\'s 21e Ch.442',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_003',
    domain:   'Neurology',
    expected: 'Bell palsy (CN VII LMN): CANNOT wrinkle forehead ipsilaterally — entire ipsilateral face paralyzed; UMN lesion spares forehead (bilateral cortical representation)',
    appliesTo: [
      /\b(bell.s?\s*palsy|cn\s*vii\s+lmn|facial\s+nerve\s+palsy)\b/i,
    ],
    contradictions: [
      /bell.s?\s*palsy.{0,40}forehead\s+(spar|intact|preserv)/i,
      /bell.s?\s*palsy.{0,40}upper\s+face.{0,20}spar/i,
    ],
    source:         'First Aid 2025 p.508',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_004',
    domain:   'Neurology',
    expected: 'Lateral medullary (Wallenberg) syndrome (PICA infarct): IPSILATERAL face sensory loss + CONTRALATERAL body sensory loss — crossed findings',
    appliesTo: [
      /\b(wallenberg|lateral\s+medullary|pica\s+infarct|pica\s+stroke)\b/i,
    ],
    contradictions: [
      /wallenberg.{0,60}(ipsilateral|same\s+side).{0,30}body\s+(loss|deficit|numb)/i,
      /wallenberg.{0,60}contralateral.{0,30}face\s+(loss|deficit|numb)/i,
    ],
    source:         'First Aid 2025 p.508; Harrison\'s 21e Ch.420',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_005',
    domain:   'Neurology',
    expected: 'Huntington disease: CAG trinucleotide repeat on CHROMOSOME 4; caudate nucleus atrophy; autosomal dominant; anticipation (paternal especially)',
    appliesTo: [
      /\bhuntington\b.{0,60}(chromosome|chr|cag|repeat)/i,
    ],
    contradictions: [
      /huntington.{0,40}(chr|chromosome)\s*(1[^4]|[0-35-9]|1[45678]|2\d|4[^$])\b/i,
      /huntington.{0,40}cag.{0,20}(chr|chromosome)\s*(1|9|17|19|22|x)/i,
    ],
    requiredSupport: [/huntington.{0,40}(chr|chromosome)\s*4/i],
    source:         'First Aid 2025 p.519',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_006',
    domain:   'Neurology',
    expected: 'Guillain-Barré syndrome (GBS): albuminocytologic dissociation — HIGH protein + NORMAL cell count in CSF; ascending demyelinating; associated with Campylobacter jejuni',
    appliesTo: [
      /\b(guillain.barr|gbs|acute\s+inflammatory\s+demyelinat.{0,20}polyneuropath)/i,
    ],
    contradictions: [
      /guillain.barr.{0,40}(high|elevated).{0,20}(wbc|cell\s+count|pleocytosis).{0,20}csf/i,
      /gbs.{0,40}(high|elevated).{0,20}cell\s+count.{0,20}csf/i,
    ],
    requiredSupport: [/guillain.barr.{0,40}(high|elevated).{0,20}protein.{0,20}(normal|low).{0,20}cell/i],
    source:         'First Aid 2025 p.530; Harrison\'s 21e Ch.439',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'neuro_007',
    domain:   'Neurology',
    expected: 'Multiple sclerosis: periventricular WHITE MATTER (not gray matter) demyelinating plaques; oligoclonal IgG bands in CSF; internuclear ophthalmoplegia from MLF lesion',
    appliesTo: [
      /\bmultiple\s+sclerosis\b.{0,60}(plaque|lesion|white\s+matter|periventricular)/i,
    ],
    contradictions: [
      /multiple\s+sclerosis.{0,40}gray\s+matter.{0,20}plaque/i,
      /ms.{0,30}axon\s+(destruct|loss)\b.{0,20}primary/i,
    ],
    source:         'First Aid 2025 p.524; Harrison\'s 21e Ch.436',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MICROBIOLOGY
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // IMMUNOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'immuno_001',
    domain:   'Immunology',
    expected: 'Type IV hypersensitivity (delayed): T-CELL mediated, not antibody-mediated; delayed 24–72 hours; examples: TB test, contact dermatitis, transplant rejection, granulomas',
    appliesTo: [
      /type\s+(iv|4|four)\s+hypersensitiv/i,
      /delayed.type\s+hypersensitiv/i,
    ],
    contradictions: [
      /type\s+(iv|4|four)\s+hypersensitiv.{0,40}(igE|igG|antibody.mediat|mast\s+cell)/i,
      /delayed\s+hypersensitiv.{0,40}antibody.mediat/i,
    ],
    requiredSupport: [/type\s+(iv|4).{0,40}t.cell\s+mediat/i],
    source:         'First Aid 2025 p.107; Robbins 10e Ch.5',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'immuno_002',
    domain:   'Immunology',
    expected: 'DiGeorge syndrome: 22q11.2 DELETION; absent thymus (T-cell deficiency) + absent parathyroids (hypocalcemia); conotruncal heart defects',
    appliesTo: [
      /\b(digeorge|velocardio|22q11)\b/i,
    ],
    contradictions: [
      /digeorge.{0,40}(chromosome\s*(7|11|9|x)|[^2]2q11|21q|22p)/i,
      /digeorge.{0,40}b.cell\s+deficien/i,
    ],
    requiredSupport: [/digeorge.{0,40}22q11/i],
    source:         'First Aid 2025 p.113; Harrison\'s 21e Ch.345',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'immuno_003',
    domain:   'Immunology',
    expected: 'Bruton agammaglobulinemia (XLA): BTK gene mutation; X-linked recessive; ABSENT B cells; no immunoglobulins; presents after 6 months when maternal IgG wanes',
    appliesTo: [
      /\b(bruton|xla|btk)\b.{0,60}(b.cell|immunoglobulin|agammaglobulinemia)/i,
    ],
    contradictions: [
      /bruton.{0,40}t.cell\s+(deficien|absent|lack)/i,
      /bruton.{0,40}normal\s+b.cell/i,
      /bruton.{0,40}autosomal\s+(dominant|recessive)/i,
    ],
    requiredSupport: [/bruton.{0,40}(btk|x.linked|absent\s+b.cell)/i],
    source:         'First Aid 2025 p.113; Harrison\'s 21e Ch.345',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'immuno_004',
    domain:   'Immunology',
    expected: 'SLE: anti-dsDNA most specific for DISEASE ACTIVITY and lupus nephritis; anti-Smith most specific for SLE overall; ANA most sensitive (screening)',
    appliesTo: [
      /\b(sle|systemic\s+lupus)\b.{0,60}(anti.ds.?dna|anti.smith|ana\b)/i,
    ],
    contradictions: [
      /sle.{0,40}anti.smith.{0,20}(disease\s+activity|nephritis|most\s+active)/i,
      /sle.{0,40}ana\b.{0,20}(specific|most\s+specific)/i,
    ],
    requiredSupport: [
      /sle.{0,40}anti.ds.?dna.{0,30}(activity|nephritis|specific\s+for\s+activity)/i,
    ],
    source:         'First Aid 2025 p.467; Harrison\'s 21e Ch.349',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // HEMATOLOGY / ONCOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'heme_001',
    domain:   'Hematology',
    expected: 'Philadelphia chromosome t(9;22): creates BCR-ABL fusion gene; characteristic of CML; also found in poor-prognosis B-ALL; treated with imatinib (TKI)',
    appliesTo: [
      /\b(philadelphia\s+chr|t\s*\(\s*9\s*;\s*22\)|bcr.abl)\b/i,
    ],
    contradictions: [
      /philadelphia.{0,40}(cll|all.{0,10}good\s+prognosis|aml\b(?!\s+with))/i,
      /bcr.abl.{0,40}t\s*\(\s*(8|14|15|17)\s*;\s*(14|17|21|22)\s*\)/i,
    ],
    requiredSupport: [/philadelphia.{0,40}(cml|bcr.abl)/i],
    source:         'First Aid 2025 p.415; Harrison\'s 21e Ch.84',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_002',
    domain:   'Hematology',
    expected: 'Sickle cell disease: β-globin gene mutation (Glu→Val at position 6) — NOT α-globin; HbS tetramer (α2βS2)',
    appliesTo: [
      /\b(sickle\s+cell|hbs)\b.{0,60}(globin|mutation|gene|glu|val)/i,
    ],
    contradictions: [
      /sickle\s+cell.{0,40}alpha.{0,10}(globin|chain).{0,20}mutation/i,
      /hbs.{0,30}alpha.{0,10}globin/i,
    ],
    requiredSupport: [/sickle.{0,40}beta.{0,10}globin/i],
    source:         'First Aid 2025 p.406; Harrison\'s 21e Ch.94',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_003',
    domain:   'Hematology',
    expected: 'von Willebrand disease: MOST COMMON inherited bleeding disorder (not hemophilia A); increased bleeding time; normal or increased aPTT',
    appliesTo: [
      /\b(most\s+common.{0,20}inherited\s+bleeding|von\s+willebrand)\b/i,
    ],
    contradictions: [
      /hemophilia\s+a\b.{0,30}most\s+common\s+inherited\s+bleeding/i,
      /hemophilia.{0,20}most\s+common\s+hereditary\s+bleeding/i,
    ],
    requiredSupport: [/von\s+willebrand.{0,40}most\s+common\s+inherited/i],
    source:         'First Aid 2025 p.417; Harrison\'s 21e Ch.104',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_004',
    domain:   'Hematology',
    expected: 'Hemophilia A: Factor VIII deficiency; X-linked recessive; increased aPTT, NORMAL PT; hemarthroses in males',
    appliesTo: [
      /\bhemophilia\s+a\b.{0,60}(factor|pt|aptt|ptt)/i,
    ],
    contradictions: [
      /hemophilia\s+a.{0,40}(elevat|prolonged|increased)\s+(pt|inr)\b/i,
      /hemophilia\s+a.{0,40}factor\s+(ix|9|vii|7|x|10)/i,
    ],
    requiredSupport: [/hemophilia\s+a.{0,40}factor\s+(viii|8)/i],
    source:         'First Aid 2025 p.417',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_005',
    domain:   'Hematology',
    expected: 'TTP: ADAMTS13 deficiency; pentad (MAHA, thrombocytopenia, fever, renal failure, neuro symptoms); treat with PLASMAPHERESIS — NOT platelet transfusion (contraindicated)',
    appliesTo: [
      /\b(ttp|thrombotic\s+thrombocytopenic\s+purpura)\b.{0,60}(treat|management|plasma)/i,
    ],
    contradictions: [
      /ttp.{0,40}platelet\s+transfusion\b.{0,20}(treat|manage|first.line)/i,
    ],
    requiredSupport: [/ttp.{0,40}(plasmapheresis|plasma\s+exchange)/i],
    source:         'First Aid 2025 p.418; Harrison\'s 21e Ch.103',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_006',
    domain:   'Hematology',
    expected: 'HIT (heparin-induced thrombocytopenia): antibodies against heparin-PF4 complex; causes THROMBOSIS (not just bleeding); treat with ARGATROBAN or bivalirudin — NOT warfarin as initial monotherapy',
    appliesTo: [
      /\bhit\b.{0,40}(heparin|thrombocytopenia|pf4|treat)/i,
      /heparin.induced\s+thrombocytopenia.{0,40}treat/i,
    ],
    contradictions: [
      /hit.{0,40}warfarin\b.{0,20}(first.line|initial\s+treatment|immediately)/i,
      /hit.{0,40}continue\s+heparin/i,
    ],
    requiredSupport: [/hit.{0,40}(argatroban|bivalirudin|direct\s+thrombin\s+inhibitor)/i],
    source:         'First Aid 2025 p.418; ASH HIT Guidelines 2018',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

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
  },

  {
    id:       'heme_009',
    domain:   'Hematology',
    expected: 'G6PD deficiency: X-linked recessive; oxidative stress (primaquine, dapsone, fava beans, infections) → Heinz bodies + bite cells; hemolytic anemia',
    appliesTo: [
      /\bg6pd\b.{0,60}(heinz|bite\s+cell|hemolytic|oxidative)/i,
    ],
    contradictions: [
      /g6pd.{0,40}autosomal\s+(dominant|recessive)/i,
      /g6pd.{0,40}target\s+cell/i,
    ],
    requiredSupport: [/g6pd.{0,40}x.linked/i],
    source:         'First Aid 2025 p.406; Harrison\'s 21e Ch.94',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'heme_010',
    domain:   'Hematology',
    expected: 'APL (AML-M3): t(15;17) → PML-RARα fusion; treat with ATRA (all-trans retinoic acid) which causes differentiation; high risk of DIC',
    appliesTo: [
      /\b(apl\b|acute\s+promyelocytic|aml.?m3)\b/i,
    ],
    contradictions: [
      /apl.{0,40}(imatinib|gleevec).{0,20}(treat|first.line)/i,
      /apl.{0,40}t\s*\(\s*9\s*;\s*22\)/i,
    ],
    requiredSupport: [/apl.{0,40}(atra|t\s*\(\s*15\s*;\s*17\)|pml.rar)/i],
    source:         'First Aid 2025 p.415; Harrison\'s 21e Ch.84',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // REPRODUCTIVE
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'repro_001',
    domain:   'Reproductive',
    expected: 'Turner syndrome: 45,XO; short stature, webbed neck, coarctation of aorta, streak ovaries, primary amenorrhea, shield chest',
    appliesTo: [
      /\bturner\b.{0,60}(chromosome|45|karyotype|x[o0])/i,
    ],
    contradictions: [
      /turner.{0,40}(47|trisomy|extra\s+chromosome)/i,
      /turner.{0,40}47.{0,10}xx/i,
    ],
    requiredSupport: [/turner.{0,40}(45\s*[,\s]*xo|45\s*x\b)/i],
    source:         'First Aid 2025 p.616; Harrison\'s 21e Ch.398',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'repro_002',
    domain:   'Reproductive',
    expected: 'Klinefelter syndrome: 47,XXY; ELEVATED FSH and LH (hypergonadotropic hypogonadism); DECREASED testosterone; small testes; gynecomastia; tall stature',
    appliesTo: [
      /\bklinefelter\b.{0,60}(fsh|lh|testosterone|hypogonadism)/i,
    ],
    contradictions: [
      /klinefelter.{0,40}(low|decreased|suppressed)\s+(fsh|lh)/i,
      /klinefelter.{0,40}(high|elevated|raised)\s+testosterone/i,
    ],
    source:         'First Aid 2025 p.617; Harrison\'s 21e Ch.399',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'repro_003',
    domain:   'Reproductive',
    expected: 'Complete hydatidiform mole: 46,XX with ALL paternal chromosomes (androgenetic); no fetal parts; markedly elevated β-hCG; snowstorm on ultrasound',
    appliesTo: [
      /\b(complete\s+mole|complete\s+hydatidiform\s+mole)\b/i,
    ],
    contradictions: [
      /complete\s+mole.{0,40}(partial\s+maternal|maternal\s+and\s+paternal|biparental)/i,
      /complete\s+mole.{0,40}(fetal\s+parts?|fetal\s+tissue)/i,
      /complete\s+mole.{0,40}69.{0,10}(xxy|xxx)/i,
    ],
    requiredSupport: [/complete\s+mole.{0,40}(all\s+paternal|46\s*,?\s*xx\s*paternal|androgenetic)/i],
    source:         'First Aid 2025 p.621; Robbins 10e p.1066',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'repro_004',
    domain:   'Reproductive',
    expected: 'MgSO4 in preeclampsia is for SEIZURE PROPHYLAXIS — NOT an antihypertensive agent; first-line antihypertensives are labetalol, hydralazine, or nifedipine',
    appliesTo: [
      /\b(preeclampsia|eclampsia)\b.{0,60}(mgso4|magnesium\s+sulfate)/i,
    ],
    contradictions: [
      /mgso4.{0,40}preeclampsia.{0,40}(antihypertensive|lower\s+blood\s+pressure|bp\s+control)/i,
      /magnesium.{0,40}preeclampsia.{0,40}antihypertensive/i,
    ],
    requiredSupport: [/mgso4.{0,40}(seizure|convulsion|eclampsia\s+prophylaxis)/i],
    source:         'First Aid 2025 p.618; ACOG Preeclampsia Guidelines',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // MUSCULOSKELETAL / RHEUMATOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'msk_001',
    domain:   'Rheumatology',
    expected: 'RA: anti-CCP (anti-cyclic citrullinated peptide) most SPECIFIC; DIP joints SPARED; symmetric proximal joint involvement (MCP, PIP); morning stiffness >1 hour',
    appliesTo: [
      /\b(rheumatoid\s+arthritis|ra\b).{0,60}(dip|distal|anti.ccp|joint)/i,
    ],
    contradictions: [
      /rheumatoid\s+arthritis.{0,40}dip\s+(involv|affect)/i,
      /ra.{0,30}dip\s+(involv|affect)/i,
    ],
    source:         'First Aid 2025 p.461; Harrison\'s 21e Ch.351',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_002',
    domain:   'Rheumatology',
    expected: 'Gout crystals: NEGATIVELY birefringent, needle-shaped monosodium urate (MSU); Pseudogout (CPPD): WEAKLY POSITIVELY birefringent, rhomboid-shaped',
    appliesTo: [
      /\b(gout|pseudogout|cppd)\b.{0,60}(birefringent|crystal|polariz)/i,
    ],
    contradictions: [
      /gout.{0,40}(positive|weakly\s+positive)\s+birefringent/i,
      /gout.{0,40}rhomboid.{0,20}crystal/i,
      /pseudogout.{0,40}negative\s+birefringent/i,
      /pseudogout.{0,40}needle.shape/i,
    ],
    source:         'First Aid 2025 p.462; Harrison\'s 21e Ch.355',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_003',
    domain:   'Rheumatology',
    expected: 'Marfan syndrome lens dislocation: SUPEROTEMPORAL (upward and outward); Homocystinuria lens dislocation: INFEROMEDIAL (downward and inward)',
    appliesTo: [
      /\b(marfan|homocystinuria)\b.{0,60}(lens\s+disloc|ectopia\s+lentis)/i,
    ],
    contradictions: [
      /marfan.{0,40}lens.{0,20}(inferomedial|downward|inferior)/i,
      /homocystinuria.{0,40}lens.{0,20}(superotemporal|upward|superior)/i,
    ],
    source:         'First Aid 2025 p.57; Harrison\'s 21e Ch.408',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_004',
    domain:   'Rheumatology',
    expected: 'Systemic sclerosis: diffuse form → anti-Scl-70 (anti-topoisomerase I); limited form/CREST → anti-centromere antibody',
    appliesTo: [
      /\b(systemic\s+sclerosis|scleroderma|crest)\b.{0,60}(anti|antibod)/i,
    ],
    contradictions: [
      /diffuse\s+scleroderma.{0,40}anti.centromere/i,
      /crest.{0,40}anti.scl.?70/i,
      /limited.{0,20}scleroderma.{0,40}anti.scl.?70/i,
    ],
    source:         'First Aid 2025 p.468; Harrison\'s 21e Ch.354',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'msk_005',
    domain:   'Rheumatology',
    expected: 'Sjögren syndrome: anti-Ro/SSA (more common) and anti-La/SSB antibodies; increased risk of B-cell lymphoma; sicca complex (dry eyes + dry mouth)',
    appliesTo: [
      /\bsjogren\b.{0,60}(antibod|anti|lymphoma)/i,
    ],
    contradictions: [
      /sjogren.{0,40}anti.ds.?dna.{0,20}(specific|diagnostic)/i,
      /sjogren.{0,40}anti.centromere.{0,20}(specific|diagnostic)/i,
    ],
    requiredSupport: [/sjogren.{0,40}(anti.ro|ssa|anti.la|ssb)/i],
    source:         'First Aid 2025 p.468; Harrison\'s 21e Ch.353',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // DERMATOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'derm_001',
    domain:   'Dermatology',
    expected: 'Pemphigus vulgaris: anti-desmoglein 1 and 3 (desmosome); INTRAEPIDERMAL blister (acantholysis); Nikolsky sign POSITIVE; flaccid bullae; IgG',
    appliesTo: [
      /\bpemphigus\s+vulgaris\b/i,
    ],
    contradictions: [
      /pemphigus\s+vulgaris.{0,40}subepidermal/i,
      /pemphigus\s+vulgaris.{0,40}nikolsky.{0,20}(negative|absent)/i,
      /pemphigus\s+vulgaris.{0,40}anti.bp\w+/i,
    ],
    requiredSupport: [/pemphigus\s+vulgaris.{0,40}(intraepidermal|desmoglein|nikolsky.{0,20}positive)/i],
    source:         'First Aid 2025 p.482; Robbins 10e p.1155',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'derm_002',
    domain:   'Dermatology',
    expected: 'Bullous pemphigoid: anti-BPAG1/BPAG2 (hemidesmosome at DEJ); SUBEPIDERMAL blister; Nikolsky sign NEGATIVE; tense bullae; elderly patients',
    appliesTo: [
      /\bbullous\s+pemphigoid\b/i,
    ],
    contradictions: [
      /bullous\s+pemphigoid.{0,40}intraepidermal/i,
      /bullous\s+pemphigoid.{0,40}nikolsky.{0,20}(positive|present)/i,
      /bullous\s+pemphigoid.{0,40}anti.desmoglein/i,
    ],
    requiredSupport: [/bullous\s+pemphigoid.{0,40}(subepidermal|hemidesmosome|nikolsky.{0,20}negative|tense)/i],
    source:         'First Aid 2025 p.482; Robbins 10e p.1156',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'derm_003',
    domain:   'Dermatology',
    expected: 'SJS/TEN most common drug causes: sulfonamides, anticonvulsants (carbamazepine, phenytoin, lamotrigine), allopurinol, nevirapine; SJS <10% BSA, TEN >30% BSA',
    appliesTo: [
      /\b(stevens.johnson|sjs|toxic\s+epidermal\s+necrolysis|ten\b).{0,40}(drug|caused|sulfa)/i,
    ],
    contradictions: [
      /sjs.{0,40}most\s+common.{0,20}penicillin/i,
      /ten.{0,40}most\s+common.{0,20}amoxicillin/i,
    ],
    source:         'First Aid 2025 p.484; UpToDate 2025',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PSYCHIATRY
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PHARMACOLOGY
  // ══════════════════════════════════════════════════════════════════════════

  {
    id:       'pharm_001',
    domain:   'Pharmacology',
    expected: 'Thiazide diuretics cause HYPERCALCEMIA (increase DCT calcium reabsorption); Loop diuretics (furosemide) cause HYPOCALCEMIA',
    appliesTo: [
      /\b(thiazide|hctz|hydrochlorothiazide)\b.{0,60}(calcium|calciur)/i,
      /\b(furosemide|loop\s+diuretic)\b.{0,60}(calcium|calciur)/i,
    ],
    contradictions: [
      /thiazide.{0,40}(hypocalcemia|low\s+calcium|decreased\s+calcium)/i,
      /furosemide.{0,40}(hypercalcemia|elevated\s+calcium|increased\s+calcium)/i,
      /loop\s+diuretic.{0,40}hypercalcemia/i,
    ],
    source:         'First Aid 2025 p.614; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_002',
    domain:   'Pharmacology',
    expected: 'ACE inhibitor cough is caused by BRADYKININ accumulation (not angiotensin II); ARBs have no cough because they do not affect bradykinin',
    appliesTo: [
      /\b(ace\s+inhibitor|acei|captopril|lisinopril|enalapril)\b.{0,60}(cough|bradykinin)/i,
    ],
    contradictions: [
      /ace\s+inhibitor.{0,40}cough.{0,40}angiotensin\s+ii\b/i,
      /acei.{0,40}cough.{0,40}caused\s+by\s+angiotensin/i,
    ],
    requiredSupport: [/ace\s+inhibitor.{0,40}cough.{0,40}bradykinin/i],
    source:         'First Aid 2025 p.316; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_003',
    domain:   'Pharmacology',
    expected: 'Heparin reversal: PROTAMINE SULFATE; Warfarin reversal: Vitamin K (slow) or FFP/PCC (fast); these agents are NOT interchangeable',
    appliesTo: [
      /\b(heparin|warfarin)\b.{0,60}reversal/i,
      /revers.{0,30}(heparin|warfarin)/i,
    ],
    contradictions: [
      /heparin.{0,40}revers.{0,30}(vitamin\s+k|warfarin)/i,
      /warfarin.{0,40}revers.{0,30}protamine/i,
    ],
    requiredSupport: [
      /heparin.{0,40}protamine/i,
      /warfarin.{0,40}(vitamin\s+k|ffp|pcc)/i,
    ],
    source:         'First Aid 2025 p.420; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_004',
    domain:   'Pharmacology',
    expected: 'Aspirin: IRREVERSIBLE COX-1/COX-2 inhibitor (covalent acetylation); platelet effect lasts 7–10 days (platelet lifespan); NSAIDs are reversible competitive inhibitors',
    appliesTo: [
      /\baspirin\b.{0,60}(irrevers|reversible|cox|platelet|lifespan)/i,
    ],
    contradictions: [
      /aspirin.{0,40}reversible\s+(cox|inhibit)/i,
      /nsaid.{0,40}irreversible\s+(cox|inhibit)/i,
    ],
    requiredSupport: [/aspirin.{0,40}irreversible/i],
    source:         'First Aid 2025 p.483; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_005',
    domain:   'Pharmacology',
    expected: 'Aminoglycosides: nephrotoxicity (synergistic with vancomycin) + ototoxicity (sensorineural hearing loss); NOT primarily hepatotoxic; monitor peak/trough levels',
    appliesTo: [
      /\b(aminoglycoside|gentamicin|tobramycin|amikacin)\b.{0,60}(toxicity|ototoxic|nephrotoxic)/i,
    ],
    contradictions: [
      /aminoglycoside.{0,40}hepatotoxic.{0,20}(primary|main|most\s+common)/i,
      /aminoglycoside.{0,40}ototoxic.{0,20}conductive/i,
    ],
    requiredSupport: [/aminoglycoside.{0,40}(ototoxic|nephrotoxic|sensorineural)/i],
    source:         'First Aid 2025 p.191; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_006',
    domain:   'Pharmacology',
    expected: 'Vancomycin "Red Man Syndrome": NOT an IgE-mediated allergic reaction; rate-related direct mast cell/basophil degranulation → histamine release; treat by slowing infusion rate',
    appliesTo: [
      /\b(vancomycin|red\s+man\s+syndrome)\b.{0,60}(allerg|iGe|histamine|reaction)/i,
    ],
    contradictions: [
      /red\s+man.{0,40}(ige.mediat|type\s+i\s+hypersensitiv|allerg\w*\s+reaction)/i,
      /red\s+man.{0,40}(anaphylactic|anaphylaxis)/i,
    ],
    source:         'First Aid 2025 p.192; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  {
    id:       'pharm_007',
    domain:   'Pharmacology',
    expected: 'Metformin: biguanide; DECREASES hepatic gluconeogenesis; does NOT cause hypoglycemia alone; risk of lactic acidosis (hold before contrast dye, contraindicated in renal failure)',
    appliesTo: [
      /\bmetformin\b.{0,60}(mechanism|gluconeogenesis|lactic\s+acidosis|renal)/i,
    ],
    contradictions: [
      /metformin.{0,40}(increase|stimulate).{0,20}(insulin\s+secretion|insulin\s+release)/i,
      /metformin.{0,40}sulfonylurea.{0,20}(same|similar)\s+mechanism/i,
    ],
    requiredSupport: [/metformin.{0,40}(hepatic\s+gluconeogenesis|decrease\s+glucose\s+production)/i],
    source:         'First Aid 2025 p.356; Goodman & Gilman 13e',
    reviewStatus:   'expert_reviewed',
    lastReviewed:   '2026-06-15',
  },

  // ══════════════════════════════════════════════════════════════════════════
  // BIOCHEMISTRY
  // ══════════════════════════════════════════════════════════════════════════

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
  },

  // ══════════════════════════════════════════════════════════════════════════
  // GENETICS
  // ══════════════════════════════════════════════════════════════════════════

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
  },
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
