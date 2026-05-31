import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { AdaptiveFlashcardPlan, ReadinessScore, ReadinessStatus, UserConceptMastery } from '../types/index.js';
import { MIN_FOR_ADAPTIVE, buildConceptBuckets, adaptiveDisabledReason } from './adaptiveMasteryUtils.js';

// Top N combined (weak + medium) targets — keeps the AI prompt focused
const MAX_TARGET_CONCEPTS  = 10;
// ~2 cards per concept: Recall + Pearl or Trap
const CARDS_PER_CONCEPT    = 2;
const MAX_RECOMMENDED      = 20;

// Controls whether medium concepts fill remaining capacity after weak targets.
// Struggling users stay focused on weak only; all others benefit from medium reinforcement.
// P2: medium fill is also applied when no readiness data is available (default: true).
const MEDIUM_FILL_BY_STATUS: Record<ReadinessStatus, boolean> = {
  'Needs Intensive Review': false,
  'Developing':             true,
  'Approaching Readiness':  true,
  'Exam Ready':             true,
};

function buildFocusText(weakTargets: string[], mediumTargets: string[] = []): string {
  if (!weakTargets.length && !mediumTargets.length) return '';
  const lines = [
    'ADAPTIVE FLASHCARD FOCUS — PERSONALIZED REINFORCEMENT:',
    "Based on this user's exam history, generate flashcards focused primarily on these weak concepts:",
  ];
  if (weakTargets.length > 0) lines.push(`Priority: ${weakTargets.join(', ')}`);
  lines.push('Generate 60–80% of cards testing one of these concepts directly.');
  lines.push('Each concept should be tested from a unique clinical angle (mechanism, adverse effect, diagnosis, etc.).');
  if (mediumTargets.length > 0) {
    lines.push(`Reinforcement: ${mediumTargets.join(', ')}`);
    lines.push('Include remaining cards for these reinforcement concepts to maintain progress.');
  }
  return lines.join('\n');
}

export class AdaptiveFlashcardService {
  constructor(
    private mastery:  IUserConceptMasteryRepository,
    private concepts: IConceptsRepository,
  ) {}

  async buildAdaptiveFlashcardPlan(
    userId:          string,
    readinessScore?: ReadinessScore,
    rows?:           UserConceptMastery[],
  ): Promise<AdaptiveFlashcardPlan> {
    const masteryRows = rows ?? await this.mastery.findByUserId(userId);

    if (masteryRows.length < MIN_FOR_ADAPTIVE) {
      return {
        strategy:             'random',
        enabled:              false,
        reason:               adaptiveDisabledReason(masteryRows.length),
        weakConcepts:         [],
        targetConcepts:       [],
        recommendedCardCount: 0,
        promptFocusText:      '',
      };
    }

    const { weak, medium } = await buildConceptBuckets(masteryRows, this.concepts);

    // P2: fill remaining capacity with medium concepts when weak bucket is small.
    // Readiness controls whether medium fill is permitted (disabled for struggling users).
    const allowMedium = readinessScore ? MEDIUM_FILL_BY_STATUS[readinessScore.status] : true;

    const targetWeak   = weak.slice(0, MAX_TARGET_CONCEPTS);
    const targetMedium = allowMedium
      ? medium.slice(0, MAX_TARGET_CONCEPTS - targetWeak.length)
      : [];
    const targetConcepts      = [...targetWeak, ...targetMedium];
    const recommendedCardCount = Math.min(targetConcepts.length * CARDS_PER_CONCEPT, MAX_RECOMMENDED);

    return {
      strategy:             'adaptive',
      enabled:              true,
      weakConcepts:         weak,
      targetConcepts,
      recommendedCardCount,
      promptFocusText:      buildFocusText(targetWeak, targetMedium),
    };
  }
}
