import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateNeurology(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isNeuro = system === 'Neurology' || has(haystack, /\b(spinal\s+cord|corticospinal|dorsal\s+column|spinothalamic|brainstem|cranial\s+nerve|stroke|seizure|brown[-\s]?sequard|anterior\s+cord|central\s+cord)\b/i);
  if (!isNeuro) return null;

  if (has(haystack, /\b(brown[-\s]?sequard|hemisection)\b/i)) {
    if (has(support, /\b(ipsilateral\s+pain|ipsilateral\s+temperature|contralateral\s+motor|contralateral\s+proprioception|bilateral\s+dorsal\s+column|anterior\s+spinal\s+artery)\b/i)) {
      return fail('Brown-Sequard: ipsilateral corticospinal/dorsal column loss with contralateral pain-temperature loss', support, 'neurology_brown_sequard_tract_contradiction');
    }
  }

  if (has(haystack, /\b(anterior\s+spinal\s+artery|asa\s+infarct|anterior\s+cord)\b/i)) {
    if (has(support, /\b(loss\s+of\s+vibration|loss\s+of\s+proprioception|dorsal\s+column\s+loss|spares?\s+motor|spares?\s+pain)\b/i)) {
      return fail('Anterior spinal artery syndrome: motor and pain-temperature loss with dorsal columns spared', support, 'neurology_anterior_spinal_artery_contradiction');
    }
  }

  if (has(haystack, /\b(weber\s+syndrome|midbrain\s+stroke|cn\s*iii|oculomotor)\b/i)) {
    if (has(support, /\b(facial\s+nerve|cn\s*vii|pons|abducens|cn\s*vi)\b/i) && !has(support, /\b(cn\s*iii|oculomotor|midbrain|corticospinal)\b/i)) {
      return fail('Weber syndrome: ipsilateral CN III palsy with contralateral weakness from midbrain lesion', support, 'neurology_weber_syndrome_localization_contradiction');
    }
  }

  return null;
}
