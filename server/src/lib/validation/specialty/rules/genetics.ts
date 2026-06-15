import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateGenetics(question: ValidationQuestion): ValidatorResult | null {
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
