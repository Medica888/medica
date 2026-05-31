import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { AdaptiveBlueprint, ReadinessScore, ReadinessStatus, UserConceptMastery } from '../types/index.js';
import { MIN_FOR_ADAPTIVE, buildConceptBuckets, adaptiveDisabledReason } from './adaptiveMasteryUtils.js';

// Readiness-aware allocation fractions.
// Exam Ready users need more medium reinforcement; struggling users need more weak focus.
const ALLOC_BY_STATUS: Record<ReadinessStatus, { weak: number; medium: number }> = {
  'Needs Intensive Review': { weak: 0.60, medium: 0.25 },
  'Developing':             { weak: 0.50, medium: 0.30 },  // matches legacy defaults
  'Approaching Readiness':  { weak: 0.40, medium: 0.35 },
  'Exam Ready':             { weak: 0.30, medium: 0.40 },
};

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

  async buildAdaptivePreview(
    userId:         string,
    readinessScore?: ReadinessScore,
    rows?:           UserConceptMastery[],
  ): Promise<AdaptiveBlueprint> {
    return this.buildAdaptiveBlueprint(userId, 10, readinessScore, rows);
  }

  async buildAdaptiveBlueprint(
    userId:          string,
    questionCount:   number,
    readinessScore?: ReadinessScore,
    rows?:           UserConceptMastery[],
  ): Promise<AdaptiveBlueprint> {
    const masteryRows = rows ?? await this.mastery.findByUserId(userId);

    if (masteryRows.length < MIN_FOR_ADAPTIVE) {
      return { ...RANDOM_RESULT, reason: adaptiveDisabledReason(masteryRows.length) };
    }

    const { weak, medium, strong } = await buildConceptBuckets(masteryRows, this.concepts);

    const alloc       = readinessScore ? ALLOC_BY_STATUS[readinessScore.status] : ALLOC_BY_STATUS['Developing'];
    const weakSlots   = Math.floor(questionCount * alloc.weak);
    const mediumSlots = Math.floor(questionCount * alloc.medium);
    const targetWeak   = weak.slice(0, weakSlots);
    const targetMedium = medium.slice(0, mediumSlots);
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
