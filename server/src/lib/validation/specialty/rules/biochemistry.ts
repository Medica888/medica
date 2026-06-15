import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateBiochemistry(question: ValidationQuestion): ValidatorResult | null {
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
