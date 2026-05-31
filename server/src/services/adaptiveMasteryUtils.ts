/**
 * Shared mastery computation utilities.
 * Used by both AdaptiveExamService and AdaptiveFlashcardService.
 * Thresholds match MasteryQueryService.ts and AnalyticsDashboard.jsx SUBJECT_STATUS.
 */

import type { IConceptsRepository } from '../repositories/interfaces.js';
import type { UserConceptMastery } from '../types/index.js';

export const TIER_WEAK        = 0.65;
export const TIER_MEDIUM      = 0.75;
export const TIER_REINFORCED  = 0.85;
export const MIN_FOR_ADAPTIVE = 20;

/** Single reason string for all "not enough data" early-returns. */
export function adaptiveDisabledReason(rowCount: number): string {
  return `Only ${rowCount} concept(s) tracked — ${MIN_FOR_ADAPTIVE} needed for personalized recommendations.`;
}

export interface ConceptBuckets {
  weak:   string[];
  medium: string[];
  strong: string[];
}

/** Sorts rows weakest-first; breaks ties by highest recent_incorrect_count. */
export function sortByWeakness(rows: UserConceptMastery[]): UserConceptMastery[] {
  return [...rows].sort((a, b) => {
    if (a.mastery_score !== b.mastery_score) return a.mastery_score - b.mastery_score;
    return b.recent_incorrect_count - a.recent_incorrect_count;
  });
}

/**
 * Resolves concept names and buckets them by tier.
 * Drops any concept_id that has no matching row in the concepts table.
 * Single Promise.all — no N+1.
 */
export async function buildConceptBuckets(
  rows:         UserConceptMastery[],
  conceptsRepo: IConceptsRepository,
): Promise<ConceptBuckets> {
  const sorted   = sortByWeakness(rows);
  const resolved = await Promise.all(sorted.map((r) => conceptsRepo.findById(r.concept_id)));

  const weak: string[] = [], medium: string[] = [], strong: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const name  = resolved[i]?.name;
    const score = sorted[i]!.mastery_score;
    if (!name) continue;
    if (score < TIER_WEAK)        weak.push(name);
    else if (score < TIER_MEDIUM) medium.push(name);
    else                           strong.push(name);
  }
  return { weak, medium, strong };
}
