import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateGastrointestinal(question: ValidationQuestion): ValidatorResult | null {
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
