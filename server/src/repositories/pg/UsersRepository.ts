import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { User, UserWithHash } from '../../types/index.js';
import type { IUsersRepository } from '../interfaces.js';

export class PgUsersRepository implements IUsersRepository {
  constructor(private pool: Pool) {}

  async findById(id: string): Promise<User | null> {
    const res = await this.pool.query<User>(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [id],
    );
    return res.rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<UserWithHash | null> {
    const res = await this.pool.query<UserWithHash>(
      'SELECT id, email, name, password_hash, created_at FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    return res.rows[0] ?? null;
  }

  async create(data: { email: string; name: string; password_hash: string }): Promise<User> {
    const id = randomUUID();
    const res = await this.pool.query<User>(
      `INSERT INTO users (id, email, name, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, name, created_at`,
      [id, data.email, data.name, data.password_hash],
    );
    return res.rows[0]!;
  }

  async updateName(id: string, name: string): Promise<User | null> {
    const res = await this.pool.query<User>(
      `UPDATE users SET name = $2 WHERE id = $1
       RETURNING id, email, name, created_at`,
      [id, name],
    );
    return res.rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
