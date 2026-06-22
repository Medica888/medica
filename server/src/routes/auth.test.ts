import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';
import { InMemoryUsersRepository } from '../repositories/memory/UsersRepository.js';
import { config } from '../config.js';

const app = createApp();

beforeEach(() => {
  setRepositories(createInMemoryRepositories());
});

describe('POST /api/auth/register', () => {
  it('creates a user and returns token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('test@example.com');
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('returns 409 when email is already taken', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'dupe@example.com',
      name: 'First',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/register').send({
      email: 'dupe@example.com',
      name: 'Second',
      password: 'password456',
    });
    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid payload', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'bad' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in and returns token', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'login@example.com',
      name: 'Login User',
      password: 'mypassword',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'mypassword',
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
  });

  it('returns 401 for wrong password', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'wrong@example.com',
      name: 'User',
      password: 'correct',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'wrong@example.com',
      password: 'wrong',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns profile when authenticated', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'me@example.com',
      name: 'Me User',
      password: 'password123',
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${reg.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
    expect(res.body.user).toHaveProperty('email_verified');
    expect(res.body.user.email_verified).toBe(false);
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('returns 200 with generic message for registered email', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'reset@example.com',
      name: 'Reset User',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If that email');
  });

  it('returns same 200 response for unregistered email (no enumeration)', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If that email');
    expect(res.body).not.toHaveProperty('devToken');
  });

  it('returns devToken when authDevTokensEnabled', async () => {
    vi.spyOn(config, 'authDevTokensEnabled', 'get').mockReturnValue(true);
    await request(app).post('/api/auth/register').send({
      email: 'devtoken@example.com',
      name: 'Dev User',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'devtoken@example.com' });
    expect(res.status).toBe(200);
    expect(typeof res.body.devToken).toBe('string');
    expect(res.body.devToken).toHaveLength(64); // 32 bytes hex
    vi.restoreAllMocks();
  });

  it('returns 400 for invalid email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/reset-password', () => {
  async function getResetToken(email: string): Promise<string> {
    vi.spyOn(config, 'authDevTokensEnabled', 'get').mockReturnValue(true);
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    vi.restoreAllMocks();
    return res.body.devToken as string;
  }

  it('resets password with a valid token, old password no longer works', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'resetme@example.com',
      name: 'User',
      password: 'oldpassword',
    });
    const token = await getResetToken('resetme@example.com');
    const resetRes = await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword1' });
    expect(resetRes.status).toBe(200);

    const loginOld = await request(app).post('/api/auth/login').send({ email: 'resetme@example.com', password: 'oldpassword' });
    expect(loginOld.status).toBe(401);

    const loginNew = await request(app).post('/api/auth/login').send({ email: 'resetme@example.com', password: 'newpassword1' });
    expect(loginNew.status).toBe(200);
  });

  it('returns 400 for invalid token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'invalid-token', password: 'newpassword1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is reused (single-use)', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'singleuse@example.com',
      name: 'User',
      password: 'oldpassword',
    });
    const token = await getResetToken('singleuse@example.com');
    await request(app).post('/api/auth/reset-password').send({ token, password: 'newpassword1' });
    const second = await request(app).post('/api/auth/reset-password').send({ token, password: 'anotherpassword' });
    expect(second.status).toBe(400);
  });

  it('returns 400 for missing password', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'abc' });
    expect(res.status).toBe(400);
  });

  it('using one reset token invalidates all other active reset tokens for the same user', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'multireset@example.com',
      name: 'User',
      password: 'oldpassword',
    });
    const tokenA = await getResetToken('multireset@example.com');
    const tokenB = await getResetToken('multireset@example.com');

    // Use token A — this must also invalidate token B
    const resetA = await request(app).post('/api/auth/reset-password').send({ token: tokenA, password: 'newpassword1' });
    expect(resetA.status).toBe(200);

    const resetB = await request(app).post('/api/auth/reset-password').send({ token: tokenB, password: 'anotherpass1' });
    expect(resetB.status).toBe(400);
  });
});

describe('POST /api/auth/verify-email', () => {
  async function getVerifyToken(authToken: string): Promise<string> {
    vi.spyOn(config, 'authDevTokensEnabled', 'get').mockReturnValue(true);
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${authToken}`);
    vi.restoreAllMocks();
    return res.body.devToken as string;
  }

  it('verifies email with a valid token', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'verify@example.com',
      name: 'User',
      password: 'password123',
    });
    const token = await getVerifyToken(reg.body.token as string);
    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('verified');

    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${reg.body.token}`);
    expect(me.body.user.email_verified).toBe(true);
  });

  it('returns 400 for invalid token', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'bad-token' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when token is reused (single-use)', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'verify2@example.com',
      name: 'User',
      password: 'password123',
    });
    const token = await getVerifyToken(reg.body.token as string);
    await request(app).post('/api/auth/verify-email').send({ token });
    const second = await request(app).post('/api/auth/verify-email').send({ token });
    expect(second.status).toBe(400);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('requires authentication', async () => {
    const res = await request(app).post('/api/auth/resend-verification');
    expect(res.status).toBe(401);
  });

  it('returns devToken when authDevTokensEnabled', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'resend@example.com',
      name: 'User',
      password: 'password123',
    });
    vi.spyOn(config, 'authDevTokensEnabled', 'get').mockReturnValue(true);
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${reg.body.token}`);
    vi.restoreAllMocks();
    expect(res.status).toBe(200);
    expect(typeof res.body.devToken).toBe('string');
  });
});

describe('DELETE /api/auth/account', () => {
  async function registerUser(email: string, password: string) {
    return request(app).post('/api/auth/register').send({
      email,
      name: 'Test User',
      password,
    });
  }

  it('requires authentication', async () => {
    const res = await request(app).delete('/api/auth/account').send({ password: 'pw' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing password body', async () => {
    const reg = await registerUser('delbody@example.com', 'password123');
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for wrong password', async () => {
    const reg = await registerUser('delwrong@example.com', 'correctpass');
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  it('returns 204 and soft-deletes the account on correct password', async () => {
    const reg = await registerUser('delsuccess@example.com', 'password123');
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'password123' });
    expect(res.status).toBe(204);
  });

  it('deleted account cannot log in', async () => {
    const reg = await registerUser('delnoauth@example.com', 'password123');
    await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'password123' });

    const login = await request(app).post('/api/auth/login').send({
      email: 'delnoauth@example.com',
      password: 'password123',
    });
    expect(login.status).toBe(401);
  });

  it('old JWT is rejected after account deletion', async () => {
    const reg = await registerUser('deljwt@example.com', 'password123');
    const oldToken = reg.body.token as string;

    await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ password: 'password123' });

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(me.status).toBe(401);
  });

  it('deleted email stays reserved — re-registration returns 409', async () => {
    const email = 'delreserved@example.com';
    const reg = await registerUser(email, 'password123');
    await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'password123' });

    const reReg = await request(app).post('/api/auth/register').send({
      email,
      name: 'New User',
      password: 'newpassword1',
    });
    expect(reReg.status).toBe(409);
  });

  it('no hard-delete route is exposed', async () => {
    // DELETE /api/auth/account is soft-delete only; no route exists to hard-delete via /api/auth
    const res = await request(app).delete('/api/auth/users/some-id');
    expect(res.status).toBe(404);
  });

  it('second delete attempt returns 401 (requireAuth rejects the stale JWT)', async () => {
    const reg = await registerUser('deldouble@example.com', 'password123');
    await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'password123' });
    const second = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token}`)
      .send({ password: 'password123' });
    expect(second.status).toBe(401);
  });
});

describe('config production guards', () => {
  it('throws if AUTH_DEV_TOKENS_ENABLED=true in production', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      AUTH_DEV_TOKENS_ENABLED: process.env.AUTH_DEV_TOKENS_ENABLED,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.ALLOWED_ORIGINS = 'https://app.medica.com';
      process.env.AUTH_DEV_TOKENS_ENABLED = 'true';
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow(
        'AUTH_DEV_TOKENS_ENABLED must be false in production',
      );
    } finally {
      for (const [key, val] of Object.entries(saved)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
      vi.resetModules();
    }
  });
});

describe('InMemoryUsersRepository.delete', () => {
  it('returns false when called on an already soft-deleted user', async () => {
    const repo = new InMemoryUsersRepository();
    const user = await repo.create({ email: 'soft@example.com', name: 'A', password_hash: 'hash' });
    expect(await repo.delete(user.id)).toBe(true);
    expect(await repo.delete(user.id)).toBe(false);
  });

  it('returns false for a non-existent id', async () => {
    const repo = new InMemoryUsersRepository();
    expect(await repo.delete('00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});
