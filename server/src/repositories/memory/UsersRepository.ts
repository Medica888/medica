import { randomUUID } from 'crypto';
import type { User, UserWithHash } from '../../types/index.js';
import type { IUsersRepository } from '../interfaces.js';

export class InMemoryUsersRepository implements IUsersRepository {
  private store = new Map<string, UserWithHash>();

  async findById(id: string): Promise<User | null> {
    const user = this.store.get(id);
    if (!user) return null;
    const { password_hash: _, ...rest } = user;
    return rest;
  }

  async findByEmail(email: string): Promise<UserWithHash | null> {
    for (const user of this.store.values()) {
      if (user.email.toLowerCase() === email.toLowerCase()) return user;
    }
    return null;
  }

  async create(data: { email: string; name: string; password_hash: string }): Promise<User> {
    const id = randomUUID();
    const user: UserWithHash = { id, ...data, created_at: new Date() };
    this.store.set(id, user);
    const { password_hash: _, ...rest } = user;
    return rest;
  }

  async updateName(id: string, name: string): Promise<User | null> {
    const user = this.store.get(id);
    if (!user) return null;
    user.name = name;
    const { password_hash: _, ...rest } = user;
    return rest;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /** Test helper — clear all data */
  _clear(): void {
    this.store.clear();
  }
}
