import type { IConceptsRepository } from '../repositories/interfaces.js';
import type { Concept } from '../types/index.js';

export class ConceptHierarchyService {
  constructor(private concepts: IConceptsRepository) {}

  /**
   * Returns the slug path from root to the given concept (inclusive).
   *
   * Example: for concept "bradykinin-cough" whose ancestry is:
   *   raas-pharmacology → antihypertensive-adverse-effects → ace-inhibitor → bradykinin-cough
   *
   * Returns: ["raas-pharmacology", "antihypertensive-adverse-effects", "ace-inhibitor", "bradykinin-cough"]
   */
  async getPath(conceptId: string): Promise<string[]> {
    const [self, ancestors] = await Promise.all([
      this.concepts.findById(conceptId),
      this.concepts.findAncestors(conceptId),
    ]);
    if (!self) return [];
    // findAncestors returns [parent, grandparent, …, root] — reverse to get root-first
    const rootFirst = [...ancestors].reverse();
    return [...rootFirst.map((c) => c.slug), self.slug];
  }

  /**
   * Returns IDs of all ancestors in root-first order.
   * Useful for upstream mastery updates and concept roll-up queries.
   */
  async getAncestorIds(conceptId: string): Promise<string[]> {
    const ancestors = await this.concepts.findAncestors(conceptId);
    return [...ancestors].reverse().map((c) => c.id);
  }

  /**
   * Returns the full ancestor + self + descendant set for a concept.
   * Useful for "related concept" lookups.
   */
  async getFamily(conceptId: string): Promise<{
    self: Concept | null;
    ancestors: Concept[];
    descendants: Concept[];
  }> {
    const [self, ancestors, descendants] = await Promise.all([
      this.concepts.findById(conceptId),
      this.concepts.findAncestors(conceptId),
      this.concepts.findDescendants(conceptId),
    ]);
    return { self, ancestors: [...ancestors].reverse(), descendants };
  }

  /**
   * Returns true if targetId is an ancestor of conceptId (direct or indirect).
   */
  async isDescendantOf(conceptId: string, ancestorId: string): Promise<boolean> {
    const ancestors = await this.concepts.findAncestors(conceptId);
    return ancestors.some((a) => a.id === ancestorId);
  }

  /**
   * Returns the root concept (the ancestor with no parent_concept_id).
   * Returns the concept itself if it has no ancestors.
   */
  async getRoot(conceptId: string): Promise<Concept | null> {
    const ancestors = await this.concepts.findAncestors(conceptId);
    if (!ancestors.length) return this.concepts.findById(conceptId);
    return ancestors[ancestors.length - 1]!; // findAncestors returns parent-first; last = root
  }
}
