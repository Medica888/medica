import type { ValidationQuestion, ValidatorResult } from '../validationTypes.js';
import { validateAgainstFactRegistry } from './medicalFactRegistry.js';
import { joinSummary, pass, truncate } from './specialtyRuleHelpers.js';
import { validatePharmacology } from './rules/pharmacology.js';
import { validateMicrobiology } from './rules/microbiology.js';
import { validateRenal } from './rules/renal.js';
import { validateEndocrine } from './rules/endocrine.js';
import { validateNeurology } from './rules/neurology.js';
import { validateImmunology } from './rules/immunology.js';
import { validateCardiology } from './rules/cardiology.js';
import { validatePulmonary } from './rules/pulmonary.js';
import { validateGastrointestinal } from './rules/gastrointestinal.js';
import { validateBiochemistry } from './rules/biochemistry.js';
import { validateHematologyOncology } from './rules/hematologyOncology.js';
import { validateDermatology } from './rules/dermatology.js';
import { validateReproductive } from './rules/reproductive.js';
import { validateMusculoskeletal } from './rules/musculoskeletal.js';
import { validatePsychiatryBehavioral } from './rules/psychiatryBehavioral.js';
import { validateGenetics } from './rules/genetics.js';

export function validateSpecialty(question: ValidationQuestion): ValidatorResult {
  const validators = [
    validateAgainstFactRegistry,
    validatePharmacology,
    validateMicrobiology,
    validateRenal,
    validateEndocrine,
    validateNeurology,
    validateImmunology,
    validateCardiology,
    validatePulmonary,
    validateGastrointestinal,
    validateBiochemistry,
    validateHematologyOncology,
    validateDermatology,
    validateReproductive,
    validateMusculoskeletal,
    validatePsychiatryBehavioral,
    validateGenetics,
  ];

  const warnings: ValidatorResult[] = [];
  const failures: ValidatorResult[] = [];
  for (const validator of validators) {
    const result = validator(question);
    if (!result) continue;
    if (result.status === 'fail') {
      failures.push(result);
      continue;
    }
    if (result.status === 'warn') warnings.push(result);
  }

  if (failures.length > 0) {
    return {
      name: 'specialty',
      status: 'fail',
      blocking: true,
      score: Math.min(...failures.map(f => f.score)),
      expected: joinSummary(failures.map(f => f.expected)),
      detected: joinSummary(failures.map(f => f.detected), 180),
      confidence: Math.max(...failures.map(f => f.confidence ?? 0.92)),
      reasons: failures.flatMap(f => f.reasons),
      details: failures.flatMap(f => {
        if (f.details?.length) return f.details;
        return [{
          reason: f.reasons[0] ?? 'specialty_failure',
          expected: truncate(f.expected, 500),
          detected: truncate(f.detected, 500),
          confidence: f.confidence ?? null,
          score: f.score,
        }];
      }),
    };
  }

  if (warnings.length > 0) {
    return {
      ...warnings[0],
      reasons: warnings.flatMap(w => w.reasons),
      score: Math.min(...warnings.map(w => w.score)),
    };
  }

  return pass();
}
