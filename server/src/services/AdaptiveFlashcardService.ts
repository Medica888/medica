import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { AdaptiveFlashcardPlan } from '../types/index.js';
import { MIN_FOR_ADAPTIVE, buildConceptBuckets } from './adaptiveMasteryUtils.js';

// Top N weak concepts to target — keeps the AI prompt focused and prompt length bounded
const MAX_TARGET_CONCEPTS  = 10;
// ~2 cards per concept: Recall + Pearl or Trap
const CARDS_PER_CONCEPT    = 2;
const MAX_RECOMMENDED      = 20;

function buildFocusText(targets: string[]): string {
  if (!targets.length) return '';
  const lines = [
    'ADAPTIVE FLASHCARD FOCUS — PERSONALIZED REINFORCEMENT:',
    "Based on this user's exam history, generate flashcards focused primarily on these weak concepts:",
    `Priority: ${targets.join(', ')}`,
    'Generate 60–80% of cards testing one of these concepts directly.',
    'Each concept should be tested from a unique clinical angle (mechanism, adverse effect, diagnosis, etc.).',
  ];
  return lines.join('\n');
}

export class AdaptiveFlashcardService {
  constructor(
    private mastery:  IUserConceptMasteryRepository,
    private concepts: IConceptsRepository,
  ) {}

  async buildAdaptiveFlashcardPlan(userId: string): Promise<AdaptiveFlashcardPlan> {
    const rows = await this.mastery.findByUserId(userId);

    if (rows.length < MIN_FOR_ADAPTIVE) {
      return {
        strategy:             'random',
        enabled:              false,
        reason:               `Only ${rows.length} concept(s) tracked — ${MIN_FOR_ADAPTIVE} needed for adaptive flashcards.`,
        weakConcepts:         [],
        targetConcepts:       [],
        recommendedCardCount: 0,
        promptFocusText:      '',
      };
    }

    const { weak } = await buildConceptBuckets(rows, this.concepts);

    const targetConcepts      = weak.slice(0, MAX_TARGET_CONCEPTS);
    const recommendedCardCount = Math.min(targetConcepts.length * CARDS_PER_CONCEPT, MAX_RECOMMENDED);

    return {
      strategy:             'adaptive',
      enabled:              true,
      weakConcepts:         weak,
      targetConcepts,
      recommendedCardCount,
      promptFocusText:      buildFocusText(targetConcepts),
    };
  }
}
