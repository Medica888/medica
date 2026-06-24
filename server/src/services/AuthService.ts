import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { config } from '../config.js';
import { withTransaction } from '../config/db.js';
import type { IUsersRepository } from '../repositories/interfaces.js';
import type { IAuthTokensRepository } from '../repositories/interfaces.js';
import type { IEmailSender } from '../lib/email.js';
import type { User } from '../types/index.js';

const BCRYPT_ROUNDS = config.nodeEnv === 'test' ? 10 : 12;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;       // 1 hour
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export class AuthService {
  constructor(
    private users: IUsersRepository,
    private authTokens: IAuthTokensRepository,
    private emailSender: IEmailSender,
  ) {}

  async register(email: string, name: string, password: string): Promise<{ user: User; token: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.users.findByEmailIncludingDeleted(normalizedEmail);
    if (existing) throw new Error('EMAIL_TAKEN');

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

    const { password_hash: _, deleted_at: __, ...user } = record;
    const token = this.signToken(user.id);
    return { user, token };
  }

  async getProfile(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('NOT_FOUND');
    return user;
  }

  async requestPasswordReset(email: string): Promise<{ devToken?: string }> {
    this.authTokens.deleteExpired().catch((err: unknown) => console.error('[AuthService] deleteExpired failed:', err));

    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.users.findByEmail(normalizedEmail);

    if (!user) {
      // No enumeration — return same shape as success
      return {};
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await this.authTokens.create({
      userId: user.id,
      tokenHash,
      type: 'password_reset',
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    });

    const resetUrl = `${config.appBaseUrl}/reset-password?token=${rawToken}`;
    try {
      await this.emailSender.send({
        to: user.email,
        subject: 'Reset your Medica password',
        text: `Click the link below to reset your password. This link expires in 1 hour.\n\n${resetUrl}\n\nIf you did not request a password reset, you can ignore this email.`,
      });
    } catch (err) {
      console.error('[AuthService] reset email failed:', err);
    }
    if (config.authDevTokensEnabled) return { devToken: rawToken };
    return {};
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await this.authTokens.findActiveByHash(tokenHash, 'password_reset');
    if (!record) throw new Error('INVALID_OR_EXPIRED_TOKEN');

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await withTransaction(async (tx) => {
      await this.users.updatePasswordHash(record.user_id, password_hash, tx);
      await this.authTokens.markAllActiveUsedForUser(record.user_id, 'password_reset', tx);
    });
  }

  async requestEmailVerification(userId: string): Promise<{ devToken?: string }> {
    this.authTokens.deleteExpired().catch((err: unknown) => console.error('[AuthService] deleteExpired failed:', err));

    const user = await this.users.findById(userId);
    if (!user) throw new Error('NOT_FOUND');

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    await this.authTokens.create({
      userId,
      tokenHash,
      type: 'email_verification',
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    });

    const verifyUrl = `${config.appBaseUrl}/verify-email?token=${rawToken}`;
    await this.emailSender.send({
      to: user.email,
      subject: 'Verify your Medica email address',
      text: `Click the link below to verify your email address.\n\n${verifyUrl}\n\nIf you did not create a Medica account, you can ignore this email.`,
    });
    if (config.authDevTokensEnabled) return { devToken: rawToken };
    return {};
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const record = await this.authTokens.findActiveByHash(tokenHash, 'email_verification');
    if (!record) throw new Error('INVALID_OR_EXPIRED_TOKEN');

    await this.users.setEmailVerified(record.user_id);
    await this.authTokens.markUsed(record.id);
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const record = await this.users.findByIdWithHash(userId);
    if (!record || record.deleted_at !== null) throw new Error('NOT_FOUND');

    const valid = await bcrypt.compare(password, record.password_hash);
    if (!valid) throw new Error('INVALID_CREDENTIALS');

    await this.users.delete(userId);
  }

  private signToken(userId: string): string {
    return jwt.sign({ sub: userId }, config.jwtSecret, {
      expiresIn: config.sessionMaxAgeSeconds,
    });
  }
}
