import { randomUUID } from 'crypto';
import type { Concept } from '../../types/index.js';
import type { IConceptsRepository } from '../interfaces.js';

export class InMemoryConceptsRepository implements IConceptsRepository {
  private slugIndex = new Map<string, Concept>(); // slug → Concept
  private idIndex   = new Map<string, Concept>(); // id   → Concept

  async upsertBySlug(
    slug: string,
    data: {
      name: string;
      subject: string;
      system: string;
      description?: string;
      parent_concept_id?: string;
    },
    _tx?: unknown,
  ): Promise<Concept> {
    const existing = this.slugIndex.get(slug);
    if (existing) {
      existing.name = data.name;
      existing.updated_at = new Date();
      // Set parent when provided and not yet set (COALESCE behaviour)
      if (data.parent_concept_id && !existing.parent_concept_id) {
        existing.parent_concept_id = data.parent_concept_id;
      }
      return { ...existing };
    }
    const concept: Concept = {
      id:                randomUUID(),
      name:              data.name,
      slug,
      subject:           data.subject,
      system:            data.system,
      parent_concept_id: data.parent_concept_id,
      difficulty:        'standard',
      description:       data.description ?? '',
      created_at:        new Date(),
      updated_at:        new Date(),
    };
    this.slugIndex.set(slug, concept);
    this.idIndex.set(concept.id, concept);
    return { ...concept };
  }

  async findBySlug(slug: string): Promise<Concept | null> {
    const c = this.slugIndex.get(slug);
    return c ? { ...c } : null;
  }

  async findById(id: string): Promise<Concept | null> {
    const c = this.idIndex.get(id);
    return c ? { ...c } : null;
  }

  async findAncestors(conceptId: string): Promise<Concept[]> {
    const ancestors: Concept[] = [];
    let current = this.idIndex.get(conceptId);
    while (current?.parent_concept_id) {
      const parent = this.idIndex.get(current.parent_concept_id);
      if (!parent) break;
      ancestors.push({ ...parent });
      current = parent;
    }
    return ancestors;
  }

  async findDescendants(conceptId: string): Promise<Concept[]> {
    const result: Concept[] = [];
    const queue: string[] = [conceptId];
    while (queue.length) {
      const parentId = queue.shift()!;
      for (const c of this.idIndex.values()) {
        if (c.parent_concept_id === parentId) {
          result.push({ ...c });
          queue.push(c.id);
        }
      }
    }
    return result;
  }

  _getAll(): Concept[] {
    return [...this.slugIndex.values()].map((c) => ({ ...c }));
  }

  _clear(): void {
    this.slugIndex.clear();
    this.idIndex.clear();
  }
}
