import { describe, expect, it } from 'vitest';
import { validateQuestion } from '../validationEngine.js';
import type { ValidationQuestion } from '../validationTypes.js';

function q(overrides: Partial<ValidationQuestion>): ValidationQuestion {
  return {
    subject: 'Pharmacology',
    system: 'Cardiovascular',
    difficulty: 'Balanced',
    topic: 'ACE inhibitors',
    testedConcept: 'ACE inhibitor cough mechanism',
    questionAngle: 'mechanism',
    usmleContentArea: 'Cardiovascular System',
    physicianTask: 'Medical Knowledge: Applying Foundational Science Concepts',
    stem: 'A 55-year-old man with hypertension starts lisinopril. Two weeks later he develops a persistent dry cough. Which mechanism best explains this adverse effect?',
    options: [
      { letter: 'A', text: 'Bradykinin accumulation from ACE inhibition' },
      { letter: 'B', text: 'Beta-1 receptor blockade' },
      { letter: 'C', text: 'Direct renin inhibition' },
      { letter: 'D', text: 'Calcium channel blockade' },
    ],
    correct: 'A',
    explanation: 'ACE inhibitors block angiotensin-converting enzyme, reducing angiotensin II and increasing bradykinin because ACE normally degrades bradykinin. Bradykinin accumulation explains the cough.',
    optionExplanations: {
      A: 'Correct because ACE inhibition increases bradykinin.',
      B: 'Incorrect because beta-1 blockade is a beta blocker mechanism.',
      C: 'Incorrect because direct renin inhibition describes aliskiren.',
      D: 'Incorrect because calcium channel blockade does not explain ACE inhibitor cough.',
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

describe('specialty validation — pharmacology', () => {
  it('passes a correct ACE inhibitor mechanism question', async () => {
    const result = await validate(q({}));

    expect(result.passed).toBe(true);
    expect(result.validators.find(v => v.name === 'specialty')?.status).toBe('pass');
  });

  it('fails when an ACE inhibitor question claims beta-1 blockade as the correct mechanism', async () => {
    const result = await validate(q({
      correct: 'B',
      explanation: 'Lisinopril works by beta-1 receptor blockade, decreasing heart rate and renin release. This beta-blocker mechanism explains the cough.',
      optionExplanations: {
        A: 'Incorrect because bradykinin is not involved.',
        B: 'Correct because lisinopril blocks beta-1 receptors.',
        C: 'Incorrect because direct renin inhibition is less likely.',
        D: 'Incorrect because calcium channel blockade is not involved.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:pharmacology_ace_inhibitor_mechanism_contradiction');
  });

  it('fails when a loop diuretic question places the mechanism in the DCT', async () => {
    const result = await validate(q({
      subject: 'Pharmacology',
      system: 'Renal / Urinary',
      topic: 'Loop diuretics',
      testedConcept: 'Furosemide mechanism',
      usmleContentArea: 'Renal & Urinary System',
      stem: 'A 64-year-old man with pulmonary edema receives furosemide and rapidly increases urine output. Which transporter is directly inhibited by this drug?',
      options: [
        { letter: 'A', text: 'Na-Cl cotransporter in the distal convoluted tubule' },
        { letter: 'B', text: 'Na-K-2Cl cotransporter in the thick ascending limb' },
        { letter: 'C', text: 'ENaC in the collecting duct' },
        { letter: 'D', text: 'Aquaporin-2 in the collecting duct' },
      ],
      correct: 'A',
      explanation: 'Furosemide is a loop diuretic but directly inhibits the Na-Cl cotransporter in the distal convoluted tubule.',
      optionExplanations: {
        A: 'Correct because loop diuretics act on the DCT Na-Cl cotransporter.',
        B: 'Incorrect because NKCC2 is not the target.',
        C: 'Incorrect because ENaC is blocked by amiloride.',
        D: 'Incorrect because aquaporin regulation is related to ADH.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:pharmacology_loop_diuretic_site_contradiction');
  });
});

describe('specialty validation expanded pharmacology coverage', () => {
  it('passes a correct aminoglycoside mechanism question', async () => {
    const result = await validate(q({
      subject: 'Pharmacology',
      system: 'Infectious Disease',
      topic: 'Aminoglycosides',
      testedConcept: 'Gentamicin 30S ribosomal mechanism',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A patient with severe gram-negative sepsis receives gentamicin. Which mechanism best explains the antibacterial effect of this drug?',
      options: [
        { letter: 'A', text: 'Binding the 30S ribosomal subunit and causing misreading of mRNA' },
        { letter: 'B', text: 'Binding the 50S ribosomal subunit' },
        { letter: 'C', text: 'Inhibiting DNA gyrase' },
        { letter: 'D', text: 'Blocking folate synthesis' },
      ],
      correct: 'A',
      explanation: 'Gentamicin is an aminoglycoside that binds the 30S ribosomal subunit and causes misreading of mRNA. Aminoglycosides can cause nephrotoxicity and ototoxicity.',
      optionExplanations: {
        A: 'Correct because aminoglycosides bind the 30S subunit and cause misreading of mRNA.',
        B: 'Incorrect because 50S binding describes macrolides, clindamycin, and chloramphenicol.',
        C: 'Incorrect because DNA gyrase inhibition describes fluoroquinolones.',
        D: 'Incorrect because folate synthesis blockade describes sulfonamides or trimethoprim.',
      },
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when an aminoglycoside is explained as a 50S inhibitor', async () => {
    const result = await validate(q({
      subject: 'Pharmacology',
      system: 'Infectious Disease',
      topic: 'Aminoglycosides',
      testedConcept: 'Gentamicin 30S ribosomal mechanism',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A patient with severe gram-negative sepsis receives gentamicin. Which mechanism best explains the antibacterial effect of this aminoglycoside?',
      options: [
        { letter: 'A', text: 'Binding the 50S ribosomal subunit' },
        { letter: 'B', text: 'Binding the 30S ribosomal subunit' },
        { letter: 'C', text: 'Inhibiting DNA gyrase' },
        { letter: 'D', text: 'Blocking folate synthesis' },
      ],
      correct: 'A',
      explanation: 'Gentamicin is an aminoglycoside that kills bacteria by binding the 50S ribosomal subunit and blocking peptide elongation.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:pharmacology_aminoglycoside_mechanism_contradiction');
  });

  it('fails when a fluoroquinolone is explained as cell-wall inhibition', async () => {
    const result = await validate(q({
      subject: 'Pharmacology',
      system: 'Infectious Disease',
      topic: 'Fluoroquinolones',
      testedConcept: 'Ciprofloxacin DNA gyrase mechanism',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A patient with complicated urinary tract infection receives ciprofloxacin. Which mechanism explains the activity of this fluoroquinolone?',
      options: [
        { letter: 'A', text: 'Inhibition of peptidoglycan cell-wall transpeptidase' },
        { letter: 'B', text: 'Inhibition of bacterial DNA gyrase' },
        { letter: 'C', text: 'Binding to the 30S ribosomal subunit' },
        { letter: 'D', text: 'Blocking folate synthesis' },
      ],
      correct: 'A',
      explanation: 'Ciprofloxacin is a fluoroquinolone that acts by blocking peptidoglycan cell wall transpeptidase activity.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:pharmacology_fluoroquinolone_mechanism_contradiction');
  });

  it('fails when an SSRI is explained as a GABA benzodiazepine mechanism', async () => {
    const result = await validate(q({
      subject: 'Pharmacology',
      system: 'Psychiatry',
      topic: 'SSRIs',
      testedConcept: 'Fluoxetine serotonin reuptake inhibition',
      usmleContentArea: 'Behavioral Health',
      stem: 'A patient with major depressive disorder starts fluoxetine. Which mechanism explains this SSRI medication?',
      options: [
        { letter: 'A', text: 'Positive allosteric modulation of GABA-A receptors like a benzodiazepine' },
        { letter: 'B', text: 'Inhibition of serotonin reuptake' },
        { letter: 'C', text: 'Blockade of dopamine D2 receptors' },
        { letter: 'D', text: 'Monoamine oxidase inhibition' },
      ],
      correct: 'A',
      explanation: 'Fluoxetine is an SSRI that works by enhancing GABA-A receptor activity, similar to benzodiazepines.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:pharmacology_ssri_mechanism_contradiction');
  });
});

describe('specialty validation expanded microbiology coverage', () => {
  it('fails when pneumococcus is described as beta-hemolytic and bacitracin sensitive', async () => {
    const result = await validate(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      topic: 'Streptococcus pneumoniae',
      testedConcept: 'Pneumococcus identity',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A patient has lobar pneumonia caused by Streptococcus pneumoniae. Which lab description best identifies this pneumococcus?',
      options: [
        { letter: 'A', text: 'Beta-hemolytic bacitracin-sensitive organism' },
        { letter: 'B', text: 'Alpha-hemolytic optochin-sensitive lancet-shaped diplococcus' },
        { letter: 'C', text: 'Coagulase-positive cocci in clusters' },
        { letter: 'D', text: 'Oxidase-positive gram-negative diplococcus' },
      ],
      correct: 'A',
      explanation: 'Streptococcus pneumoniae is beta-hemolytic and bacitracin sensitive.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:microbiology_pneumococcus_identity_contradiction');
  });

  it('fails when E coli is described as gram-positive cocci in clusters', async () => {
    const result = await validate(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      topic: 'Escherichia coli',
      testedConcept: 'E coli identity',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A woman has cystitis caused by Escherichia coli. Which description best identifies E coli?',
      options: [
        { letter: 'A', text: 'Gram-positive cocci in clusters' },
        { letter: 'B', text: 'Gram-negative lactose-fermenting rod' },
        { letter: 'C', text: 'Acid-fast bacillus' },
        { letter: 'D', text: 'Oxidase-positive diplococcus' },
      ],
      correct: 'A',
      explanation: 'Escherichia coli is a gram-positive organism arranged as cocci in clusters.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:microbiology_ecoli_identity_contradiction');
  });

  it('fails when Pseudomonas is described as a lactose-fermenting organism', async () => {
    const result = await validate(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      topic: 'Pseudomonas aeruginosa',
      testedConcept: 'Pseudomonas identity',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A patient with cystic fibrosis has pneumonia caused by Pseudomonas aeruginosa. Which description best identifies this organism?',
      options: [
        { letter: 'A', text: 'Lactose-fermenting coagulase-positive organism' },
        { letter: 'B', text: 'Oxidase-positive non-lactose-fermenting gram-negative rod' },
        { letter: 'C', text: 'Acid-fast bacillus' },
        { letter: 'D', text: 'Gram-positive cocci in chains' },
      ],
      correct: 'A',
      explanation: 'This organism is identified by lactose fermentation and coagulase positivity in this answer choice. Those features are presented as the diagnostic microbiology pattern for the isolate from the patient with cystic fibrosis pneumonia.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:microbiology_pseudomonas_identity_contradiction');
  });
});

describe('specialty validation expanded endocrine coverage', () => {
  it('passes a correct DKA mechanism question', async () => {
    const result = await validate(q({
      subject: 'Physiology',
      system: 'Endocrine',
      topic: 'Diabetic ketoacidosis',
      testedConcept: 'DKA insulin deficiency and ketogenesis',
      usmleContentArea: 'Endocrine System',
      stem: 'A 16-year-old girl with type 1 diabetes is brought to the emergency department with abdominal pain, vomiting, dry mucous membranes, and deep rapid breathing. Serum glucose is 510 mg/dL, beta-hydroxybutyrate is elevated, arterial pH is low, and the anion gap is increased. Which mechanism explains diabetic ketoacidosis?',
      options: [
        { letter: 'A', text: 'Insulin deficiency causing lipolysis and hepatic ketogenesis' },
        { letter: 'B', text: 'Insulin excess causing hypoglycemia' },
        { letter: 'C', text: 'Primary respiratory alkalosis' },
        { letter: 'D', text: 'Aldosterone excess causing potassium loss' },
      ],
      correct: 'A',
      explanation: 'DKA occurs when absolute or relative insulin deficiency increases counterregulatory hormones, adipose lipolysis, and hepatic ketogenesis. The resulting ketoacids produce an anion-gap metabolic acidosis, and Kussmaul respirations are a compensatory response to the metabolic acidosis.',
      optionExplanations: {
        A: 'Correct because insulin deficiency drives lipolysis, ketogenesis, and anion-gap metabolic acidosis.',
        B: 'Incorrect because DKA is not caused by insulin excess or hypoglycemia.',
        C: 'Incorrect because Kussmaul respirations compensate for metabolic acidosis.',
        D: 'Incorrect because aldosterone excess does not explain ketoacidosis.',
      },
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when DKA is explained as insulin excess and hypoglycemia', async () => {
    const result = await validate(q({
      subject: 'Physiology',
      system: 'Endocrine',
      topic: 'Diabetic ketoacidosis',
      testedConcept: 'DKA insulin deficiency and ketogenesis',
      usmleContentArea: 'Endocrine System',
      stem: 'A teenager with type 1 diabetes has Kussmaul respirations and anion-gap metabolic acidosis. Which mechanism explains DKA?',
      options: [
        { letter: 'A', text: 'Insulin excess causing hypoglycemia and low ketones' },
        { letter: 'B', text: 'Insulin deficiency causing ketogenesis' },
        { letter: 'C', text: 'Excess ADH causing hyponatremia' },
        { letter: 'D', text: 'Primary respiratory alkalosis' },
      ],
      correct: 'A',
      explanation: 'DKA is caused by insulin excess, hypoglycemia, and low ketones.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:endocrine_dka_mechanism_contradiction');
  });

  it('fails when SIADH is explained as dilute urine and hypernatremia', async () => {
    const result = await validate(q({
      subject: 'Physiology',
      system: 'Endocrine',
      topic: 'SIADH',
      testedConcept: 'SIADH concentrated urine and euvolemic hyponatremia',
      usmleContentArea: 'Endocrine System',
      stem: 'A patient with small cell lung cancer has syndrome of inappropriate ADH secretion. Which laboratory pattern is expected?',
      options: [
        { letter: 'A', text: 'Hypernatremia with dilute urine and low urine osmolality' },
        { letter: 'B', text: 'Euvolemic hyponatremia with inappropriately concentrated urine' },
        { letter: 'C', text: 'Hyperkalemia with metabolic acidosis' },
        { letter: 'D', text: 'Hypocalcemia with high parathyroid hormone' },
      ],
      correct: 'A',
      explanation: 'SIADH causes hypernatremia with dilute urine and low urine osmolality.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:endocrine_siadh_mechanism_contradiction');
  });
});

describe('specialty validation expanded immunology coverage', () => {
  it('passes a correct terminal complement deficiency question', async () => {
    const result = await validate(q({
      subject: 'Immunology',
      system: 'Immunology',
      topic: 'Terminal complement deficiency',
      testedConcept: 'C5-C9 MAC deficiency and recurrent Neisseria',
      usmleContentArea: 'Immune System',
      stem: 'A 15-year-old boy has had two episodes of meningococcal meningitis despite normal neutrophil count and normal immunoglobulin levels. Screening shows impaired serum bactericidal activity against Neisseria meningitidis. Deficiency of which complement component group best explains this susceptibility?',
      options: [
        { letter: 'A', text: 'C5 through C9 membrane attack complex proteins' },
        { letter: 'B', text: 'C1 esterase inhibitor' },
        { letter: 'C', text: 'NADPH oxidase' },
        { letter: 'D', text: 'Bruton tyrosine kinase' },
      ],
      correct: 'A',
      explanation: 'Terminal complement proteins C5 through C9 form the membrane attack complex that helps lyse Neisseria species. Deficiency of C5, C6, C7, C8, or C9 predisposes to recurrent meningococcal infections while leaving many other immune functions intact.',
      optionExplanations: {
        A: 'Correct because C5-C9 terminal complement deficiency impairs MAC formation against Neisseria.',
        B: 'Incorrect because C1 esterase inhibitor deficiency causes hereditary angioedema.',
        C: 'Incorrect because NADPH oxidase deficiency causes chronic granulomatous disease.',
        D: 'Incorrect because BTK defects cause X-linked agammaglobulinemia.',
      },
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when terminal complement deficiency is explained as C1 esterase deficiency', async () => {
    const result = await validate(q({
      subject: 'Immunology',
      system: 'Immunology',
      topic: 'Terminal complement deficiency',
      testedConcept: 'C5-C9 MAC deficiency and recurrent Neisseria',
      usmleContentArea: 'Immune System',
      stem: 'A teenager has recurrent meningococcal infections due to terminal complement deficiency. Which mechanism explains this risk?',
      options: [
        { letter: 'A', text: 'C1 esterase inhibitor deficiency causing hereditary angioedema' },
        { letter: 'B', text: 'Impaired C5-C9 membrane attack complex formation' },
        { letter: 'C', text: 'Failure of B-cell maturation' },
        { letter: 'D', text: 'Defective neutrophil oxidative burst' },
      ],
      correct: 'A',
      explanation: 'This answer attributes the recurrent meningococcal infections to C1 esterase inhibitor deficiency and hereditary swelling episodes. That mechanism involves dysregulated kallikrein activation rather than direct serum bactericidal activity against encapsulated diplococci.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:immunology_terminal_complement_contradiction');
  });

  it('fails when hereditary angioedema is explained as IgE mast-cell histamine release', async () => {
    const result = await validate(q({
      subject: 'Immunology',
      system: 'Immunology',
      topic: 'Hereditary angioedema',
      testedConcept: 'C1 esterase inhibitor deficiency and bradykinin',
      usmleContentArea: 'Immune System',
      stem: 'A patient has recurrent painless swelling of the lips and airway without urticaria. Hereditary angioedema is suspected. Which mechanism explains this disorder?',
      options: [
        { letter: 'A', text: 'IgE-mediated mast-cell histamine release' },
        { letter: 'B', text: 'C1 esterase inhibitor deficiency increasing bradykinin' },
        { letter: 'C', text: 'C5-C9 deficiency causing Neisseria infection' },
        { letter: 'D', text: 'Immune complex deposition' },
      ],
      correct: 'A',
      explanation: 'This answer attributes the recurrent painless swelling episodes to IgE-mediated mast cell histamine release, similar to anaphylaxis. It frames the process as an immediate allergic reaction with mediator release from mast cells rather than a complement-regulatory defect.',
      optionExplanations: {
        A: 'Correct because this response is immediate and histamine mediated.',
        B: 'Incorrect because this mechanism is not selected.',
        C: 'Incorrect because terminal complement deficiency causes meningococcal infections.',
        D: 'Incorrect because immune-complex disease is a type III process.',
      },
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:immunology_c1_esterase_contradiction');
  });
});

describe('specialty validation — microbiology', () => {
  it('passes a correct Staphylococcus aureus identity question', async () => {
    const result = await validate(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      topic: 'Staphylococcus aureus',
      testedConcept: 'Staphylococcus aureus coagulase positivity',
      usmleContentArea: 'Multisystem Processes & Disorders',
      stem: 'A patient develops a purulent skin abscess. Culture grows gram-positive cocci in clusters. Which virulence feature best identifies Staphylococcus aureus?',
      options: [
        { letter: 'A', text: 'Coagulase positivity' },
        { letter: 'B', text: 'Gram-negative diplococci' },
        { letter: 'C', text: 'Optochin sensitivity' },
        { letter: 'D', text: 'Acid-fast cell wall' },
      ],
      correct: 'A',
      explanation: 'Staphylococcus aureus is a gram-positive coccus in clusters that is catalase-positive and coagulase-positive. Coagulase helps distinguish it from coagulase-negative staphylococci.',
      optionExplanations: {
        A: 'Coagulase positivity is correct because Staphylococcus aureus is coagulase-positive.',
        B: 'Incorrect because gram-negative diplococci describe Neisseria species.',
        C: 'Incorrect because optochin sensitivity identifies Streptococcus pneumoniae.',
        D: 'Incorrect because acid-fast cell walls suggest mycobacteria.',
      },
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when Staphylococcus aureus is described as gram-negative diplococci', async () => {
    const result = await validate(q({
      subject: 'Microbiology',
      system: 'Infectious Disease',
      topic: 'Staphylococcus aureus',
      testedConcept: 'Staphylococcus aureus identity',
      stem: 'A patient develops a purulent abscess and the question asks for the identity of Staphylococcus aureus. Which description is correct?',
      options: [
        { letter: 'A', text: 'Gram-negative diplococci' },
        { letter: 'B', text: 'Gram-positive cocci in clusters' },
        { letter: 'C', text: 'Acid-fast bacilli' },
        { letter: 'D', text: 'Gram-positive rods with spores' },
      ],
      correct: 'A',
      explanation: 'Staphylococcus aureus is best described as gram-negative diplococci.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:microbiology_staph_aureus_identity_contradiction');
  });
});

describe('specialty validation — renal', () => {
  it('passes a correct poststreptococcal glomerulonephritis mechanism question', async () => {
    const result = await validate(q({
      subject: 'Pathology',
      system: 'Renal / Urinary',
      topic: 'Poststreptococcal glomerulonephritis',
      testedConcept: 'Poststreptococcal GN subepithelial humps',
      usmleContentArea: 'Renal & Urinary System',
      stem: 'A 7-year-old boy develops cola-colored urine 2 weeks after pharyngitis. Complement C3 is low. Which renal biopsy finding is most likely?',
      options: [
        { letter: 'A', text: 'Subepithelial immune complex humps with granular deposits' },
        { letter: 'B', text: 'Linear IgG along the basement membrane' },
        { letter: 'C', text: 'Mesangial IgA deposition within days of infection' },
        { letter: 'D', text: 'Diffuse foot process effacement without immune deposits' },
      ],
      correct: 'A',
      explanation: 'Poststreptococcal glomerulonephritis causes granular immune complex deposition with subepithelial humps and low C3 after a latency period following infection.',
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when PSGN is explained as linear anti-GBM disease', async () => {
    const result = await validate(q({
      subject: 'Pathology',
      system: 'Renal / Urinary',
      topic: 'Poststreptococcal glomerulonephritis',
      testedConcept: 'Poststreptococcal GN subepithelial humps',
      usmleContentArea: 'Renal & Urinary System',
      stem: 'A 7-year-old boy develops cola-colored urine 2 weeks after pharyngitis. Complement C3 is low. Which renal biopsy finding is most likely in poststreptococcal glomerulonephritis?',
      options: [
        { letter: 'A', text: 'Linear IgG along the glomerular basement membrane' },
        { letter: 'B', text: 'Subepithelial humps with granular immune deposits' },
        { letter: 'C', text: 'Mesangial IgA deposits' },
        { letter: 'D', text: 'Podocyte foot process effacement' },
      ],
      correct: 'A',
      explanation: 'Poststreptococcal glomerulonephritis is anti-GBM disease with linear IgG deposition along the basement membrane.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:renal_psgn_mechanism_contradiction');
  });
});

describe('specialty validation — endocrine', () => {
  it('passes a correct Graves disease antibody question', async () => {
    const result = await validate(q({
      subject: 'Physiology',
      system: 'Endocrine',
      topic: 'Graves disease',
      testedConcept: 'Graves disease TSH receptor stimulating antibody',
      usmleContentArea: 'Endocrine System',
      stem: 'A 31-year-old woman has heat intolerance, tremor, diffuse goiter, and proptosis. TSH is low and free T4 is high. Which antibody mechanism explains Graves disease?',
      options: [
        { letter: 'A', text: 'IgG stimulation of the TSH receptor' },
        { letter: 'B', text: 'Anti-thyroid peroxidase mediated gland destruction' },
        { letter: 'C', text: 'Pituitary TSH hypersecretion' },
        { letter: 'D', text: 'Iodide organification failure' },
      ],
      correct: 'A',
      explanation: 'Graves disease is caused by thyroid-stimulating immunoglobulins, which are IgG antibodies that stimulate the TSH receptor on thyroid follicular cells. This receptor activation increases thyroid hormone synthesis and release, producing low TSH, high free T4, tremor, goiter, and ophthalmopathy.',
      optionExplanations: {
        A: 'Correct because Graves disease is driven by IgG stimulation of the TSH receptor.',
        B: 'Incorrect because anti-TPO antibodies are associated more with Hashimoto thyroiditis and gland destruction.',
        C: 'Incorrect because pituitary TSH hypersecretion would cause high TSH, not suppressed TSH.',
        D: 'Incorrect because organification failure causes impaired thyroid hormone synthesis.',
      },
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when Graves disease is explained as anti-TPO destructive hypothyroidism', async () => {
    const result = await validate(q({
      subject: 'Physiology',
      system: 'Endocrine',
      topic: 'Graves disease',
      testedConcept: 'Graves disease TSH receptor stimulating antibody',
      usmleContentArea: 'Endocrine System',
      stem: 'A woman with proptosis, low TSH, and high free T4 has Graves disease. Which antibody mechanism explains the disease?',
      options: [
        { letter: 'A', text: 'Anti-thyroid peroxidase mediated destructive hypothyroidism' },
        { letter: 'B', text: 'TSH receptor stimulation by IgG' },
        { letter: 'C', text: 'Iodide organification failure' },
        { letter: 'D', text: 'Pituitary TSH hypersecretion' },
      ],
      correct: 'A',
      explanation: 'Graves disease is caused by anti-TPO antibodies that destroy thyroid follicles and cause hypothyroidism.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:endocrine_graves_antibody_contradiction');
  });
});

describe('specialty validation — neurology', () => {
  it('passes a correct Brown-Sequard localization question', async () => {
    const result = await validate(q({
      subject: 'Anatomy',
      system: 'Neurology',
      topic: 'Brown-Sequard syndrome',
      testedConcept: 'Brown-Sequard tract deficits',
      usmleContentArea: 'Nervous System & Special Senses',
      stem: 'A man has left spinal cord hemisection. He has left leg weakness and loss of vibration below the lesion, with right-sided pain and temperature loss. Which tract pattern explains Brown-Sequard syndrome?',
      options: [
        { letter: 'A', text: 'Ipsilateral corticospinal and dorsal column loss with contralateral spinothalamic loss' },
        { letter: 'B', text: 'Contralateral motor and proprioception loss with ipsilateral pain loss' },
        { letter: 'C', text: 'Bilateral dorsal column loss only' },
        { letter: 'D', text: 'Anterior spinal artery infarction sparing motor function' },
      ],
      correct: 'A',
      explanation: 'Brown-Sequard syndrome is caused by hemisection of the spinal cord. Corticospinal and dorsal column fibers have already crossed above the spinal cord or cross in the medulla, so a cord hemisection causes ipsilateral motor and vibration/proprioception loss below the lesion. Spinothalamic pain-temperature fibers cross in the spinal cord, producing contralateral pain-temperature loss.',
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when Brown-Sequard tract laterality is reversed', async () => {
    const result = await validate(q({
      subject: 'Anatomy',
      system: 'Neurology',
      topic: 'Brown-Sequard syndrome',
      testedConcept: 'Brown-Sequard tract deficits',
      usmleContentArea: 'Nervous System & Special Senses',
      stem: 'A man has Brown-Sequard syndrome after left spinal cord hemisection. Which deficit pattern is expected?',
      options: [
        { letter: 'A', text: 'Contralateral motor and proprioception loss with ipsilateral pain and temperature loss' },
        { letter: 'B', text: 'Ipsilateral motor and proprioception loss with contralateral pain-temperature loss' },
        { letter: 'C', text: 'Bilateral dorsal column loss only' },
        { letter: 'D', text: 'Anterior spinal artery infarction' },
      ],
      correct: 'A',
      explanation: 'Brown-Sequard causes contralateral motor and proprioception loss with ipsilateral pain and temperature loss.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:neurology_brown_sequard_tract_contradiction');
  });
});

describe('specialty validation — immunology', () => {
  it('passes a correct type I hypersensitivity question', async () => {
    const result = await validate(q({
      subject: 'Immunology',
      system: 'Immunology',
      topic: 'Type I hypersensitivity',
      testedConcept: 'Type I hypersensitivity IgE mast cell degranulation',
      usmleContentArea: 'Immune System',
      stem: 'A child develops urticaria, wheezing, and hypotension minutes after eating peanuts. Which immune mechanism explains this type I hypersensitivity reaction?',
      options: [
        { letter: 'A', text: 'IgE-mediated mast cell degranulation' },
        { letter: 'B', text: 'Immune complex deposition with complement activation' },
        { letter: 'C', text: 'T-cell mediated delayed response' },
        { letter: 'D', text: 'IgG against basement membrane antigen' },
      ],
      correct: 'A',
      explanation: 'Type I hypersensitivity is an immediate allergic reaction mediated by IgE bound to Fc epsilon receptors on mast cells. Allergen cross-linking triggers mast cell degranulation with histamine and leukotriene release, causing urticaria, bronchospasm, hypotension, and anaphylaxis within minutes.',
      optionExplanations: {
        A: 'Correct because type I hypersensitivity is IgE-mediated mast cell degranulation.',
        B: 'Incorrect because immune complex deposition with complement activation describes type III hypersensitivity.',
        C: 'Incorrect because T-cell mediated delayed response describes type IV hypersensitivity.',
        D: 'Incorrect because IgG against basement membrane antigen is a type II mechanism.',
      },
    }));

    expect(result.passed).toBe(true);
  });

  it('fails when type I hypersensitivity is explained as immune-complex disease', async () => {
    const result = await validate(q({
      subject: 'Immunology',
      system: 'Immunology',
      topic: 'Type I hypersensitivity',
      testedConcept: 'Type I hypersensitivity IgE mast cell degranulation',
      usmleContentArea: 'Immune System',
      stem: 'A child develops anaphylaxis minutes after eating peanuts. Which immune mechanism explains this type I hypersensitivity reaction?',
      options: [
        { letter: 'A', text: 'IgG immune complex deposition with complement fixation' },
        { letter: 'B', text: 'IgE-mediated mast cell degranulation' },
        { letter: 'C', text: 'T-cell mediated delayed response' },
        { letter: 'D', text: 'IgM against red cell antigen' },
      ],
      correct: 'A',
      explanation: 'Type I hypersensitivity is caused by IgG immune complex deposition and complement fixation.',
    }));

    expect(result.passed).toBe(false);
    expect(result.rejectionReasons).toContain('specialty:immunology_type_i_hypersensitivity_contradiction');
  });
});
