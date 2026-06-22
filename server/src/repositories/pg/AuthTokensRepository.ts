import type { Pool } from 'pg';
import type { AuthToken, AuthTokenType } from '../../types/index.js';
import type { IAuthTokensRepository } from '../interfaces.js';

export class PgAuthTokensRepository implements IAuthTokensRepository {
  constructor(private pool: Pool) {}

  async create(data: {
    userId: string;
    tokenHash: string;
    type: AuthTokenType;
    expiresAt: Date;
  }): Promise<AuthToken> {
    const res = await this.pool.query<AuthToken>(
      `INSERT INTO auth_tokens (user_id, token_hash, type, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, token_hash, type, expires_at, used_at, created_at`,
      [data.userId, data.tokenHash, data.type, data.expiresAt],
    );
    return res.rows[0]!;
  }

  async findActiveByHash(tokenHash: string, type: AuthTokenType): Promise<AuthToken | null> {
    const res = await this.pool.query<AuthToken>(
      `SELECT id, user_id, token_hash, type, expires_at, used_at, created_at
       FROM auth_tokens
       WHERE token_hash = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash, type],
    );
    return res.rows[0] ?? null;
  }

  async markUsed(id: string): Promise<void> {
    await this.pool.query(
      'UPDATE auth_tokens SET used_at = now() WHERE id = $1',
      [id],
    );
  }

  async markAllActiveUsedForUser(userId: string, type: AuthTokenType, tx?: unknown): Promise<void> {
    const q = (tx as import('pg').PoolClient | undefined) ?? this.pool;
    await q.query(
      `UPDATE auth_tokens SET used_at = now()
       WHERE user_id = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()`,
      [userId, type],
    );
  }

  async deleteExpired(): Promise<void> {
    await this.pool.query('DELETE FROM auth_tokens WHERE expires_at <= now()');
  }
}
