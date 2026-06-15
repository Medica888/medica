import { normalizeSubject, normalizeSystem } from '../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../validationTypes.js';
import { validateAgainstFactRegistry } from './medicalFactRegistry.js';

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

function truncate(value: string | undefined, maxLength = 240): string {
  if (!value) return '';
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

function joinSummary(values: Array<string | undefined>, maxItemLength = 140, maxTotalLength = 600): string {
  const joined = values
    .filter(Boolean)
    .map(value => truncate(value, maxItemLength))
    .join(' | ');
  return truncate(joined, maxTotalLength);
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

  if (has(haystack, /\b(acetaminophen|paracetamol|napqi|n[-\s]?acetylcysteine|glutathione)\b/i)) {
    if (has(support, /\b(irreversible\s+cox|platelet\s+cox|salicylate|aspirin|respiratory\s+alkalosis\s+only|ethylene\s+glycol)\b/i) && !has(support, /\b(napqi|glutathione|n[-\s]?acetylcysteine|nac|hepatic\s+necrosis)\b/i)) {
      return fail('Acetaminophen toxicity: NAPQI accumulation after glutathione depletion; treat with N-acetylcysteine', support, 'pharmacology_acetaminophen_toxicity_contradiction');
    }
  }

  if (has(haystack, /\b(organophosphate|acetylcholinesterase|cholinergic\s+toxicity|atropine|pralidoxime|sludge)\b/i)) {
    if (has(support, /\b(opioid\s+receptor|naloxone|anticholinergic\s+toxicity|dry\s+skin|mydriasis|sodium\s+channel\s+blockade)\b/i) && !has(support, /\b(acetylcholinesterase|cholinergic|muscarinic|nicotinic|atropine|pralidoxime|sludge)\b/i)) {
      return fail('Organophosphate toxicity: acetylcholinesterase inhibition causing cholinergic excess; atropine plus pralidoxime', support, 'pharmacology_organophosphate_toxicity_contradiction');
    }
  }

  if (has(haystack, /\b(warfarin|vitamin\s+k\s+epoxide|inr|protein\s+c|pcc\b)\b/i)) {
    if (has(support, /\b(direct\s+thrombin|factor\s+xa|heparin|antithrombin|platelet\s+p2y12|cox[-\s]?1)\b/i) && !has(support, /\b(vitamin\s+k|epoxide|inr|protein\s+c|pcc|factors?\s+ii|vii|ix|x)\b/i)) {
      return fail('Warfarin: inhibits vitamin K epoxide reductase, lowering factors II, VII, IX, X and proteins C/S', support, 'pharmacology_warfarin_mechanism_contradiction');
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

  if (has(haystack, /\b(hpv|human\s+papillomavirus|e6|e7|cervical\s+cancer|koilocyte)\b/i)) {
    if (has(support, /\b(reverse\s+transcriptase|cd4\s+cells|dna\s+polymerase|ras\s+activation|myc\s+translocation)\b/i) && !has(support, /\b(e6|e7|p53|rb|koilocyte)\b/i)) {
      return fail('HPV oncogenesis: E6 inhibits p53 and E7 inhibits Rb', support, 'microbiology_hpv_oncogene_contradiction');
    }
  }

  if (has(haystack, /\b(ebv|epstein[-\s]?barr|cd21|burkitt|mononucleosis|hodgkin)\b/i)) {
    if (has(support, /\b(cd4\s+t\s+cells|ccr5|cxcr4|gp120|respiratory\s+syncytial|poliovirus)\b/i) && !has(support, /\b(cd21|b\s+cells?|burkitt|mononucleosis)\b/i)) {
      return fail('EBV: infects B cells via CD21; associated with mononucleosis, Burkitt lymphoma, and some Hodgkin lymphomas', support, 'microbiology_ebv_tropism_contradiction');
    }
  }

  if (has(haystack, /\b(hiv|gp120|cd4|ccr5|cxcr4|reverse\s+transcriptase)\b/i)) {
    if (has(support, /\b(cd21|b\s+cells|dna\s+virus|e6|e7|p53|rb)\b/i) && !has(support, /\b(cd4|gp120|ccr5|cxcr4|reverse\s+transcriptase|retrovirus)\b/i)) {
      return fail('HIV: retrovirus using gp120 to bind CD4 and CCR5/CXCR4 with reverse transcriptase', support, 'microbiology_hiv_tropism_contradiction');
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

  if (has(haystack, /\b(type\s+1\s+rta|distal\s+rta|renal\s+tubular\s+acidosis|urine\s+ph|kidney\s+stones)\b/i)) {
    if (has(support, /\b(low\s+urine\s+ph|proximal\s+bicarbonate\s+wasting|hyperkalemia|aldosterone\s+resistance)\b/i) && !has(support, /\b(high\s+urine\s+ph|impaired\s+h\+|hypokalemia|stones)\b/i)) {
      return fail('Type 1 distal RTA: impaired distal H+ secretion with high urine pH, hypokalemia, and stones', support, 'renal_distal_rta_contradiction');
    }
  }

  if (has(haystack, /\b(type\s+4\s+rta|hypoaldosteronism|aldosterone\s+resistance|hyperkalemic\s+rta)\b/i)) {
    if (has(support, /\b(hypokalemia|high\s+urine\s+ph\s+always|proximal\s+bicarbonate\s+wasting|fanconi)\b/i) && !has(support, /\b(hyperkalemia|aldosterone|hypoaldosteronism)\b/i)) {
      return fail('Type 4 RTA: hypoaldosteronism or aldosterone resistance causing hyperkalemic normal anion gap acidosis', support, 'renal_type4_rta_contradiction');
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

function validateCardiology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isCardio = system === 'Cardiovascular' || has(haystack, /\b(cardiac|cardio|heart|myocard|coronary|murmur|valve|aortic|mitral|troponin|ecg|ekg)\b/i);
  if (!isCardio) return null;

  if (has(haystack, /\b(myocardial\s+infarction|mi\b|stemi|nstemi|troponin|coronary\s+occlusion)\b/i)) {
    if (has(support, /\b(troponin\s+decreased|decreased\s+troponin|ck[-\s]?mb\s+never\s+rises|no\s+myocyte\s+necrosis|stable\s+angina\s+without\s+necrosis)\b/i)) {
      return fail('Myocardial infarction: ischemic myocyte necrosis with elevated cardiac troponin', support, 'cardiology_mi_biomarker_contradiction');
    }
  }

  if (has(haystack, /\b(aortic\s+stenosis|systolic\s+ejection\s+murmur|crescendo[-\s]?decrescendo|radiat(?:es|ing)?\s+to\s+carotids?)\b/i)) {
    if (has(support, /\b(holosystolic|diastolic\s+rumble|wide\s+pulse\s+pressure|bounding\s+pulses|mitral\s+regurgitation|aortic\s+regurgitation)\b/i) && !has(support, /\b(systolic\s+ejection|crescendo|decrescendo|carotid|narrow\s+pulse|delayed\s+upstroke)\b/i)) {
      return fail('Aortic stenosis: systolic crescendo-decrescendo murmur radiating to carotids', support, 'cardiology_aortic_stenosis_murmur_contradiction');
    }
  }

  if (has(haystack, /\b(hypertrophic\s+cardiomyopathy|hocm|sudden\s+death\s+athlete|sarcomere|myosin\s+binding\s+protein)\b/i)) {
    if (has(support, /\b(dilated\s+ventricle|eccentric\s+hypertrophy|decreases?\s+with\s+standing|improves?\s+with\s+valsalva|volume\s+overload)\b/i)) {
      return fail('Hypertrophic cardiomyopathy: sarcomere mutation with asymmetric septal hypertrophy; murmur increases with decreased preload', support, 'cardiology_hcm_physiology_contradiction');
    }
  }

  return null;
}

function validatePulmonary(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isPulmonary = system === 'Respiratory' || has(haystack, /\b(pulmonary|lung|alveol|asthma|copd|emphysema|bronch|embol|hypox|pneumothorax|pleural)\b/i);
  if (!isPulmonary) return null;

  if (has(haystack, /\b(asthma|wheezing|bronchoconstriction|eosinophil|curschmann|charcot[-\s]?leyden)\b/i)) {
    if (has(support, /\b(neutrophil[-\s]?predominant|irreversible\s+airflow|destruction\s+of\s+alveolar\s+septa|centriacinar\s+emphysema)\b/i) && !has(support, /\b(reversible|bronchoconstriction|eosinophil|ige|mast\s+cell)\b/i)) {
      return fail('Asthma: reversible bronchoconstriction with eosinophilic/IgE-mediated airway inflammation', support, 'pulmonary_asthma_pathophysiology_contradiction');
    }
  }

  if (has(haystack, /\b(alpha[-\s]?1\s+antitrypsin|panacinar\s+emphysema|lower\s+lobe\s+emphysema)\b/i)) {
    if (has(support, /\b(increased\s+alpha[-\s]?1|decreased\s+elastase|upper\s+lobe|centriacinar|surfactant\s+deficiency)\b/i)) {
      return fail('Alpha-1 antitrypsin deficiency: uninhibited elastase causing panacinar emphysema, classically lower lobes', support, 'pulmonary_alpha1_antitrypsin_contradiction');
    }
  }

  if (has(haystack, /\b(pulmonary\s+embolism|pe\b|v\/q\s+mismatch|dead\s+space|sudden\s+dyspnea|pleuritic\s+chest\s+pain)\b/i)) {
    if (has(support, /\b(shunt\s+with\s+normal\s+perfusion|decreased\s+dead\s+space|bronchial\s+obstruction|low\s+d[-\s]?dimer\s+rules\s+in)\b/i)) {
      return fail('Pulmonary embolism: increased dead space from ventilated but underperfused alveoli', support, 'pulmonary_embolism_vq_contradiction');
    }
  }

  return null;
}

function validateGastrointestinal(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isGI = system === 'Gastrointestinal' || has(haystack, /\b(gastro|intestinal|bowel|colon|ileum|liver|biliary|pancrea|celiac|crohn|ulcerative\s+colitis|hepatitis)\b/i);
  if (!isGI) return null;

  if (has(haystack, /\b(celiac|gluten|anti[-\s]?tissue\s+transglutaminase|anti[-\s]?ttg|villous\s+atrophy)\b/i)) {
    if (has(support, /\b(transmural\s+inflammation|skip\s+lesions|caseating\s+granulomas|anti[-\s]?mitochondrial|normal\s+villi)\b/i) && !has(support, /\b(villous\s+atrophy|anti[-\s]?ttg|endomysial|gluten|iga)\b/i)) {
      return fail('Celiac disease: gluten-sensitive enteropathy with IgA anti-tTG/endomysial antibodies and villous atrophy', support, 'gi_celiac_mechanism_contradiction');
    }
  }

  if (has(haystack, /\b(crohn|skip\s+lesions|transmural|noncaseating\s+granulomas|terminal\s+ileum)\b/i)) {
    if (has(support, /\b(continuous\s+colonic|mucosal\s+only|pseudopolyps|toxic\s+megacolon\s+without\s+skip|crypt\s+abscesses|no\s+skip)\b/i) && !has(support, /\b(transmural|granuloma|terminal\s+ileum|fistula)\b/i)) {
      return fail('Crohn disease: transmural inflammation with skip lesions, often terminal ileum, may form fistulas/granulomas', support, 'gi_crohn_pathology_contradiction');
    }
  }

  if (has(haystack, /\b(ulcerative\s+colitis|uc\b|continuous\s+colonic|rectum|crypt\s+abscess|pseudopolyps)\b/i)) {
    if (has(support, /\b(skip\s+lesions|transmural|terminal\s+ileum\s+only|fistulas|noncaseating\s+granulomas)\b/i) && !has(support, /\b(continuous|mucosal|rectum|crypt\s+abscess|pseudopolyps)\b/i)) {
      return fail('Ulcerative colitis: continuous mucosal inflammation starting at rectum with crypt abscesses/pseudopolyps', support, 'gi_ulcerative_colitis_pathology_contradiction');
    }
  }

  return null;
}

function validateBiochemistry(question: ValidationQuestion): ValidatorResult | null {
  const subject = normalizeSubject(question.subject);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isBiochem = subject === 'Biochemistry' || has(haystack, /\b(enzyme|metabolism|amino\s+acid|urea\s+cycle|glycogen|lysosomal|phenylalanine|purine|orotic\s+acid)\b/i);
  if (!isBiochem) return null;

  if (has(haystack, /\b(phenylketonuria|pku|phenylalanine\s+hydroxylase|tetrahydrobiopterin|bh4)\b/i)) {
    if (has(support, /\b(hgprt|branched[-\s]?chain|maple\s+syrup|homocystinuria|tyrosinase|urea\s+cycle)\b/i) && !has(support, /\b(phenylalanine|phenylalanine\s+hydroxylase|bh4|tetrahydrobiopterin)\b/i)) {
      return fail('PKU: phenylalanine hydroxylase or BH4 defect causing phenylalanine accumulation', support, 'biochemistry_pku_enzyme_contradiction');
    }
  }

  if (has(haystack, /\b(lesch[-\s]?nyhan|hgprt|self[-\s]?mutilation|hyperuricemia|purine\s+salvage)\b/i)) {
    if (has(support, /\b(adenosine\s+deaminase|ada\b|orotic\s+aciduria|phenylalanine\s+hydroxylase|xanthine\s+oxidase\s+deficiency)\b/i) && !has(support, /\b(hgprt|purine\s+salvage|uric\s+acid|self[-\s]?mutilation)\b/i)) {
      return fail('Lesch-Nyhan syndrome: HGPRT deficiency impairing purine salvage with hyperuricemia/self-mutilation', support, 'biochemistry_lesch_nyhan_enzyme_contradiction');
    }
  }

  if (has(haystack, /\b(ornithine\s+transcarbamylase|otc\b|urea\s+cycle|hyperammonemia|orotic\s+acid)\b/i)) {
    if (has(support, /\b(low\s+orotic\s+acid|maple\s+syrup|phenylketonuria|methylmalonic\s+acidemia|increased\s+bun)\b/i) && !has(support, /\b(hyperammonemia|orotic\s+acid|urea\s+cycle|ornithine|carbamoyl)\b/i)) {
      return fail('OTC deficiency: urea-cycle defect with hyperammonemia and increased orotic acid', support, 'biochemistry_otc_deficiency_contradiction');
    }
  }

  return null;
}

function validateHematologyOncology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isHemeOnc = system === 'Hematology' || system === 'Oncology' || has(haystack, /\b(anemia|microcytic|macrocytic|ferritin|tibc|b12|folate|leukemia|lymphoma|bcr[-\s]?abl|philadelphia|cml)\b/i);
  if (!isHemeOnc) return null;

  if (has(haystack, /\b(iron\s+deficiency|low\s+ferritin|microcytic\s+anemia|koilonychia|pica)\b/i)) {
    if (has(support, /\b(high\s+ferritin|low\s+tibc|macrocytic|hypersegmented|b12\s+deficiency|anemia\s+of\s+chronic\s+disease)\b/i) && !has(support, /\b(low\s+ferritin|high\s+tibc)\b/i)) {
      return fail('Iron deficiency anemia: microcytosis with low ferritin and high TIBC', support, 'hematology_iron_deficiency_contradiction');
    }
  }

  if (has(haystack, /\b(vitamin\s*b12|cobalamin|pernicious\s+anemia|methylmalonic\s+acid|subacute\s+combined)\b/i)) {
    if (has(support, /\b(normal\s+methylmalonic|microcytic|low\s+homocysteine|isolated\s+folate\s+deficiency|iron\s+deficiency)\b/i) && !has(support, /\b(b12|cobalamin|methylmalonic|homocysteine|posterior\s+columns|macrocytic)\b/i)) {
      return fail('Vitamin B12 deficiency: macrocytic anemia with elevated methylmalonic acid and homocysteine; neurologic deficits possible', support, 'hematology_b12_deficiency_contradiction');
    }
  }

  if (has(haystack, /\b(chronic\s+myeloid\s+leukemia|cml\b|philadelphia\s+chromosome|bcr[-\s]?abl|t\(9;22\))\b/i)) {
    if (has(support, /\b(t\(15;17\)|pml[-\s]?rara|t\(8;14\)|myc|jak2|acute\s+promyelocytic)\b/i) && !has(support, /\b(bcr[-\s]?abl|philadelphia|t\(9;22\)|tyrosine\s+kinase)\b/i)) {
      return fail('CML: Philadelphia chromosome t(9;22) producing BCR-ABL tyrosine kinase', support, 'oncology_cml_translocation_contradiction');
    }
  }

  return null;
}

function validateDermatology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isDerm = system === 'Dermatology' || has(haystack, /\b(dermat|skin|rash|psoriasis|pemphigus|bullous|melanoma|basal\s+cell|squamous\s+cell)\b/i);
  if (!isDerm) return null;

  if (has(haystack, /\b(psoriasis|silvery\s+scale|auspitz|extensor\s+plaques|munro)\b/i)) {
    if (has(support, /\b(spongiosis|eczema|flexural|acantholysis|suprabasal\s+blister|linear\s+igg|basement\s+membrane)\b/i) && !has(support, /\b(parakeratosis|munro|extensor|silvery|th17|il[-\s]?17|il[-\s]?23)\b/i)) {
      return fail('Psoriasis: Th17/IL-23 mediated plaques with parakeratosis/Munro microabscesses on extensor surfaces', support, 'dermatology_psoriasis_pathology_contradiction');
    }
  }

  if (has(haystack, /\b(pemphigus\s+vulgaris|flaccid\s+bullae|nikolsky|desmoglein|suprabasal)\b/i)) {
    if (has(support, /\b(linear\s+igg|hemidesmosome|subepidermal|tense\s+bullae|basement\s+membrane)\b/i) && !has(support, /\b(desmoglein|intraepidermal|suprabasal|fishnet|acantholysis)\b/i)) {
      return fail('Pemphigus vulgaris: IgG against desmoglein causing intraepidermal/suprabasal acantholysis', support, 'dermatology_pemphigus_contradiction');
    }
  }

  if (has(haystack, /\b(bullous\s+pemphigoid|tense\s+bullae|hemidesmosome|linear\s+igg|subepidermal)\b/i)) {
    if (has(support, /\b(desmoglein|fishnet|suprabasal|intraepidermal|flaccid\s+bullae)\b/i) && !has(support, /\b(hemidesmosome|linear\s+igg|basement\s+membrane|subepidermal|tense)\b/i)) {
      return fail('Bullous pemphigoid: IgG against hemidesmosomes with linear basement membrane staining and tense subepidermal bullae', support, 'dermatology_bullous_pemphigoid_contradiction');
    }
  }

  return null;
}

function validateReproductive(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isRepro = system === 'Reproductive' || has(haystack, /\b(reproductive|pregnan|ovary|ovarian|testis|testicular|prostate|endometriosis|pcos|placenta|hcg)\b/i);
  if (!isRepro) return null;

  if (has(haystack, /\b(pcos|polycystic\s+ovarian|hyperandrogenism|oligo[-\s]?ovulation|lh:?\s*fsh)\b/i)) {
    if (has(support, /\b(low\s+androgens|decreased\s+lh|primary\s+ovarian\s+failure|low\s+insulin|hypogonadotropic)\b/i) && !has(support, /\b(hyperandrogen|increased\s+lh|insulin\s+resistance|oligo|anovulation)\b/i)) {
      return fail('PCOS: hyperandrogenism with chronic anovulation, insulin resistance, and often increased LH:FSH ratio', support, 'reproductive_pcos_contradiction');
    }
  }

  if (has(haystack, /\b(endometriosis|chocolate\s+cyst|cyclic\s+pelvic\s+pain|dyspareunia|ectopic\s+endometrial)\b/i)) {
    if (has(support, /\b(endometrial\s+carcinoma|leiomyoma|adenomyosis\s+only|noncyclic|germ\s+cell\s+tumor)\b/i) && !has(support, /\b(ectopic\s+endometrial|cyclic|chocolate|endometriosis|pelvic)\b/i)) {
      return fail('Endometriosis: ectopic endometrial glands/stroma causing cyclic pelvic pain and chocolate cysts', support, 'reproductive_endometriosis_contradiction');
    }
  }

  if (has(haystack, /\b(benign\s+prostatic\s+hyperplasia|bph|nodular\s+hyperplasia|periurethral|dihydrotestosterone|dht)\b/i)) {
    if (has(support, /\b(testosterone\s+only|peripheral\s+zone|prostate\s+cancer|estrogen\s+deficiency|psa\s+always\s+normal)\b/i) && !has(support, /\b(dht|dihydrotestosterone|5[-\s]?alpha|periurethral|transition\s+zone|nodular)\b/i)) {
      return fail('BPH: DHT-driven nodular hyperplasia in periurethral/transition zone', support, 'reproductive_bph_contradiction');
    }
  }

  if (has(haystack, /\b(ectopic\s+pregnancy|adnexal|tubal\s+pregnancy|no\s+intrauterine\s+pregnancy|beta[-\s]?hcg)\b/i)) {
    if (has(support, /\b(intrauterine\s+pregnancy\s+confirmed|normal\s+pregnancy|molar\s+pregnancy|ovarian\s+torsion\s+only)\b/i) && !has(support, /\b(adnexal|tubal|no\s+intrauterine|hcg)\b/i)) {
      return fail('Ectopic pregnancy: positive beta-hCG with no intrauterine pregnancy and possible adnexal mass/pain', support, 'reproductive_ectopic_pregnancy_contradiction');
    }
  }

  if (has(haystack, /\b(preeclampsia|eclampsia|hypertension\s+after\s+20\s+weeks|proteinuria|seizure\s+pregnancy)\b/i)) {
    if (has(support, /\b(before\s+20\s+weeks|no\s+hypertension|no\s+proteinuria|gestational\s+diabetes|placenta\s+previa)\b/i) && !has(support, /\b(after\s+20\s+weeks|hypertension\s+and\s+proteinuria|eclampsia|seizure)\b/i)) {
      return fail('Preeclampsia: new hypertension after 20 weeks with proteinuria or end-organ dysfunction; eclampsia adds seizures', support, 'reproductive_preeclampsia_contradiction');
    }
  }

  return null;
}

function validateMusculoskeletal(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isMsk = system === 'Musculoskeletal' || has(haystack, /\b(bone|joint|muscle|arthritis|gout|osteoporosis|osteomalacia|rickets|paget|rheumatoid|osteoarthritis)\b/i);
  if (!isMsk) return null;

  if (has(haystack, /\b(gout|podagra|negatively\s+birefringent|monosodium\s+urate)\b/i)) {
    if (has(support, /\b(positively\s+birefringent|calcium\s+pyrophosphate|rhomboid|pseudogout|calcium\s+oxalate)\b/i) && !has(support, /\b(negatively|monosodium\s+urate|needle[-\s]?shaped)\b/i)) {
      return fail('Gout: needle-shaped monosodium urate crystals with negative birefringence', support, 'msk_gout_crystal_contradiction');
    }
  }

  if (has(haystack, /\b(pseudogout|calcium\s+pyrophosphate|cppd|positively\s+birefringent|rhomboid)\b/i)) {
    if (has(support, /\b(negatively\s+birefringent|monosodium\s+urate|needle[-\s]?shaped|uric\s+acid)\b/i) && !has(support, /\b(positive|rhomboid|calcium\s+pyrophosphate|cppd|pseudogout)\b/i)) {
      return fail('Pseudogout: rhomboid calcium pyrophosphate crystals with positive birefringence', support, 'msk_pseudogout_crystal_contradiction');
    }
  }

  if (has(haystack, /\b(osteoporosis|postmenopausal|fragility\s+fracture|trabecular\s+bone\s+loss)\b/i)) {
    if (has(support, /\b(defective\s+mineralization|osteomalacia|rickets|increased\s+osteoid|vitamin\s+d\s+deficiency)\b/i) && !has(support, /\b(low\s+bone\s+mass|normal\s+mineralization|trabecular|estrogen|fragility)\b/i)) {
      return fail('Osteoporosis: decreased bone mass with normal mineralization, often estrogen-related', support, 'msk_osteoporosis_contradiction');
    }
  }

  return null;
}

function validatePsychiatryBehavioral(question: ValidationQuestion): ValidatorResult | null {
  const subject = normalizeSubject(question.subject);
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isPsych = subject === 'Behavioral Science' || system === 'Psychiatry' || has(haystack, /\b(psychiatr|depression|mania|bipolar|schizophrenia|panic|ocd|ptsd|personality|conditioning)\b/i);
  if (!isPsych) return null;

  if (has(haystack, /\b(major\s+depressive|depression|mdd|sigecaps|anhedonia)\b/i)) {
    if (has(support, /\b(mania|hypomania|one\s+day|psychosis\s+only|bereavement\s+normal\s+always)\b/i) && !has(support, /\b(depressed|anhedonia|two\s+weeks|sleep|guilt|energy|concentration|appetite|suicid)\b/i)) {
      return fail('Major depressive disorder: at least 2 weeks of depressed mood or anhedonia plus neurovegetative symptoms', support, 'psychiatry_mdd_criteria_contradiction');
    }
  }

  if (has(haystack, /\b(bipolar\s+i|manic\s+episode|mania|grandiosity|decreased\s+need\s+for\s+sleep)\b/i)) {
    if (has(support, /\b(two\s+weeks\s+depressed\s+only|panic\s+attack|schizophrenia|hypomania\s+only\s+never\s+hospitalized)\b/i) && !has(support, /\b(mania|manic|one\s+week|hospitalization|grandiosity|decreased\s+need\s+for\s+sleep)\b/i)) {
      return fail('Bipolar I disorder: manic episode, typically at least 1 week or requiring hospitalization', support, 'psychiatry_bipolar_i_criteria_contradiction');
    }
  }

  if (has(haystack, /\b(positive\s+reinforcement|negative\s+reinforcement|operant\s+conditioning|punishment)\b/i)) {
    if (has(support, /\b(classical\s+conditioning|unconditioned\s+stimulus|conditioned\s+stimulus)\b/i) && !has(support, /\b(operant|behavior\s+increases|behavior\s+decreases|voluntary\s+behavior)\b/i)) {
      return fail('Operant conditioning: reinforcement/punishment modifies voluntary behavior; classical conditioning pairs stimuli', support, 'behavioral_operant_conditioning_contradiction');
    }
  }

  return null;
}

function validateGenetics(question: ValidationQuestion): ValidatorResult | null {
  const subject = normalizeSubject(question.subject);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isGenetics = subject === 'Genetics' || has(haystack, /\b(genetic|inheritance|autosomal|x[-\s]?linked|mitochondrial|trinucleotide|anticipation|imprinting|down\s+syndrome|trisomy)\b/i);
  if (!isGenetics) return null;

  if (has(haystack, /\b(down\s+syndrome|trisomy\s+21|robertsonian|nondisjunction)\b/i)) {
    if (has(support, /\b(trisomy\s+18|edwards|trisomy\s+13|patau|x[-\s]?linked|mitochondrial)\b/i) && !has(support, /\b(trisomy\s+21|chromosome\s+21|robertsonian)\b/i)) {
      return fail('Down syndrome: trisomy 21, usually meiotic nondisjunction, sometimes Robertsonian translocation', support, 'genetics_down_syndrome_contradiction');
    }
  }

  if (has(haystack, /\b(fragile\s+x|fmr1|cgg\s+repeat|anticipation|macroorchidism)\b/i)) {
    if (has(support, /\b(ctg\s+repeat|huntingtin|cag\s+repeat|mitochondrial|x[-\s]?linked\s+recessive)\b/i) && !has(support, /\b(cgg|fmr1|x[-\s]?linked\s+dominant|anticipation|macroorchidism)\b/i)) {
      return fail('Fragile X syndrome: CGG repeat expansion in FMR1 with anticipation', support, 'genetics_fragile_x_contradiction');
    }
  }

  if (has(haystack, /\b(mitochondrial\s+inheritance|maternal\s+inheritance|heteroplasmy|melas|merrf)\b/i)) {
    if (has(support, /\b(paternal\s+transmission|autosomal\s+dominant|x[-\s]?linked|all\s+sons\s+of\s+affected\s+father)\b/i) && !has(support, /\b(maternal|heteroplasmy|all\s+children\s+of\s+affected\s+mother)\b/i)) {
      return fail('Mitochondrial inheritance: maternal transmission with variable expression from heteroplasmy', support, 'genetics_mitochondrial_inheritance_contradiction');
    }
  }

  return null;
}

export function validateSpecialty(question: ValidationQuestion): ValidatorResult {
  const validators = [
    validateAgainstFactRegistry,
    validatePharmacology,
    validateMicrobiology,
    validateRenal,
    validateEndocrine,
    validateNeurology,
    validateImmunology,
    validateCardiology,
    validatePulmonary,
    validateGastrointestinal,
    validateBiochemistry,
    validateHematologyOncology,
    validateDermatology,
    validateReproductive,
    validateMusculoskeletal,
    validatePsychiatryBehavioral,
    validateGenetics,
  ];

  const warnings: ValidatorResult[] = [];
  const failures: ValidatorResult[] = [];
  for (const validator of validators) {
    const result = validator(question);
    if (!result) continue;
    if (result.status === 'fail') {
      failures.push(result);
      continue;
    }
    if (result.status === 'warn') warnings.push(result);
  }

  if (failures.length > 0) {
    return {
      name: 'specialty',
      status: 'fail',
      blocking: true,
      score: Math.min(...failures.map(f => f.score)),
      expected: joinSummary(failures.map(f => f.expected)),
      detected: joinSummary(failures.map(f => f.detected), 180),
      confidence: Math.max(...failures.map(f => f.confidence ?? 0.92)),
      reasons: failures.flatMap(f => f.reasons),
      details: failures.flatMap(f => {
        if (f.details?.length) return f.details;
        return [{
          reason: f.reasons[0] ?? 'specialty_failure',
          expected: truncate(f.expected, 500),
          detected: truncate(f.detected, 500),
          confidence: f.confidence ?? null,
          score: f.score,
        }];
      }),
    };
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
