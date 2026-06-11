import type { IConceptsRepository } from '../repositories/interfaces.js';
import { isConceptUsable, slugifyConcept } from '../services/ConceptMappingService.js';
import { lookupConcept } from './medicaConceptTaxonomy.js';

/**
 * Slugifies and upserts a single canonical concept name into the concepts table
 * with source='canonical'. Returns the concept UUID, or null if the name is invalid.
 */
export async function canonicalConceptToMasteryKey(
  concept: string,
  conceptsRepo: IConceptsRepository,
  tx?: unknown,
): Promise<string | null> {
  if (!isConceptUsable(concept)) return null;
  const slug = slugifyConcept(concept.trim());
  const taxonomy = lookupConcept(concept);
  const row = await conceptsRepo.upsertBySlug(
    slug,
    {
      name:    concept.trim(),
      subject: taxonomy?.subject ?? '',
      system:  taxonomy?.system  ?? '',
      source:  'canonical',
    },
    tx,
  );
  return row.id;
}

/**
 * Upserts all valid canonical concept names and returns their UUIDs.
 * Deduplicates by slug so the same concept name in multiple forms counts once.
 */
export async function canonicalConceptsToMasteryKeys(
  concepts: string[],
  conceptsRepo: IConceptsRepository,
  tx?: unknown,
): Promise<string[]> {
  const seenSlugs = new Set<string>();
  const ids: string[] = [];
  for (const concept of concepts) {
    if (!isConceptUsable(concept)) continue;
    const slug = slugifyConcept(concept.trim());
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    const id = await canonicalConceptToMasteryKey(concept, conceptsRepo, tx);
    if (id) ids.push(id);
  }
  return ids;
}

/**
 * Returns the canonical concept name for a mastery-key UUID, or null if the
 * concept does not exist or was not sourced from the canonical taxonomy.
 */
export async function masteryKeyToCanonicalConcept(
  conceptId: string,
  conceptsRepo: IConceptsRepository,
): Promise<string | null> {
  const concept = await conceptsRepo.findById(conceptId);
  if (!concept || concept.source !== 'canonical') return null;
  return concept.name;
}
