import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateRenal(question: ValidationQuestion): ValidatorResult | null {
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
