import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateImmunology(question: ValidationQuestion): ValidatorResult | null {
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
