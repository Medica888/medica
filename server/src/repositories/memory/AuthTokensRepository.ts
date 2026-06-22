import { randomUUID } from 'crypto';
import type { AuthToken, AuthTokenType } from '../../types/index.js';
import type { IAuthTokensRepository } from '../interfaces.js';

export class InMemoryAuthTokensRepository implements IAuthTokensRepository {
  private store = new Map<string, AuthToken>();

  async create(data: {
    userId: string;
    tokenHash: string;
    type: AuthTokenType;
    expiresAt: Date;
  }): Promise<AuthToken> {
    const token: AuthToken = {
      id: randomUUID(),
      user_id: data.userId,
      token_hash: data.tokenHash,
      type: data.type,
      expires_at: data.expiresAt,
      used_at: null,
      created_at: new Date(),
    };
    this.store.set(token.id, token);
    return token;
  }

  async findActiveByHash(tokenHash: string, type: AuthTokenType): Promise<AuthToken | null> {
    const now = new Date();
    for (const token of this.store.values()) {
      if (
        token.token_hash === tokenHash &&
        token.type === type &&
        token.used_at === null &&
        token.expires_at > now
      ) {
        return token;
      }
    }
    return null;
  }

  async markUsed(id: string): Promise<void> {
    const token = this.store.get(id);
    if (token) token.used_at = new Date();
  }

  async markAllActiveUsedForUser(userId: string, type: AuthTokenType): Promise<void> {
    const now = new Date();
    for (const token of this.store.values()) {
      if (
        token.user_id === userId &&
        token.type === type &&
        token.used_at === null &&
        token.expires_at > now
      ) {
        token.used_at = now;
      }
    }
  }

  async deleteExpired(): Promise<void> {
    const now = new Date();
    for (const [id, token] of this.store.entries()) {
      if (token.expires_at <= now) this.store.delete(id);
    }
  }

  _clear(): void {
    this.store.clear();
  }
}
