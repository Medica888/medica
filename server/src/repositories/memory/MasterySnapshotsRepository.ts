import { randomUUID } from 'crypto';
import type { MasterySnapshot } from '../../types/index.js';
import type { IMasterySnapshotsRepository } from '../interfaces.js';

export class InMemoryMasterySnapshotsRepository implements IMasterySnapshotsRepository {
  private rows: MasterySnapshot[] = [];

  async insertBatch(
    snapshots: {
      userId:       string;
      conceptId:    string;
      sessionId:    string;
      masteryScore: number;
      confidence:   number;
      attemptCount: number;
    }[],
  ): Promise<void> {
    const now = new Date();
    for (const s of snapshots) {
      // Mirrors the PG unique constraint (user_id, concept_id, session_id) + ON CONFLICT DO NOTHING —
      // a retried snapshot for the same session must not create a duplicate row.
      const alreadyExists = this.rows.some((r) => (
        r.user_id === s.userId && r.concept_id === s.conceptId && r.session_id === s.sessionId
      ));
      if (alreadyExists) continue;
      this.rows.push({
        id:            randomUUID(),
        user_id:       s.userId,
        concept_id:    s.conceptId,
        session_id:    s.sessionId,
        mastery_score: s.masteryScore,
        confidence:    s.confidence,
        attempt_count: s.attemptCount,
        created_at:    now,
      });
    }
  }

  async findByUserId(userId: string, limit = 5000): Promise<MasterySnapshot[]> {
    const all = this.rows
      .filter((r) => r.user_id === userId)
      .sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    // Return the most recent `limit` rows, preserving ASC order within the window.
    return all.length <= limit ? all : all.slice(all.length - limit);
  }

  async findBatchIds(userId: string): Promise<string[]> {
    const seen     = new Set<string>();
    const ordered: string[] = [];
    // rows are insertion-ordered; maintain that for chronological batch order
    for (const r of this.rows) {
      if (r.user_id === userId && !seen.has(r.session_id)) {
        seen.add(r.session_id);
        ordered.push(r.session_id);
      }
    }
    return ordered;
  }

  async findByBatch(userId: string, sessionId: string): Promise<MasterySnapshot[]> {
    return this.rows.filter((r) => r.user_id === userId && r.session_id === sessionId);
  }

  _clear(): void { this.rows = []; }
  _getAll(): MasterySnapshot[] { return [...this.rows]; }
}
