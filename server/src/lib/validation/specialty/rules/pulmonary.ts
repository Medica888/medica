import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validatePulmonary(question: ValidationQuestion): ValidatorResult | null {
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isPulmonary = system === 'Respiratory' || has(haystack, /\b(pulmonary|lung|alveol|asthma|copd|emphysema|bronch|embol|hypox|pneumothorax|pleural)\b/i);
  if (!isPulmonary) return null;

  if (has(haystack, /\b(asthma|wheezing|bronchoconstriction|eosinophil|curschmann|charcot[-\s]?leyden)\b/i)) {
    if (has(support, /\b(neutrophil[-\s]?predominant|irreversible\s+airflow|destruction\s+of\s+alveolar\s+septa|centriacinar\s+emphysema)\b/i) && !has(support, /\b(reversible|bronchoconstriction|eosinophil|ige|mast\s+cell)\b/i)) {
      return fail('Asthma: reversible bronchoconstriction with eosinophilic/IgE-mediated airway inflammation', support, 'pulmonary_asthma_pathophysiology_contradiction');
    }
  }

  if (has(haystack, /\b(alpha[-\s]?1\s+antitrypsin|panacinar\s+emphysema|lower\s+lobe\s+emphysema)\b/i)) {
    if (has(support, /\b(increased\s+alpha[-\s]?1|decreased\s+elastase|upper\s+lobe|centriacinar|surfactant\s+deficiency)\b/i)) {
      return fail('Alpha-1 antitrypsin deficiency: uninhibited elastase causing panacinar emphysema, classically lower lobes', support, 'pulmonary_alpha1_antitrypsin_contradiction');
    }
  }

  if (has(haystack, /\b(pulmonary\s+embolism|pe\b|v\/q\s+mismatch|dead\s+space|sudden\s+dyspnea|pleuritic\s+chest\s+pain)\b/i)) {
    if (has(support, /\b(shunt\s+with\s+normal\s+perfusion|decreased\s+dead\s+space|bronchial\s+obstruction|low\s+d[-\s]?dimer\s+rules\s+in)\b/i)) {
      return fail('Pulmonary embolism: increased dead space from ventilated but underperfused alveoli', support, 'pulmonary_embolism_vq_contradiction');
    }
  }

  return null;
}
