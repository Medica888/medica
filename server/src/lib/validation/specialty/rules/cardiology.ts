import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateCardiology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isCardio = system === 'Cardiovascular' || has(haystack, /\b(cardiac|cardio|heart|myocard|coronary|murmur|valve|aortic|mitral|troponin|ecg|ekg)\b/i);
  if (!isCardio) return null;

  if (has(haystack, /\b(myocardial\s+infarction|mi\b|stemi|nstemi|troponin|coronary\s+occlusion)\b/i)) {
    if (has(support, /\b(troponin\s+decreased|decreased\s+troponin|ck[-\s]?mb\s+never\s+rises|no\s+myocyte\s+necrosis|stable\s+angina\s+without\s+necrosis)\b/i)) {
      return fail('Myocardial infarction: ischemic myocyte necrosis with elevated cardiac troponin', support, 'cardiology_mi_biomarker_contradiction');
    }
  }

  if (has(haystack, /\b(aortic\s+stenosis|systolic\s+ejection\s+murmur|crescendo[-\s]?decrescendo|radiat(?:es|ing)?\s+to\s+carotids?)\b/i)) {
    if (has(support, /\b(holosystolic|diastolic\s+rumble|wide\s+pulse\s+pressure|bounding\s+pulses|mitral\s+regurgitation|aortic\s+regurgitation)\b/i) && !has(support, /\b(systolic\s+ejection|crescendo|decrescendo|carotid|narrow\s+pulse|delayed\s+upstroke)\b/i)) {
      return fail('Aortic stenosis: systolic crescendo-decrescendo murmur radiating to carotids', support, 'cardiology_aortic_stenosis_murmur_contradiction');
    }
  }

  if (has(haystack, /\b(hypertrophic\s+cardiomyopathy|hocm|sudden\s+death\s+athlete|sarcomere|myosin\s+binding\s+protein)\b/i)) {
    if (has(support, /\b(dilated\s+ventricle|eccentric\s+hypertrophy|decreases?\s+with\s+standing|improves?\s+with\s+valsalva|volume\s+overload)\b/i)) {
      return fail('Hypertrophic cardiomyopathy: sarcomere mutation with asymmetric septal hypertrophy; murmur increases with decreased preload', support, 'cardiology_hcm_physiology_contradiction');
    }
  }

  return null;
}
