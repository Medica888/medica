import { randomUUID } from 'crypto';
import type {
  ITaxonomyCandidatesRepository,
  TaxonomyCandidate,
  TaxonomyCandidateStatus,
} from '../interfaces.js';

function keyFor(rawLabel: string): string {
  return rawLabel.toLowerCase().replace(/\s+/g, ' ').trim();
}

export class InMemoryTaxonomyCandidatesRepository implements ITaxonomyCandidatesRepository {
  private readonly store = new Map<string, TaxonomyCandidate>();

  async upsertUnknownTopicCandidate(data: {
    rawLabel: string;
    normalizedGuess: string;
    subject: string;
    system: string;
    exampleQuestionFingerprint?: string | null;
    source?: string;
    type?: 'topic' | 'concept';
    metadata?: Record<string, unknown>;
  }): Promise<TaxonomyCandidate> {
    const rawLabel = data.rawLabel.trim();
    const rawLabelKey = keyFor(rawLabel);
    const now = new Date();
    const existing = this.store.get(rawLabelKey);
    if (existing) {
      const updated: TaxonomyCandidate = {
        ...existing,
        normalizedGuess: data.normalizedGuess || existing.normalizedGuess,
        subject: data.subject || existing.subject,
        system: data.system || existing.system,
        exampleQuestionFingerprint: data.exampleQuestionFingerprint ?? existing.exampleQuestionFingerprint,
        source: data.source || existing.source,
        metadata: { ...existing.metadata, ...(data.metadata ?? {}) },
        frequency: existing.frequency + 1,
        updatedAt: now,
        lastSeenAt: now,
      };
      this.store.set(rawLabelKey, updated);
      return updated;
    }

    const candidate: TaxonomyCandidate = {
      id: randomUUID(),
      rawLabel,
      rawLabelKey,
      normalizedGuess: data.normalizedGuess,
      subject: data.subject,
      system: data.system,
      frequency: 1,
      exampleQuestionFingerprint: data.exampleQuestionFingerprint ?? null,
      source: data.source || 'unknown_topic',
      type: data.type ?? 'topic',
      status: 'pending',
      metadata: data.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    };
    this.store.set(rawLabelKey, candidate);
    return candidate;
  }

  async findUnknownTopicCandidates(params: {
    status?: TaxonomyCandidateStatus;
    limit?: number;
    offset?: number;
  } = {}): Promise<TaxonomyCandidate[]> {
    const limit = Math.max(1, Math.min(Number(params.limit) || 100, 200));
    const offset = Math.max(0, Number(params.offset) || 0);
    return [...this.store.values()]
      .filter(candidate => !params.status || candidate.status === params.status)
      .sort((a, b) => {
        if (b.frequency !== a.frequency) return b.frequency - a.frequency;
        return new Date(b.lastSeenAt ?? 0).getTime() - new Date(a.lastSeenAt ?? 0).getTime();
      })
      .slice(offset, offset + limit);
  }

  async updateUnknownTopicCandidateStatus(
    id: string,
    data: {
      status: TaxonomyCandidateStatus;
      metadata?: Record<string, unknown>;
    },
  ): Promise<TaxonomyCandidate | null> {
    const entry = [...this.store.entries()].find(([, candidate]) => candidate.id === id);
    if (!entry) return null;
    const [key, candidate] = entry;
    const updated: TaxonomyCandidate = {
      ...candidate,
      status: data.status,
      metadata: { ...candidate.metadata, ...(data.metadata ?? {}) },
      updatedAt: new Date(),
    };
    this.store.set(key, updated);
    return updated;
  }
}
