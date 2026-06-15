import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateEndocrine(question: ValidationQuestion): ValidatorResult | null {
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
