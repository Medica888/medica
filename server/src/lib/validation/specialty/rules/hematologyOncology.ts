import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateHematologyOncology(question: ValidationQuestion): ValidatorResult | null {
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
