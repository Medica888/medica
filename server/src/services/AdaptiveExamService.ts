import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { AdaptiveBlueprint } from '../types/index.js';
import { MIN_FOR_ADAPTIVE, buildConceptBuckets } from './adaptiveMasteryUtils.js';

const FRAC_WEAK   = 0.50;
const FRAC_MEDIUM = 0.30;

const RANDOM_RESULT: AdaptiveBlueprint = {
  strategy:        'random',
  enabled:         false,
  weakConcepts:    [],
  mediumConcepts:  [],
  strongConcepts:  [],
  targetConcepts:  [],
  promptFocusText: '',
};

function buildFocusText(weak: string[], medium: string[]): string {
  const lines = [
    'ADAPTIVE FOCUS — PERSONALIZED REINFORCEMENT:',
    "Based on this user's performance history, prioritize these concepts in question selection:",
  ];
  if (weak.length > 0)   lines.push(`Priority (needs most work): ${weak.slice(0, 8).join(', ')}`);
  if (medium.length > 0) lines.push(`Developing (needs reinforcement): ${medium.slice(0, 5).join(', ')}`);
  lines.push('Aim for at least 50–60% of questions to directly test one of these concepts.');
  lines.push('Each target concept should be tested from a unique clinical angle.');
  return lines.join('\n');
}

export class AdaptiveExamService {
  constructor(
    private mastery:  IUserConceptMasteryRepository,
    private concepts: IConceptsRepository,
  ) {}

  async buildAdaptivePreview(userId: string): Promise<AdaptiveBlueprint> {
    return this.buildAdaptiveBlueprint(userId, 10);
  }

  async buildAdaptiveBlueprint(userId: string, questionCount: number): Promise<AdaptiveBlueprint> {
    const rows = await this.mastery.findByUserId(userId);

    if (rows.length < MIN_FOR_ADAPTIVE) {
      return {
        ...RANDOM_RESULT,
        reason: `Only ${rows.length} concept(s) tracked — ${MIN_FOR_ADAPTIVE} needed for adaptive mode.`,
      };
    }

    const { weak, medium, strong } = await buildConceptBuckets(rows, this.concepts);

    const weakSlots     = Math.floor(questionCount * FRAC_WEAK);
    const mediumSlots   = Math.floor(questionCount * FRAC_MEDIUM);
    const targetWeak    = weak.slice(0, weakSlots);
    const targetMedium  = medium.slice(0, mediumSlots);
    const targetConcepts = [...targetWeak, ...targetMedium];

    return {
      strategy:        'adaptive',
      enabled:         true,
      weakConcepts:    weak,
      mediumConcepts:  medium,
      strongConcepts:  strong,
      targetConcepts,
      promptFocusText: buildFocusText(targetWeak, targetMedium),
    };
  }
}
