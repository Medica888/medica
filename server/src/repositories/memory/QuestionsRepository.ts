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

  async findGeneratedBankQuestions(params: {
    subject?: string;
    system?: string;
    difficulty?: string;
    mode?: string;
    limit?: number;
  }): Promise<Record<string, unknown>[]> {
    const matchesRequested = (requested: string | undefined, actual: unknown, allLabels: string[]) => {
      const value = String(requested || '').trim();
      if (!value || allLabels.includes(value)) return true;
      return String(actual || '') === value;
    };
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    return [...this.store.values()]
      .map(entry => entry.body)
      .filter(body =>
        body.source === 'ai'
        && body.bankStatus === 'validated_generated'
        && matchesRequested(params.subject, body.subject, ['All Subjects'])
        && matchesRequested(params.system, body.system, ['Mixed / All Systems', 'All Systems'])
        && matchesRequested(params.difficulty, body.difficulty, ['Balanced'])
        && matchesRequested(params.mode, body.mode, []),
      )
      .slice(0, limit);
  }

  _getEntry(externalId: string): { id: string; subject: string; system: string; body: Record<string, unknown> } | undefined {
    return this.store.get(externalId);
  }
}
