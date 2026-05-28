import { randomUUID } from 'crypto';
import type { AnalyticsSnapshot } from '../../types/index.js';
import type { IAnalyticsRepository } from '../interfaces.js';

export class InMemoryAnalyticsRepository implements IAnalyticsRepository {
  private store = new Map<string, AnalyticsSnapshot>();

  async findLatestByUserId(userId: string): Promise<AnalyticsSnapshot | null> {
    const snapshots = await this.findByUserId(userId);
    return snapshots[0] ?? null;
  }

  async findByUserId(userId: string): Promise<AnalyticsSnapshot[]> {
    return [...this.store.values()]
      .filter((s) => s.user_id === userId)
      .sort((a, b) => b.snapshot_date.getTime() - a.snapshot_date.getTime());
  }

  async upsert(snapshot: Omit<AnalyticsSnapshot, 'id'>): Promise<AnalyticsSnapshot> {
    // Find same-day snapshot for this user
    const existing = [...this.store.values()].find(
      (s) =>
        s.user_id === snapshot.user_id &&
        s.snapshot_date.toDateString() === snapshot.snapshot_date.toDateString(),
    );
    if (existing) {
      Object.assign(existing, snapshot);
      return existing;
    }
    const id = randomUUID();
    const record: AnalyticsSnapshot = { id, ...snapshot };
    this.store.set(id, record);
    return record;
  }

  _clear(): void {
    this.store.clear();
  }
}
