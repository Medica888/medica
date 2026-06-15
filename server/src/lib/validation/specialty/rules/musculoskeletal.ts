import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validateMusculoskeletal(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isMsk = system === 'Musculoskeletal' || has(haystack, /\b(bone|joint|muscle|arthritis|gout|osteoporosis|osteomalacia|rickets|paget|rheumatoid|osteoarthritis)\b/i);
  if (!isMsk) return null;

  if (has(haystack, /\b(gout|podagra|negatively\s+birefringent|monosodium\s+urate)\b/i)) {
    if (has(support, /\b(positively\s+birefringent|calcium\s+pyrophosphate|rhomboid|pseudogout|calcium\s+oxalate)\b/i) && !has(support, /\b(negatively|monosodium\s+urate|needle[-\s]?shaped)\b/i)) {
      return fail('Gout: needle-shaped monosodium urate crystals with negative birefringence', support, 'msk_gout_crystal_contradiction');
    }
  }

  if (has(haystack, /\b(pseudogout|calcium\s+pyrophosphate|cppd|positively\s+birefringent|rhomboid)\b/i)) {
    if (has(support, /\b(negatively\s+birefringent|monosodium\s+urate|needle[-\s]?shaped|uric\s+acid)\b/i) && !has(support, /\b(positive|rhomboid|calcium\s+pyrophosphate|cppd|pseudogout)\b/i)) {
      return fail('Pseudogout: rhomboid calcium pyrophosphate crystals with positive birefringence', support, 'msk_pseudogout_crystal_contradiction');
    }
  }

  if (has(haystack, /\b(osteoporosis|postmenopausal|fragility\s+fracture|trabecular\s+bone\s+loss)\b/i)) {
    if (has(support, /\b(defective\s+mineralization|osteomalacia|rickets|increased\s+osteoid|vitamin\s+d\s+deficiency)\b/i) && !has(support, /\b(low\s+bone\s+mass|normal\s+mineralization|trabecular|estrogen|fragility)\b/i)) {
      return fail('Osteoporosis: decreased bone mass with normal mineralization, often estrogen-related', support, 'msk_osteoporosis_contradiction');
    }
  }

  return null;
}
