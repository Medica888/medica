import { randomUUID } from 'crypto';
import type { IQuestionsRepository } from '../interfaces.js';

export class InMemoryQuestionsRepository implements IQuestionsRepository {
  private store = new Map<string, { id: string; subject: string; system: string; body: Record<string, unknown> }>();

  async upsertByExternalId(
    externalId: string,
    data: { subject: string; system: string; body: Record<string, unknown> },
  ): Promise<{ id: string }> {
    const existing = this.store.get(externalId);
    if (existing) {
      this.store.set(externalId, { ...existing, ...data });
      return { id: existing.id };
    }
    const id = randomUUID();
    this.store.set(externalId, { id, ...data });
    return { id };
  }

  async findByExternalId(externalId: string): Promise<{ id: string } | null> {
    const entry = this.store.get(externalId);
    return entry ? { id: entry.id } : null;
  }
}
