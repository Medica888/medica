import type { Pool } from 'pg';
import type { AIUsageRecord, IAIUsageBudgetRepository } from '../interfaces.js';

export class PgAIUsageBudgetRepository implements IAIUsageBudgetRepository {
  constructor(private pool: Pool) {}

  async reserveRequest(userId: string, date: string, requestLimit: number | null, tokenLimit: number | null): Promise<'ok' | 'denied'> {
    // Atomic upsert: insert or increment, but only when both limits pass.
    // A fresh INSERT row has token_count=0, so any positive tokenLimit allows it.
    // ON CONFLICT DO UPDATE WHERE false → 0 rows returned → budget exceeded.
    // Zero limits are pre-checked by the caller; this handles null (unlimited) and positive limits.
    const res = await this.pool.query<{ request_count: number }>(
      `INSERT INTO user_ai_usage (user_id, usage_date, request_count, token_count)
       VALUES ($1, $2::date, 1, 0)
       ON CONFLICT (user_id, usage_date) DO UPDATE
         SET request_count = user_ai_usage.request_count + 1
       WHERE ($3::integer IS NULL OR user_ai_usage.request_count < $3::integer)
         AND ($4::bigint IS NULL OR user_ai_usage.token_count < $4::bigint)
       RETURNING request_count`,
      [userId, date, requestLimit, tokenLimit],
    );
    return res.rows.length > 0 ? 'ok' : 'denied';
  }

  async releaseRequest(userId: string, date: string): Promise<void> {
    await this.pool.query(
      `UPDATE user_ai_usage
       SET request_count = GREATEST(request_count - 1, 0)
       WHERE user_id = $1 AND usage_date = $2::date`,
      [userId, date],
    );
  }

  async addTokens(userId: string, date: string, tokens: number): Promise<void> {
    if (tokens <= 0) return;
    await this.pool.query(
      `INSERT INTO user_ai_usage (user_id, usage_date, request_count, token_count)
       VALUES ($1, $2::date, 0, $3)
       ON CONFLICT (user_id, usage_date) DO UPDATE
         SET token_count = user_ai_usage.token_count + EXCLUDED.token_count`,
      [userId, date, tokens],
    );
  }

  async incrementUsage(userId: string, date: string, requests: number, tokens: number): Promise<AIUsageRecord> {
    const res = await this.pool.query<{ request_count: number; token_count: string }>(
      `INSERT INTO user_ai_usage (user_id, usage_date, request_count, token_count)
       VALUES ($1, $2::date, $3, $4)
       ON CONFLICT (user_id, usage_date) DO UPDATE
         SET request_count = user_ai_usage.request_count + EXCLUDED.request_count,
             token_count   = user_ai_usage.token_count   + EXCLUDED.token_count
       RETURNING request_count, token_count`,
      [userId, date, requests, tokens],
    );
    const row = res.rows[0]!;
    return { request_count: row.request_count, token_count: Number(row.token_count) };
  }

  async getUsage(userId: string, date: string): Promise<AIUsageRecord | null> {
    const res = await this.pool.query<{ request_count: number; token_count: string }>(
      'SELECT request_count, token_count FROM user_ai_usage WHERE user_id = $1 AND usage_date = $2::date',
      [userId, date],
    );
    if (!res.rows[0]) return null;
    return { request_count: res.rows[0].request_count, token_count: Number(res.rows[0].token_count) };
  }
}
