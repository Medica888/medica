import type { AIUsageRecord, IAIUsageBudgetRepository } from '../interfaces.js';

export class InMemoryAIUsageBudgetRepository implements IAIUsageBudgetRepository {
  private store = new Map<string, AIUsageRecord>();

  private key(userId: string, date: string): string {
    return `${userId}::${date}`;
  }

  async reserveRequest(userId: string, date: string, requestLimit: number | null, tokenLimit: number | null): Promise<'ok' | 'denied'> {
    const k = this.key(userId, date);
    const current = this.store.get(k) ?? { request_count: 0, token_count: 0 };
    if (requestLimit !== null && current.request_count >= requestLimit) return 'denied';
    if (tokenLimit !== null && current.token_count >= tokenLimit) return 'denied';
    this.store.set(k, { ...current, request_count: current.request_count + 1 });
    return 'ok';
  }

  async releaseRequest(userId: string, date: string): Promise<void> {
    const k = this.key(userId, date);
    const current = this.store.get(k);
    if (!current) return;
    this.store.set(k, { ...current, request_count: Math.max(current.request_count - 1, 0) });
  }

  async addTokens(userId: string, date: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    const k = this.key(userId, date);
    const current = this.store.get(k) ?? { request_count: 0, token_count: 0 };
    this.store.set(k, { ...current, token_count: current.token_count + tokens });
  }

  async incrementUsage(userId: string, date: string, requests: number, tokens: number): Promise<AIUsageRecord> {
    const k = this.key(userId, date);
    const current = this.store.get(k) ?? { request_count: 0, token_count: 0 };
    const next: AIUsageRecord = {
      request_count: current.request_count + requests,
      token_count:   current.token_count   + tokens,
    };
    this.store.set(k, next);
    return next;
  }

  async getUsage(userId: string, date: string): Promise<AIUsageRecord | null> {
    return this.store.get(this.key(userId, date)) ?? null;
  }

  _clear(): void {
    this.store.clear();
  }
}
