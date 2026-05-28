import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import type { IUsersRepository } from '../repositories/interfaces.js';
import type { User } from '../types/index.js';

export class AuthService {
  constructor(private users: IUsersRepository) {}

  async register(email: string, name: string, password: string): Promise<{ user: User; token: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) throw new Error('EMAIL_TAKEN');

    const BCRYPT_ROUNDS = config.nodeEnv === 'test' ? 10 : 12;
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.users.create({ email: normalizedEmail, name, password_hash });
    const token = this.signToken(user.id);
    return { user, token };
  }

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const record = await this.users.findByEmail(email.toLowerCase().trim());
    if (!record) throw new Error('INVALID_CREDENTIALS');

    const valid = await bcrypt.compare(password, record.password_hash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    const { password_hash: _, ...user } = record;
    const token = this.signToken(user.id);
    return { user, token };
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('NOT_FOUND');
    return user;
  }

  private signToken(userId: string): string {
    return jwt.sign({ sub: userId }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
  }
}
