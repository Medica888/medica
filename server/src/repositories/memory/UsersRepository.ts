import { randomUUID } from 'crypto';
import type { User, UserWithHash } from '../../types/index.js';
import type { IUsersRepository } from '../interfaces.js';

export class InMemoryUsersRepository implements IUsersRepository {
  private store = new Map<string, UserWithHash>();

  async findById(id: string): Promise<User | null> {
    const user = this.store.get(id);
    if (!user || user.deleted_at !== null) return null;
    const { password_hash: _, deleted_at: __, ...rest } = user;
    return rest;
  }

  async findByIdWithHash(id: string): Promise<UserWithHash | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<UserWithHash | null> {
    for (const user of this.store.values()) {
      if (user.email.toLowerCase() === email.toLowerCase() && user.deleted_at === null) return user;
    }
    return null;
  }

  async findByEmailIncludingDeleted(email: string): Promise<UserWithHash | null> {
    for (const user of this.store.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) return user;
    }
    return null;
  }

  async setEmailVerified(id: string): Promise<void> {
    const user = this.store.get(id);
    if (user) {
      user.email_verified = true;
      user.email_verified_at = new Date();
    }
  }

  async updatePasswordHash(id: string, passwordHash: string, _tx?: unknown): Promise<void> {
    const user = this.store.get(id);
    if (user) user.password_hash = passwordHash;
  }

  async create(data: { email: string; name: string; password_hash: string }): Promise<User> {
    const id = randomUUID();
    const user: UserWithHash = {
      id,
      ...data,
      email_verified: false,
      email_verified_at: null,
      deleted_at: null,
      created_at: new Date(),
    };
    this.store.set(id, user);
    const { password_hash: _, deleted_at: __, ...rest } = user;
    return rest;
  }

  async updateName(id: string, name: string): Promise<User | null> {
    const user = this.store.get(id);
    if (!user || user.deleted_at !== null) return null;
    user.name = name;
    const { password_hash: _, deleted_at: __, ...rest } = user;
    return rest;
  }

  async delete(id: string): Promise<boolean> {
    const user = this.store.get(id);
    if (!user || user.deleted_at !== null) return false;
    user.deleted_at = new Date();
    return true;
  }

  /** Test helper — clear all data */
  _clear(): void {
    this.store.clear();
  }

  /** Test helper — seed a user with a specific id (bypasses UUID generation) */
  _seedWithId(id: string): void {
    this.store.set(id, {
      id,
      email: `${id}@test.local`,
      name: id,
      password_hash: 'test-hash',
      email_verified: false,
      email_verified_at: null,
      deleted_at: null,
      created_at: new Date(),
    });
  }
}
