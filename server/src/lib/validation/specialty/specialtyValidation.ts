import { normalizeSubject, normalizeSystem } from '../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../validationTypes.js';

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

function answerSupport(question: ValidationQuestion): string {
  const correct = String(question.correct || '').trim().toUpperCase();
  const correctText = (question.options || []).find(o => o.letter === correct)?.text || '';
  const correctExplanation = question.optionExplanations?.[correct] || '';
  return [correctText, question.explanation, correctExplanation].filter(Boolean).join(' ');
}

function pass(reason = 'no_specialty_contradiction'): ValidatorResult {
  return {
    name: 'specialty',
    status: 'pass',
    blocking: false,
    score: 100,
    confidence: 0.8,
    reasons: [reason],
  };
}

function fail(expected: string, detected: string, reason: string): ValidatorResult {
  return {
    name: 'specialty',
    status: 'fail',
    blocking: true,
    score: 0,
    expected,
    detected,
    confidence: 0.92,
    reasons: [reason],
  };
}

function warn(expected: string, detected: string, reason: string): ValidatorResult {
  return {
    name: 'specialty',
    status: 'warn',
    blocking: false,
    score: 75,
    expected,
    detected,
    confidence: 0.55,
    reasons: [reason],
  };
}

function has(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function validatePharmacology(question: ValidationQuestion): ValidatorResult | null {
  const subject = normalizeSubject(question.subject);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isPharm = subject === 'Pharmacology' || has(haystack, /\b(drug|medication|pharmacolog|mechanism\s+of\s+action|adverse\s+effect|toxicity|contraindicat)\b/i);
  if (!isPharm) return null;

  if (has(haystack, /\b(ace\s*inhibitor|angiotensin.?converting enzyme|lisinopril|enalapril|captopril|ramipril)\b/i)) {
    if (has(support, /\b(beta[-\s]*1|beta\s*block|direct\s+renin|aliskiren|arb\b|angiotensin\s+receptor\s+block|calcium\s+channel|increased\s+aldosterone|increase\s+aldosterone)\b/i)) {
      return fail('ACE inhibitor: ACE blockade, lower angiotensin II/aldosterone, bradykinin accumulation', support, 'pharmacology_ace_inhibitor_mechanism_contradiction');
    }
    if (!has(support, /\b(ace|angiotensin.?converting|bradykinin|angiotensin\s+ii|aldosterone)\b/i)) {
      return warn('ACE inhibitor mechanism or adverse effect', support, 'pharmacology_ace_inhibitor_support_weak');
    }
  }

  if (has(haystack, /\b(loop\s+diuretic|furosemide|bumetanide|torsemide|ethacrynic|nkcc2|na[-\s]?k[-\s]?2cl|thick\s+ascending)\b/i)) {
    if (has(support, /\b(distal\s+convoluted|dct\b|ncc\b|enac|collecting\s+duct|aquaporin|hypercalcemia|increased\s+calcium\s+reabsorption)\b/i) && !has(support, /\bnkcc2|thick\s+ascending|loop\s+of\s+henle|na[-\s]?k[-\s]?2cl\b/i)) {
      return fail('Loop diuretic: NKCC2 blockade in thick ascending limb', support, 'pharmacology_loop_diuretic_site_contradiction');
    }
    if (!has(support, /\b(nkcc2|thick\s+ascending|loop\s+of\s+henle|na[-\s]?k[-\s]?2cl|ototoxic|hypokal|metabolic\s+alkalosis)\b/i)) {
      return warn('Loop diuretic mechanism/adverse effect', support, 'pharmacology_loop_diuretic_support_weak');
    }
  }

  if (has(haystack, /\b(thiazide|hydrochlorothiazide|chlorthalidone|ncc\b|distal\s+convoluted|dct\b)\b/i)) {
    if (has(support, /\b(nkcc2|thick\s+ascending|loop\s+of\s+henle|enac|collecting\s+duct)\b/i) && !has(support, /\b(ncc|distal\s+convoluted|dct|increased\s+calcium\s+reabsorption|hypercalcemia)\b/i)) {
      return fail('Thiazide: NCC blockade in distal convoluted tubule', support, 'pharmacology_thiazide_site_contradiction');
    }
  }

  if (has(haystack, /\b(beta\s*blocker|metoprolol|atenolol|propranolol|carvedilol|labetalol|esmolol)\b/i)) {
    if (has(support, /\b(ace\s+inhibition|bradykinin|calcium\s+channel|dihydropyridine|direct\s+renin|arb\b)\b/i)) {
      return fail('Beta blocker: beta-adrenergic receptor antagonism', support, 'pharmacology_beta_blocker_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(aminoglycoside|gentamicin|tobramycin|amikacin|streptomycin|30s\s+ribosomal)\b/i)) {
    if (has(support, /\b(50s\s+ribosomal|cell\s+wall|peptidoglycan|dna\s+gyrase|topoisomerase|folate\s+synthesis)\b/i) && !has(support, /\b(30s|misreading|protein\s+synthesis|nephrotox|ototox)\b/i)) {
      return fail('Aminoglycosides: 30S ribosomal binding causing misreading of mRNA; nephrotoxicity/ototoxicity', support, 'pharmacology_aminoglycoside_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(fluoroquinolone|ciprofloxacin|levofloxacin|moxifloxacin|dna\s+gyrase|topoisomerase)\b/i)) {
    if (has(support, /\b(30s|50s|cell\s+wall|peptidoglycan|folate\s+synthesis|transpeptidase)\b/i) && !has(support, /\b(dna\s+gyrase|topoisomerase|tendon|cartilage|qt)\b/i)) {
      return fail('Fluoroquinolones: DNA gyrase/topoisomerase inhibition', support, 'pharmacology_fluoroquinolone_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(vancomycin|d[-\s]?ala[-\s]?d[-\s]?ala|gram[-\s]?positive\s+cell\s+wall)\b/i)) {
    if (has(support, /\b(30s|50s|dna\s+gyrase|topoisomerase|folate\s+synthesis|beta[-\s]?lactamase)\b/i) && !has(support, /\b(d[-\s]?ala|peptidoglycan|cell\s+wall|red\s+man|nephrotox)\b/i)) {
      return fail('Vancomycin: binds D-Ala-D-Ala to inhibit gram-positive cell wall synthesis', support, 'pharmacology_vancomycin_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(ssri|fluoxetine|sertraline|citalopram|escitalopram|paroxetine|serotonin\s+reuptake)\b/i)) {
    if (has(support, /\b(dopamine\s+reuptake|norepinephrine\s+only|monoamine\s+oxidase|gaba|benzodiazepine|nmda)\b/i) && !has(support, /\b(serotonin|5[-\s]?ht|sexual\s+dysfunction|serotonin\s+syndrome)\b/i)) {
      return fail('SSRIs: serotonin reuptake inhibition', support, 'pharmacology_ssri_mechanism_contradiction');
    }
  }

  return null;
}

function validateMicrobiology(question: ValidationQuestion): ValidatorResult | null {
  const subject = normalizeSubject(question.subject);
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isMicro = subject === 'Microbiology' || system === 'Infectious Disease' || has(haystack, /\b(organism|bacteria|virus|fungus|gram[-\s]|culture|virulence|toxin|acid[-\s]?fast|antibiotic)\b/i);
  if (!isMicro) return null;

  if (has(haystack, /\b(staph(ylococcus)?\s+aureus|s\.\s*aureus|mrsa|mssa)\b/i)) {
    if (has(support, /\b(gram[-\s]?negative|diplococci|novobiocin|optochin|alpha[-\s]?hemolytic)\b/i)) {
      return fail('Staphylococcus aureus: gram-positive cocci in clusters, catalase-positive, coagulase-positive', support, 'microbiology_staph_aureus_identity_contradiction');
    }
    if (!has(support, /\b(gram[-\s]?positive|clusters?|catalase|coagulase|protein\s+a|pbp2a|beta[-\s]?lactamase|abscess)\b/i)) {
      return warn('Staphylococcus aureus identity or virulence', support, 'microbiology_staph_aureus_support_weak');
    }
  }

  if (has(haystack, /\b(strep(tococcus)?\s+pyogenes|group\s+a\s+strep|s\.\s+pyogenes)\b/i)) {
    if (has(support, /\b(gram[-\s]?negative|catalase[-\s]?positive|coagulase|diplococci|clusters?)\b/i)) {
      return fail('Streptococcus pyogenes: gram-positive cocci in chains, catalase-negative, beta-hemolytic, bacitracin sensitive', support, 'microbiology_strep_pyogenes_identity_contradiction');
    }
  }

  if (has(haystack, /\b(neisseria|gonorrhoeae|meningitidis|gram[-\s]?negative\s+diplococci)\b/i)) {
    if (has(support, /\b(gram[-\s]?positive|clusters?|chains?|coagulase|catalase[-\s]?negative)\b/i)) {
      return fail('Neisseria: oxidase-positive gram-negative diplococci', support, 'microbiology_neisseria_identity_contradiction');
    }
  }

  if (has(haystack, /\b(mycobacterium\s+tuberculosis|m\.\s*tuberculosis|tuberculosis|tb\b|acid[-\s]?fast)\b/i)) {
    if (has(support, /\b(gram[-\s]?(positive|negative)\s+(cocci|rods)|no\s+mycolic\s+acid|non[-\s]?acid[-\s]?fast)\b/i)) {
      return fail('Mycobacterium tuberculosis: acid-fast bacillus with mycolic acids', support, 'microbiology_tb_identity_contradiction');
    }
  }

  if (has(haystack, /\b(strep(tococcus)?\s+pneumoniae|s\.\s+pneumoniae|pneumococcus|optochin|alpha[-\s]?hemolytic)\b/i)) {
    if (has(support, /\b(beta[-\s]?hemolytic|bacitracin\s+sensitive|coagulase|clusters?|gram[-\s]?negative|diplococci\s+inside\s+neutrophils)\b/i) && !has(support, /\b(optochin|alpha[-\s]?hemolytic|lancet|capsule|bile\s+soluble)\b/i)) {
      return fail('Streptococcus pneumoniae: alpha-hemolytic, optochin-sensitive, encapsulated lancet diplococcus', support, 'microbiology_pneumococcus_identity_contradiction');
    }
  }

  if (has(haystack, /\b(e\.?\s*coli|escherichia\s+coli|lactose\s+ferment|macconkey|uti|k1\s+capsule)\b/i)) {
    if (has(support, /\b(gram[-\s]?positive|cocci\s+in\s+clusters|acid[-\s]?fast|oxidase[-\s]?positive\s+diplococci)\b/i)) {
      return fail('Escherichia coli: gram-negative lactose-fermenting rod', support, 'microbiology_ecoli_identity_contradiction');
    }
  }

  if (has(haystack, /\b(pseudomonas|p\.\s*aeruginosa|oxidase[-\s]?positive|blue[-\s]?green|pyocyanin|cystic\s+fibrosis)\b/i)) {
    if (has(support, /\b(gram[-\s]?positive|lactose[-\s]?fermenting|coagulase|anaerobic\s+rod|acid[-\s]?fast)\b/i) && !has(support, /\b(oxidase|non[-\s]?lactose|blue[-\s]?green|pyocyanin|aeruginosa)\b/i)) {
      return fail('Pseudomonas aeruginosa: oxidase-positive non-lactose-fermenting gram-negative rod', support, 'microbiology_pseudomonas_identity_contradiction');
    }
  }

  return null;
}

function validateRenal(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isRenal = system === 'Renal / Urinary' || has(haystack, /\b(renal|kidney|glomerul|nephron|nephritic|nephrotic|casts?|proteinuria|hematuria|gfr|acid.?base|diuretic)\b/i);
  if (!isRenal) return null;

  if (has(haystack, /\b(post[-\s]?streptococcal|psgn|postinfectious\s+glomerulonephritis|subepithelial\s+humps?)\b/i)) {
    if (has(support, /\b(anti[-\s]?gbm|linear\s+igg|mesangial\s+iga|foot\s+process\s+effacement|spike\s+and\s+dome|normal\s+c3|high\s+c3)\b/i)) {
      return fail('Poststreptococcal GN: granular immune complexes, subepithelial humps, low C3', support, 'renal_psgn_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(minimal\s+change\s+disease|mcd\b|podocyte\s+foot\s+process|foot\s+process\s+effacement)\b/i)) {
    if (has(support, /\b(immune\s+complex|subepithelial\s+humps?|spike\s+and\s+dome|linear\s+igg|crescent|rbc\s+casts?)\b/i)) {
      return fail('Minimal change disease: diffuse podocyte foot process effacement without immune deposits', support, 'renal_minimal_change_contradiction');
    }
  }

  if (has(haystack, /\b(iga\s+nephropathy|berger|synpharyngitic|mesangial\s+iga)\b/i)) {
    if (has(support, /\b(subepithelial\s+humps?|linear\s+igg|anti[-\s]?gbm|weeks?\s+after\s+pharyngitis|low\s+c3)\b/i)) {
      return fail('IgA nephropathy: mesangial IgA with hematuria within days of mucosal infection', support, 'renal_iga_nephropathy_contradiction');
    }
  }

  if (has(haystack, /\b(loop\s+diuretic|furosemide|bumetanide|torsemide|nkcc2|thick\s+ascending)\b/i)) {
    if (has(support, /\b(distal\s+convoluted|dct\b|ncc\b|enac|collecting\s+duct)\b/i) && !has(support, /\b(nkcc2|thick\s+ascending|loop\s+of\s+henle)\b/i)) {
      return fail('Loop diuretic renal site: NKCC2 in thick ascending limb', support, 'renal_loop_diuretic_site_contradiction');
    }
  }

  return null;
}

function validateEndocrine(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isEndocrine = system === 'Endocrine' || has(haystack, /\b(thyroid|adrenal|pituitary|insulin|glucagon|cortisol|aldosterone|parathyroid|pth|tsh|acth|graves|hashimoto|diabetes)\b/i);
  if (!isEndocrine) return null;

  if (has(haystack, /\b(graves|thyroid[-\s]?stimulating\s+immunoglobulin|tsi\b|tsh\s+receptor)\b/i)) {
    if (has(support, /\b(anti[-\s]?tpo|anti[-\s]?thyroid\s+peroxidase|anti[-\s]?thyroglobulin|destructive\s+hypothyroid|hashimoto)\b/i) && !has(support, /\b(tsh\s+receptor|tsi|stimulat|agonist|hyperthyroid)\b/i)) {
      return fail('Graves disease: TSH receptor-stimulating IgG causing hyperthyroidism', support, 'endocrine_graves_antibody_contradiction');
    }
  }

  if (has(haystack, /\b(primary\s+adrenal\s+insufficiency|addison|adrenal\s+insufficiency)\b/i)) {
    if (has(support, /\b(low\s+acth|decreased\s+acth|low\s+potassium|hypokalemia|hypertension|increased\s+aldosterone)\b/i)) {
      return fail('Primary adrenal insufficiency: low cortisol/aldosterone with high ACTH, hyperkalemia, hypotension', support, 'endocrine_primary_adrenal_insufficiency_contradiction');
    }
  }

  if (has(haystack, /\b(primary\s+hyperparathyroidism|parathyroid\s+adenoma|elevated\s+pth|kidney\s+stones|bone\s+pain)\b/i)) {
    if (has(support, /\b(low\s+calcium|hypocalcemia|low\s+pth|decreased\s+pth)\b/i)) {
      return fail('Primary hyperparathyroidism: high PTH with hypercalcemia', support, 'endocrine_primary_hyperparathyroidism_contradiction');
    }
  }

  if (has(haystack, /\b(diabetic\s+ketoacidosis|dka\b|type\s+1\s+diabetes|kussmaul|ketones?|anion\s+gap)\b/i)) {
    if (has(support, /\b(insulin\s+excess|hypoglycemia|respiratory\s+alkalosis\s+primary|non[-\s]?anion\s+gap|low\s+ketones?|decreased\s+lipolysis)\b/i)) {
      return fail('DKA: insulin deficiency causing ketogenesis and anion-gap metabolic acidosis', support, 'endocrine_dka_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(syndrome\s+of\s+inappropriate\s+adh|siadh|euvolemic\s+hyponatremia|concentrated\s+urine)\b/i)) {
    if (has(support, /\b(low\s+urine\s+osmolality|dilute\s+urine|hypernatremia|aldosterone\s+excess|diabetes\s+insipidus)\b/i)) {
      return fail('SIADH: excess ADH causing euvolemic hyponatremia with inappropriately concentrated urine', support, 'endocrine_siadh_mechanism_contradiction');
    }
  }

  return null;
}

function validateNeurology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isNeuro = system === 'Neurology' || has(haystack, /\b(spinal\s+cord|corticospinal|dorsal\s+column|spinothalamic|brainstem|cranial\s+nerve|stroke|seizure|brown[-\s]?sequard|anterior\s+cord|central\s+cord)\b/i);
  if (!isNeuro) return null;

  if (has(haystack, /\b(brown[-\s]?sequard|hemisection)\b/i)) {
    if (has(support, /\b(ipsilateral\s+pain|ipsilateral\s+temperature|contralateral\s+motor|contralateral\s+proprioception|bilateral\s+dorsal\s+column|anterior\s+spinal\s+artery)\b/i)) {
      return fail('Brown-Sequard: ipsilateral corticospinal/dorsal column loss with contralateral pain-temperature loss', support, 'neurology_brown_sequard_tract_contradiction');
    }
  }

  if (has(haystack, /\b(anterior\s+spinal\s+artery|asa\s+infarct|anterior\s+cord)\b/i)) {
    if (has(support, /\b(loss\s+of\s+vibration|loss\s+of\s+proprioception|dorsal\s+column\s+loss|spares?\s+motor|spares?\s+pain)\b/i)) {
      return fail('Anterior spinal artery syndrome: motor and pain-temperature loss with dorsal columns spared', support, 'neurology_anterior_spinal_artery_contradiction');
    }
  }

  if (has(haystack, /\b(weber\s+syndrome|midbrain\s+stroke|cn\s*iii|oculomotor)\b/i)) {
    if (has(support, /\b(facial\s+nerve|cn\s*vii|pons|abducens|cn\s*vi)\b/i) && !has(support, /\b(cn\s*iii|oculomotor|midbrain|corticospinal)\b/i)) {
      return fail('Weber syndrome: ipsilateral CN III palsy with contralateral weakness from midbrain lesion', support, 'neurology_weber_syndrome_localization_contradiction');
    }
  }

  return null;
}

function validateImmunology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const subject = normalizeSubject(question.subject);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isImmunology = system === 'Immunology' || subject === 'Immunology' || has(haystack, /\b(hypersensitivity|complement|mhc|hla|ige|igg|igm|iga|t\s*cell|b\s*cell|immune|cytokine|anaphylaxis)\b/i);
  if (!isImmunology) return null;

  if (has(haystack, /\b(type\s*i\s+hypersensitivity|anaphylaxis|allergic\s+rhinitis|urticaria|ige|mast\s+cell)\b/i)) {
    if (has(support, /\b(igg|igm|immune\s+complex|complement\s+fixation|t\s*cell[-\s]?mediated|delayed\s+type|type\s*ii|type\s*iii|type\s*iv)\b/i) && !has(support, /\b(ige|mast\s+cell|histamine|immediate)\b/i)) {
      return fail('Type I hypersensitivity: IgE-mediated mast cell degranulation', support, 'immunology_type_i_hypersensitivity_contradiction');
    }
  }

  if (has(haystack, /\b(type\s*ii\s+hypersensitivity|goodpasture|autoimmune\s+hemolytic|graves|myasthenia|antibody[-\s]?mediated)\b/i)) {
    if (has(support, /\b(immune\s+complex\s+deposition|type\s*iii|t\s*cell[-\s]?mediated|delayed\s+type|ige|mast\s+cell)\b/i) && !has(support, /\b(igg|igm|cell\s+surface|receptor|basement\s+membrane)\b/i)) {
      return fail('Type II hypersensitivity: IgG/IgM against cell-surface or matrix antigen', support, 'immunology_type_ii_hypersensitivity_contradiction');
    }
  }

  if (has(haystack, /\b(type\s*iii\s+hypersensitivity|serum\s+sickness|arthus|poststreptococcal|sle|immune\s+complex)\b/i)) {
    if (has(support, /\b(ige|mast\s+cell|t\s*cell[-\s]?mediated|delayed\s+type|cell\s+surface\s+receptor)\b/i) && !has(support, /\b(immune\s+complex|complement|igg|igm|granular)\b/i)) {
      return fail('Type III hypersensitivity: immune complex deposition with complement activation', support, 'immunology_type_iii_hypersensitivity_contradiction');
    }
  }

  if (has(haystack, /\b(type\s*iv\s+hypersensitivity|contact\s+dermatitis|ppd|tuberculin|granuloma|delayed\s+type)\b/i)) {
    if (has(support, /\b(ige|mast\s+cell|immune\s+complex|complement\s+fixation|igg\s+against\s+cell\s+surface|igm\s+against\s+cell\s+surface)\b/i) && !has(support, /\b(t\s*cell|delayed|macrophage|th1|cd4|cd8)\b/i)) {
      return fail('Type IV hypersensitivity: T-cell mediated delayed response', support, 'immunology_type_iv_hypersensitivity_contradiction');
    }
  }

  if (has(haystack, /\b(c5[-\s]?c9|terminal\s+complement|mac|membrane\s+attack|neisseria|recurrent\s+meningococcal)\b/i)) {
    if (has(support, /\b(hereditary\s+angioedema|c1\s+esterase|pyogenic\s+infections|c3\s+deficiency|lupus)\b/i) && !has(support, /\b(c5|c6|c7|c8|c9|terminal|membrane\s+attack|neisseria)\b/i)) {
      return fail('Terminal complement deficiency: recurrent Neisseria infections from impaired MAC formation', support, 'immunology_terminal_complement_contradiction');
    }
  }

  if (has(haystack, /\b(c1\s+esterase|hereditary\s+angioedema|bradykinin[-\s]?mediated\s+angioedema)\b/i)) {
    if (has(support, /\b(ige|mast\s+cell|histamine|c5[-\s]?c9|neisseria|immune\s+complex)\b/i) && !has(support, /\b(c1\s+esterase|bradykinin|angioedema)\b/i)) {
      return fail('C1 esterase inhibitor deficiency: bradykinin-mediated hereditary angioedema', support, 'immunology_c1_esterase_contradiction');
    }
  }

  return null;
}

export function validateSpecialty(question: ValidationQuestion): ValidatorResult {
  const validators = [
    validatePharmacology,
    validateMicrobiology,
    validateRenal,
    validateEndocrine,
    validateNeurology,
    validateImmunology,
  ];

  const warnings: ValidatorResult[] = [];
  for (const validator of validators) {
    const result = validator(question);
    if (!result) continue;
    if (result.status === 'fail') return result;
    if (result.status === 'warn') warnings.push(result);
  }

  if (warnings.length > 0) {
    return {
      ...warnings[0],
      reasons: warnings.flatMap(w => w.reasons),
      score: Math.min(...warnings.map(w => w.score)),
    };
  }

  return pass();
}
