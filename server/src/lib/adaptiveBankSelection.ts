import { extractConcepts, slugifyConcept } from '../services/ConceptMappingService.js';
import type { AdaptiveBlueprint } from '../types/index.js';

export interface AdaptiveBankSelection<T> {
  questions: T[];
  /** Target concept names that received a question, in priority order. */
  matchedConcepts: string[];
}

type ConceptSource = Parameters<typeof extractConcepts>[0];

/**
 * Picks `count` questions from an already-reviewed pool, favouring the user's weak and
 * medium concepts. Fills at most one question per target concept (weak before medium,
 * as ordered in `blueprint.targetConcepts`), then tops up from the rest of the pool in
 * its given order so the block keeps breadth. Questions match a concept through the same
 * metadata extraction that created the user's mastery rows, so the match is exact.
 *
 * Never returns more than `count` questions or any question outside `pool`.
 */
export function selectAdaptiveFromBank<T extends ConceptSource>(
  pool: T[],
  blueprint: Pick<AdaptiveBlueprint, 'targetConcepts'>,
  count: number,
): AdaptiveBankSelection<T> {
  const targetSlugs = blueprint.targetConcepts.map(slugifyConcept);

  const picked = new Set<number>();
  const matchedConcepts: string[] = [];

  targetSlugs.forEach((slug, targetIndex) => {
    if (picked.size >= count || !slug) return;
    let bestIndex = -1;
    let bestWeight = -1;
    pool.forEach((question, poolIndex) => {
      if (picked.has(poolIndex)) return;
      const hit = extractConcepts(question).find((candidate) => candidate.slug === slug);
      if (hit && hit.weight > bestWeight) {
        bestIndex = poolIndex;
        bestWeight = hit.weight;
      }
    });
    if (bestIndex >= 0) {
      picked.add(bestIndex);
      matchedConcepts.push(blueprint.targetConcepts[targetIndex]!);
    }
  });

  pool.forEach((_, poolIndex) => {
    if (picked.size < count) picked.add(poolIndex);
  });

  // Keep pool order (already shuffled by the caller) so targeted questions are not clustered first.
  const questions = pool.filter((_, poolIndex) => picked.has(poolIndex));
  return { questions, matchedConcepts };
}
