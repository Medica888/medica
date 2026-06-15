import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateDermatology(question: ValidationQuestion): ValidatorResult | null {
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
