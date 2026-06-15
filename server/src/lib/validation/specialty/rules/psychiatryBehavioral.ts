import { normalizeSubject, normalizeSystem } from '../../../medicaTaxonomy.js';
import type { ValidationQuestion, ValidatorResult } from '../../validationTypes.js';
import { answerSupport, fail, has, intentTextFor, warn } from '../specialtyRuleHelpers.js';

export function validatePsychiatryBehavioral(question: ValidationQuestion): ValidatorResult | null {
  const subject = normalizeSubject(question.subject);
  const system = normalizeSystem(question.system);
  const haystack = intentTextFor(question).toLowerCase();
  const support = answerSupport(question).toLowerCase();

  const isPsych = subject === 'Behavioral Science' || system === 'Psychiatry' || has(haystack, /\b(psychiatr|depression|mania|bipolar|schizophrenia|panic|ocd|ptsd|personality|conditioning)\b/i);
  if (!isPsych) return null;

  if (has(haystack, /\b(major\s+depressive|depression|mdd|sigecaps|anhedonia)\b/i)) {
    if (has(support, /\b(mania|hypomania|one\s+day|psychosis\s+only|bereavement\s+normal\s+always)\b/i) && !has(support, /\b(depressed|anhedonia|two\s+weeks|sleep|guilt|energy|concentration|appetite|suicid)\b/i)) {
      return fail('Major depressive disorder: at least 2 weeks of depressed mood or anhedonia plus neurovegetative symptoms', support, 'psychiatry_mdd_criteria_contradiction');
    }
  }

  if (has(haystack, /\b(bipolar\s+i|manic\s+episode|mania|grandiosity|decreased\s+need\s+for\s+sleep)\b/i)) {
    if (has(support, /\b(two\s+weeks\s+depressed\s+only|panic\s+attack|schizophrenia|hypomania\s+only\s+never\s+hospitalized)\b/i) && !has(support, /\b(mania|manic|one\s+week|hospitalization|grandiosity|decreased\s+need\s+for\s+sleep)\b/i)) {
      return fail('Bipolar I disorder: manic episode, typically at least 1 week or requiring hospitalization', support, 'psychiatry_bipolar_i_criteria_contradiction');
    }
  }

  if (has(haystack, /\b(positive\s+reinforcement|negative\s+reinforcement|operant\s+conditioning|punishment)\b/i)) {
    if (has(support, /\b(classical\s+conditioning|unconditioned\s+stimulus|conditioned\s+stimulus)\b/i) && !has(support, /\b(operant|behavior\s+increases|behavior\s+decreases|voluntary\s+behavior)\b/i)) {
      return fail('Operant conditioning: reinforcement/punishment modifies voluntary behavior; classical conditioning pairs stimuli', support, 'behavioral_operant_conditioning_contradiction');
    }
  }

  return null;
}
