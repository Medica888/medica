import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateMicrobiology(question: ValidationQuestion): ValidatorResult | null {
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
