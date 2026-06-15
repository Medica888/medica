import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validatePharmacology(question: ValidationQuestion): ValidatorResult | null {
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
