import { defineRule, type MedicalFactRule } from '../medicalFactRuleTypes.js';

export const cardiovascularFactRules: MedicalFactRule[] = [
  defineRule({
    id: 'cardiology_mitral_regurgitation_murmur',
    domain: 'Cardiovascular',
    expected: 'Mitral regurgitation: holosystolic murmur at apex radiating to axilla',
    appliesTo: [/\b(mitral\s+regurgitation|holosystolic\s+murmur|apex\s+radiat(?:es|ing)?\s+to\s+axilla)\b/i],
    contradictions: [/\b(crescendo[-\s]?decrescendo|radiat(?:es|ing)?\s+to\s+carotids?|diastolic\s+rumble|opening\s+snap)\b/i],
    requiredSupport: [/\b(holosystolic|apex|axilla)\b/i],
  })
];
