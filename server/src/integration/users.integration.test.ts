import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { PgUsersRepository } from '../repositories/pg/UsersRepository.js';
import { PgAuthTokensRepository } from '../repositories/pg/AuthTokensRepository.js';
import { createTestPool, truncateAll, makeUser } from './helpers.js';

describe('PgUsersRepository — integration', () => {
  let pool: Pool;
  let users: PgUsersRepository;

  beforeAll(() => {
    pool = createTestPool();
    users = new PgUsersRepository(pool);
  });

  afterAll(() => pool.end());
  beforeEach(() => truncateAll(pool));

  it('create returns the new user with default email_verified = false', async () => {
    const u = await users.create(makeUser({ email: 'alice@test.com', name: 'Alice' }));
    expect(u.email).toBe('alice@test.com');
    expect(u.name).toBe('Alice');
    expect(u.id).toBeTruthy();
    expect(u.email_verified).toBe(false);
  });

  it('findById returns the user', async () => {
    const created = await users.create(makeUser({ email: 'bob@test.com' }));
    const found = await users.findById(created.id);
    expect(found?.id).toBe(created.id);
    expect(found?.email).toBe('bob@test.com');
  });

  it('findById returns null for unknown id', async () => {
    const result = await users.findById(randomUUID());
    expect(result).toBeNull();
  });

  it('findByEmail is case-insensitive via LOWER(email)', async () => {
    await users.create(makeUser({ email: 'carol@test.com' }));
    const found = await users.findByEmail('CAROL@TEST.COM');
    expect(found?.email).toBe('carol@test.com');
  });

  it('findByEmail returns null for unknown email', async () => {
    const result = await users.findByEmail('nobody@test.com');
    expect(result).toBeNull();
  });

  it('duplicate email rejected by plain UNIQUE constraint', async () => {
    await users.create(makeUser({ email: 'dup@test.com' }));
    await expect(users.create(makeUser({ email: 'dup@test.com' }))).rejects.toThrow();
  });

  it('case-variant email rejected by LOWER(email) functional index', async () => {
    await users.create(makeUser({ email: 'case@test.com' }));
    // Inserting with different casing triggers the unique index on LOWER(email)
    await expect(users.create(makeUser({ email: 'CASE@TEST.COM' }))).rejects.toThrow();
  });

  it('updateName persists the new name', async () => {
    const u = await users.create(makeUser({ email: 'dave@test.com', name: 'Dave' }));
    const updated = await users.updateName(u.id, 'David');
    expect(updated?.name).toBe('David');
    const refetched = await users.findById(u.id);
    expect(refetched?.name).toBe('David');
  });

  it('soft-delete hides user from findById', async () => {
    const u = await users.create(makeUser({ email: 'del@test.com' }));
    const deleted = await users.delete(u.id);
    expect(deleted).toBe(true);
    const found = await users.findById(u.id);
    expect(found).toBeNull();
  });

  it('soft-delete hides user from findByEmail', async () => {
    const u = await users.create(makeUser({ email: 'delmail@test.com' }));
    await users.delete(u.id);
    const found = await users.findByEmail('delmail@test.com');
    expect(found).toBeNull();
  });

  it('findByEmailIncludingDeleted returns soft-deleted user', async () => {
    const u = await users.create(makeUser({ email: 'ghost@test.com' }));
    await users.delete(u.id);
    const found = await users.findByEmailIncludingDeleted('ghost@test.com');
    expect(found?.id).toBe(u.id);
    expect(found?.deleted_at).toBeTruthy();
  });

  it('setEmailVerified marks the user verified', async () => {
    const u = await users.create(makeUser({ email: 'verify@test.com' }));
    await users.setEmailVerified(u.id);
    const updated = await users.findById(u.id);
    expect(updated?.email_verified).toBe(true);
    expect(updated?.email_verified_at).toBeTruthy();
  });

  describe('PgAuthTokensRepository — integration', () => {
    let authTokens: PgAuthTokensRepository;

    beforeAll(() => { authTokens = new PgAuthTokensRepository(pool); });

    it('create + findActiveByHash round-trip works', async () => {
      const u = await users.create(makeUser({ email: 'token@test.com' }));
      const hash = 'sha256-testhash-' + randomUUID();
      const expiresAt = new Date(Date.now() + 3600_000);

      const token = await authTokens.create({
        userId: u.id,
        tokenHash: hash,
        type: 'email_verification',
        expiresAt,
      });

      expect(token.token_hash).toBe(hash);
      expect(token.used_at).toBeNull();

      const found = await authTokens.findActiveByHash(hash, 'email_verification');
      expect(found?.id).toBe(token.id);
    });

    it('markUsed makes token no longer findable', async () => {
      const u = await users.create(makeUser({ email: 'markused@test.com' }));
      const hash = 'sha256-used-' + randomUUID();
      const token = await authTokens.create({
        userId: u.id,
        tokenHash: hash,
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 3600_000),
      });

      await authTokens.markUsed(token.id);
      const found = await authTokens.findActiveByHash(hash, 'password_reset');
      expect(found).toBeNull();
    });

    it('expired token not returned by findActiveByHash', async () => {
      const u = await users.create(makeUser({ email: 'expired@test.com' }));
      const hash = 'sha256-expired-' + randomUUID();
      await authTokens.create({
        userId: u.id,
        tokenHash: hash,
        type: 'password_reset',
        expiresAt: new Date(Date.now() - 1000), // already expired
      });

      const found = await authTokens.findActiveByHash(hash, 'password_reset');
      expect(found).toBeNull();
    });

    it('duplicate token_hash rejected by unique constraint', async () => {
      const u = await users.create(makeUser({ email: 'duphash@test.com' }));
      const hash = 'sha256-dup-' + randomUUID();
      await authTokens.create({
        userId: u.id,
        tokenHash: hash,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 3600_000),
      });
      await expect(authTokens.create({
        userId: u.id,
        tokenHash: hash,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 3600_000),
      })).rejects.toThrow();
    });
  });
});
