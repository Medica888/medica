import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { AdaptiveBlueprint, UserConceptMastery } from '../types/index.js';

// Must match MasteryQueryService.ts and AnalyticsDashboard.jsx SUBJECT_STATUS
const TIER_WEAK   = 0.65;
const TIER_MEDIUM = 0.75;

const MIN_RECORDS_FOR_ADAPTIVE = 20;

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
  if (weak.length > 0) {
    lines.push(`Priority (needs most work): ${weak.slice(0, 8).join(', ')}`);
  }
  if (medium.length > 0) {
    lines.push(`Developing (needs reinforcement): ${medium.slice(0, 5).join(', ')}`);
  }
  lines.push('Aim for at least 50–60% of questions to directly test one of these concepts.');
  lines.push('Each target concept should be tested from a unique clinical angle.');
  return lines.join('\n');
}

export class AdaptiveExamService {
  constructor(
    private mastery:  IUserConceptMasteryRepository,
    private concepts: IConceptsRepository,
  ) {}

  /** Returns a 10-question preview blueprint for the adaptive-preview endpoint. */
  async buildAdaptivePreview(userId: string): Promise<AdaptiveBlueprint> {
    return this.buildAdaptiveBlueprint(userId, 10);
  }

  async buildAdaptiveBlueprint(userId: string, questionCount: number): Promise<AdaptiveBlueprint> {
    const rows = await this.mastery.findByUserId(userId);

    if (rows.length < MIN_RECORDS_FOR_ADAPTIVE) {
      return {
        ...RANDOM_RESULT,
        reason: `Only ${rows.length} concept(s) tracked — ${MIN_RECORDS_FOR_ADAPTIVE} needed for adaptive mode.`,
      };
    }

    // Sort: lowest mastery_score first; break ties by highest recent_incorrect_count
    const sorted = [...rows].sort((a: UserConceptMastery, b: UserConceptMastery) => {
      if (a.mastery_score !== b.mastery_score) return a.mastery_score - b.mastery_score;
      return b.recent_incorrect_count - a.recent_incorrect_count;
    });

    // Fetch concept names in parallel — no N+1
    const conceptObjects = await Promise.all(sorted.map((r) => this.concepts.findById(r.concept_id)));

    const enriched = sorted
      .map((row, i) => ({ row, name: conceptObjects[i]?.name ?? null }))
      .filter((x): x is { row: UserConceptMastery; name: string } => x.name !== null);

    // Bucket by tier
    const weak:   string[] = [];
    const medium: string[] = [];
    const strong: string[] = [];

    for (const { row, name } of enriched) {
      if (row.mastery_score < TIER_WEAK)        weak.push(name);
      else if (row.mastery_score < TIER_MEDIUM) medium.push(name);
      else                                       strong.push(name);
    }

    // Allocate target concepts: 50% weak, 30% medium
    const weakSlots   = Math.floor(questionCount * FRAC_WEAK);
    const mediumSlots = Math.floor(questionCount * FRAC_MEDIUM);
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
