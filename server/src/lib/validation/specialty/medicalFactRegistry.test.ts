import { describe, expect, it } from 'vitest';
import { validateQuestion } from '../validationEngine.js';
import type { ValidationQuestion } from '../validationTypes.js';

function q(overrides: Partial<ValidationQuestion>): ValidationQuestion {
  return {
    subject: 'Pharmacology',
    system: 'Psychiatry',
    difficulty: 'Balanced',
    topic: 'Lithium',
    testedConcept: 'Lithium adverse effects',
    questionAngle: 'mechanism',
    usmleContentArea: 'Behavioral Health',
    physicianTask: 'Medical Knowledge: Applying Foundational Science Concepts',
    stem: 'A patient with bipolar disorder is treated with lithium for long-term mood stabilization. Which adverse effect is classically associated with this medication?',
    options: [
      { letter: 'A', text: 'Nephrogenic diabetes insipidus with polyuria' },
      { letter: 'B', text: 'Serotonin reuptake inhibition causing sexual dysfunction' },
      { letter: 'C', text: 'D2 receptor blockade causing acute dystonia' },
      { letter: 'D', text: 'GABA-A modulation causing sedation' },
    ],
    correct: 'A',
    explanation: 'Lithium is used for long-term mood stabilization in bipolar disorder and has a narrow therapeutic index. Important adverse effects include nephrogenic diabetes insipidus from impaired renal response to ADH, fine tremor, hypothyroidism, and Ebstein anomaly risk with first-trimester exposure.',
    optionExplanations: {
        A: 'Correct because lithium can impair collecting duct response to ADH and cause nephrogenic diabetes insipidus with polyuria and polydipsia.',
        B: 'Incorrect because serotonin reuptake inhibition describes SSRIs, not lithium mood stabilization.',
        C: 'Incorrect because D2 receptor blockade describes many antipsychotics and can cause acute dystonia.',
        D: 'Incorrect because GABA-A modulation describes benzodiazepines and barbiturates rather than lithium.',
    },
    ...overrides,
  };
}

async function validate(question: ValidationQuestion) {
  return validateQuestion({
    question,
    mode: 'practice',
    difficulty: question.difficulty || 'Balanced',
    requestedScope: {
      subject: question.subject,
      system: question.system,
      topic: question.topic,
    },
    policy: { requiresMedicalReview: false },
  });
}

describe('medical fact registry validation', () => {
  it('passes a correct lithium adverse effect fact', async () => {
    const result = await validate(q({}));

    expect(result.passed).toBe(true);
    expect(result.validators.find(v => v.name === 'specialty')?.status).toBe('pass');
  });

  it('fails when lithium is explained as serotonin reuptake inhibition', async () => {
    const result = await validate(q({
      options: [
        { letter: 'A', text: 'Serotonin reuptake inhibition causing sexual dysfunction' },
        { letter: 'B', text: 'Nephrogenic diabetes insipidus with polyuria' },
        { letter: 'C', text: 'Tremor and hypothyroidism' },
        { letter: 'D', text: 'Ebstein anomaly risk in pregnancy' },
      ],
      correct: 'A',
      explanation: 'This answer claims lithium works by serotonin reuptake inhibition and therefore causes SSRI-like sexual dysfunction. That mechanism belongs to selective serotonin reuptake inhibitors rather than lithium maintenance therapy for bipolar disorder.',
      optionExplanations: {
        A: 'Correct because this explanation identifies lithium as a serotonin reuptake inhibitor with SSRI-like sexual adverse effects.',
        B: 'Incorrect because this answer rejects nephrogenic diabetes insipidus as an adverse effect.',
        C: 'Incorrect because this answer rejects tremor and hypothyroidism as lithium toxicities.',
        D: 'Incorrect because this answer rejects the teratogenic cardiac association.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_pharmacology_lithium_toxicity_contradiction');
  });

  it('reports multiple specialty failures from one generated question', async () => {
    const result = await validate(q({
      topic: 'ACE inhibitors and lithium toxicity',
      testedConcept: 'ACE inhibitor mechanism and lithium adverse effects',
      stem: 'A patient with bipolar disorder and hypertension is discussed in a teaching session comparing lithium toxicity with ACE inhibitor adverse effects. Which statement correctly describes both high-yield mechanisms?',
      options: [
        { letter: 'A', text: 'Lithium acts as a serotonin reuptake inhibitor, and lisinopril blocks beta-1 receptors' },
        { letter: 'B', text: 'Lithium can cause nephrogenic diabetes insipidus, and ACE inhibitors increase bradykinin' },
        { letter: 'C', text: 'Lithium blocks D2 receptors, and ACE inhibitors directly inhibit renin' },
        { letter: 'D', text: 'Lithium modulates GABA-A receptors, and ACE inhibitors block calcium channels' },
      ],
      correct: 'A',
      explanation: 'This answer states that lithium works by serotonin reuptake inhibition and that lisinopril works by beta-1 receptor blockade. It presents both mechanisms as correct explanations for the medications.',
      optionExplanations: {
        A: 'Correct because lithium is described as a serotonin reuptake inhibitor and lisinopril is described as a beta-1 blocker.',
        B: 'Incorrect because nephrogenic diabetes insipidus and bradykinin accumulation are rejected by this explanation.',
        C: 'Incorrect because D2 blockade and direct renin inhibition are not selected.',
        D: 'Incorrect because GABA-A modulation and calcium channel blockade are not selected.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_pharmacology_lithium_toxicity_contradiction');
    expect(result.rejectionReasons).toContain('specialty:pharmacology_ace_inhibitor_mechanism_contradiction');

    const specialty = result.validators.find(v => v.name === 'specialty');
    expect(specialty?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'fact_registry_pharmacology_lithium_toxicity_contradiction' }),
      expect.objectContaining({ reason: 'pharmacology_ace_inhibitor_mechanism_contradiction' }),
    ]));
    expect(specialty?.details).toHaveLength(2);
    expect((specialty?.detected || '').length).toBeLessThanOrEqual(600);
  });

  it('reports multiple fact-registry failures with review metadata', async () => {
    const result = await validate(q({
      topic: 'Lithium and Parkinson disease',
      testedConcept: 'Lithium toxicity and Parkinson pathology',
      system: 'Neurology',
      stem: 'A teaching question compares lithium adverse effects with Parkinson disease pathology. Which statement correctly pairs both concepts?',
      options: [
        { letter: 'A', text: 'Lithium is a serotonin reuptake inhibitor, and Parkinson disease is caused by huntingtin caudate atrophy' },
        { letter: 'B', text: 'Lithium can cause nephrogenic diabetes insipidus, and Parkinson disease involves substantia nigra dopaminergic neuron loss' },
        { letter: 'C', text: 'Lithium blocks D2 receptors, and Parkinson disease is caused by beta-amyloid plaques' },
        { letter: 'D', text: 'Lithium modulates GABA-A receptors, and Parkinson disease is caused by CNS demyelination' },
      ],
      correct: 'A',
      explanation: 'This answer states that lithium works by serotonin reuptake inhibition and that Parkinson disease is caused by huntingtin mutation with caudate atrophy.',
      optionExplanations: {
        A: 'Correct because it identifies lithium as a serotonin reuptake inhibitor and Parkinson disease as huntingtin-related caudate atrophy.',
        B: 'Incorrect because nephrogenic diabetes insipidus and substantia nigra dopaminergic loss are rejected.',
        C: 'Incorrect because D2 blockade and beta-amyloid pathology are not selected.',
        D: 'Incorrect because GABA-A modulation and CNS demyelination are not selected.',
      },
    }));

    const specialty = result.validators.find(v => v.name === 'specialty');

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_pharmacology_lithium_toxicity_contradiction');
    expect(result.rejectionReasons).toContain('specialty:fact_registry_neurology_parkinson_dopamine_loss_contradiction');
    expect(specialty?.details).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: 'fact_registry_pharmacology_lithium_toxicity_contradiction',
        factId: 'pharmacology_lithium_toxicity',
        domain: 'Pharmacology',
        reviewStatus: 'seed_review_required',
        source: 'Medica internal USMLE high-yield seed rule',
      }),
      expect.objectContaining({
        reason: 'fact_registry_neurology_parkinson_dopamine_loss_contradiction',
        factId: 'neurology_parkinson_dopamine_loss',
        domain: 'Neurology',
        reviewStatus: 'seed_review_required',
        source: 'Medica internal USMLE high-yield seed rule',
      }),
    ]));
  });

  it('fails when Parkinson disease is explained as Huntington caudate pathology', async () => {
    const result = await validate(q({
      subject: 'Pathology',
      system: 'Neurology',
      topic: 'Parkinson disease',
      testedConcept: 'Substantia nigra dopaminergic neuron loss',
      usmleContentArea: 'Nervous System & Special Senses',
      stem: 'A patient has resting tremor, bradykinesia, rigidity, and shuffling gait. Which pathologic finding explains Parkinson disease?',
      options: [
        { letter: 'A', text: 'Huntingtin mutation with caudate atrophy' },
        { letter: 'B', text: 'Loss of dopaminergic neurons in the substantia nigra pars compacta' },
        { letter: 'C', text: 'Amyloid plaques in the cerebral cortex' },
        { letter: 'D', text: 'Demyelinating plaques separated in time and space' },
      ],
      correct: 'A',
      explanation: 'Parkinson disease is caused by huntingtin mutation with caudate atrophy and chorea.',
      optionExplanations: {
        A: 'Correct because Parkinson disease is caused by huntingtin mutation and caudate degeneration.',
        B: 'Incorrect because substantia nigra dopaminergic loss is unrelated.',
        C: 'Incorrect because amyloid plaques indicate Alzheimer disease.',
        D: 'Incorrect because demyelinating plaques indicate multiple sclerosis.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_neurology_parkinson_dopamine_loss_contradiction');
  });

  it('fails when Von Gierke disease is attributed to debranching enzyme deficiency', async () => {
    const result = await validate(q({
      subject: 'Biochemistry',
      system: 'Gastrointestinal',
      topic: 'Von Gierke disease',
      testedConcept: 'Glucose-6-phosphatase deficiency',
      usmleContentArea: 'Biochemistry & Nutrition',
      stem: 'An infant has severe fasting hypoglycemia, lactic acidosis, hyperuricemia, and hepatomegaly due to glycogen storage disease type I. Which enzyme is deficient?',
      options: [
        { letter: 'A', text: 'Debranching enzyme' },
        { letter: 'B', text: 'Glucose-6-phosphatase' },
        { letter: 'C', text: 'Myophosphorylase' },
        { letter: 'D', text: 'Lysosomal acid alpha-glucosidase' },
      ],
      correct: 'A',
      explanation: 'Von Gierke disease is caused by debranching enzyme deficiency, also called Cori disease.',
      optionExplanations: {
        A: 'Correct because glycogen storage disease type I is debranching enzyme deficiency.',
        B: 'Incorrect because glucose-6-phosphatase deficiency is not involved.',
        C: 'Incorrect because myophosphorylase deficiency causes McArdle disease.',
        D: 'Incorrect because acid alpha-glucosidase deficiency causes Pompe disease.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_biochemistry_von_gierke_g6pase_contradiction');
  });
});

describe('medical fact registry expanded canonical facts', () => {
  it('fails when Alzheimer disease is explained as Huntington caudate atrophy', async () => {
    const result = await validate(q({
      subject: 'Pathology',
      system: 'Neurology',
      topic: 'Alzheimer disease',
      testedConcept: 'Amyloid plaques and tau tangles',
      usmleContentArea: 'Nervous System & Special Senses',
      stem: 'An older adult has progressive memory loss, impaired executive function, and cortical atrophy. Which pathologic finding is most associated with Alzheimer disease?',
      options: [
        { letter: 'A', text: 'Huntingtin mutation with caudate atrophy' },
        { letter: 'B', text: 'Beta-amyloid plaques and hyperphosphorylated tau tangles' },
        { letter: 'C', text: 'Loss of dopaminergic neurons in the substantia nigra' },
        { letter: 'D', text: 'CNS demyelination separated in time and space' },
      ],
      correct: 'A',
      explanation: 'Alzheimer disease is caused by huntingtin mutation with caudate atrophy and choreiform movements.',
      optionExplanations: {
        A: 'Correct because this answer attributes dementia to huntingtin-related caudate degeneration.',
        B: 'Incorrect because amyloid plaques and tau tangles are not selected in this explanation.',
        C: 'Incorrect because substantia nigra degeneration causes Parkinson disease.',
        D: 'Incorrect because demyelination separated in time and space indicates multiple sclerosis.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_neurology_alzheimer_amyloid_tau_contradiction');
  });

  it('fails when cystic fibrosis is attributed to dystrophin mutation', async () => {
    const result = await validate(q({
      subject: 'Genetics',
      system: 'Respiratory',
      topic: 'Cystic fibrosis',
      testedConcept: 'CFTR chloride channel defect',
      usmleContentArea: 'Respiratory System',
      stem: 'A child has recurrent sinopulmonary infections, pancreatic insufficiency, failure to thrive, and elevated sweat chloride. Which genetic defect causes cystic fibrosis?',
      options: [
        { letter: 'A', text: 'Dystrophin mutation causing membrane instability' },
        { letter: 'B', text: 'CFTR chloride channel defect causing thick secretions' },
        { letter: 'C', text: 'Fibrillin-1 defect causing abnormal connective tissue' },
        { letter: 'D', text: 'Hexosaminidase A deficiency causing lysosomal storage' },
      ],
      correct: 'A',
      explanation: 'Cystic fibrosis is caused by a dystrophin mutation that destabilizes muscle cell membranes.',
      optionExplanations: {
        A: 'Correct because the explanation identifies dystrophin as the causative gene.',
        B: 'Incorrect because CFTR is not selected in this answer.',
        C: 'Incorrect because fibrillin-1 causes Marfan syndrome.',
        D: 'Incorrect because hexosaminidase A deficiency causes Tay-Sachs disease.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_genetics_cystic_fibrosis_cftr_contradiction');
  });

  it('fails when sickle cell disease is attributed to alpha-globin deletion', async () => {
    const result = await validate(q({
      subject: 'Pathology',
      system: 'Hematology',
      topic: 'Sickle cell disease',
      testedConcept: 'Beta-globin mutation and HbS polymerization',
      usmleContentArea: 'Blood & Lymphoreticular System',
      stem: 'A child has recurrent vaso-occlusive pain crises, dactylitis, hemolytic anemia, and functional asplenia. Which molecular defect causes sickle cell disease?',
      options: [
        { letter: 'A', text: 'Alpha-globin gene deletion' },
        { letter: 'B', text: 'Beta-globin missense mutation causing HbS polymerization' },
        { letter: 'C', text: 'Spectrin defect causing spherocytes' },
        { letter: 'D', text: 'G6PD deficiency causing oxidative hemolysis' },
      ],
      correct: 'A',
      explanation: 'Sickle cell disease results from alpha-globin gene deletion rather than abnormal hemoglobin polymerization.',
      optionExplanations: {
        A: 'Correct because alpha-globin deletion is identified as the disease mechanism.',
        B: 'Incorrect because beta-globin HbS polymerization is not selected.',
        C: 'Incorrect because spectrin defects cause hereditary spherocytosis.',
        D: 'Incorrect because G6PD deficiency causes oxidative hemolysis.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_hematology_sickle_cell_beta_globin_contradiction');
  });

  it('fails when Wilson disease is attributed to HFE iron overload', async () => {
    const result = await validate(q({
      subject: 'Pathology',
      system: 'Gastrointestinal',
      topic: 'Wilson disease',
      testedConcept: 'ATP7B copper excretion defect',
      usmleContentArea: 'Gastrointestinal System',
      stem: 'A teenager has personality changes, tremor, liver disease, low ceruloplasmin, and Kayser-Fleischer rings. Which mechanism causes Wilson disease?',
      options: [
        { letter: 'A', text: 'HFE mutation causing intestinal iron overload' },
        { letter: 'B', text: 'ATP7B defect impairing biliary copper excretion' },
        { letter: 'C', text: 'Alpha-1 antitrypsin accumulation in hepatocytes' },
        { letter: 'D', text: 'Defective bilirubin conjugation' },
      ],
      correct: 'A',
      explanation: 'Wilson disease is caused by HFE mutation with iron overload, high ferritin, and bronze diabetes.',
      optionExplanations: {
        A: 'Correct because the explanation identifies HFE-related iron overload as the mechanism.',
        B: 'Incorrect because ATP7B copper transport is not selected.',
        C: 'Incorrect because alpha-1 antitrypsin disease has a different mechanism.',
        D: 'Incorrect because bilirubin conjugation defects cause inherited hyperbilirubinemias.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_hepatology_wilson_atp7b_copper_contradiction');
  });

  it('fails when 21-hydroxylase deficiency is explained as increased aldosterone and decreased androgens', async () => {
    const result = await validate(q({
      subject: 'Physiology',
      system: 'Endocrine',
      topic: '21-hydroxylase deficiency',
      testedConcept: 'Congenital adrenal hyperplasia salt wasting',
      usmleContentArea: 'Endocrine System',
      stem: 'A newborn has ambiguous genitalia, vomiting, dehydration, hypotension, hyponatremia, and hyperkalemia. Which hormone pattern is expected in 21-hydroxylase deficiency?',
      options: [
        { letter: 'A', text: 'Increased cortisol and aldosterone with decreased androgens' },
        { letter: 'B', text: 'Decreased cortisol and aldosterone with increased androgens' },
        { letter: 'C', text: 'Isolated mineralocorticoid excess' },
        { letter: 'D', text: 'Decreased ACTH with low adrenal steroid production' },
      ],
      correct: 'A',
      explanation: '21-hydroxylase deficiency causes increased cortisol, increased aldosterone, and decreased adrenal androgens.',
      optionExplanations: {
        A: 'Correct because this answer states cortisol and aldosterone increase while androgen synthesis falls.',
        B: 'Incorrect because salt wasting and virilization are not selected in this explanation.',
        C: 'Incorrect because isolated mineralocorticoid excess does not explain virilization.',
        D: 'Incorrect because ACTH is typically increased, not suppressed.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:fact_registry_endocrine_21_hydroxylase_cah_contradiction');
  });
});
