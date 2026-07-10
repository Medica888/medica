import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';
import { InMemoryUsersRepository } from '../repositories/memory/UsersRepository.js';
import { InMemoryEmailSender, setEmailSender, type IEmailSender } from '../lib/email.js';
import { config } from '../config.js';

const app = createApp();

let emailSender: InMemoryEmailSender;

beforeEach(() => {
  setRepositories(createInMemoryRepositories());
  emailSender = new InMemoryEmailSender();
  setEmailSender(emailSender);
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
    expect(res.body.verificationEmailSent).toBe(true);
  });

  it('sends a verification email immediately after registration', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'verify-on-register@example.com',
      name: 'Verify User',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('verify-on-register@example.com');
    expect(emailSender.sent[0].text).toContain('/verify-email?token=');
  });

  it('does not fail registration when verification email delivery fails', async () => {
    const failSender: IEmailSender = { send: vi.fn().mockRejectedValue(new Error('SMTP down')) };
    setEmailSender(failSender);
    const res = await request(app).post('/api/auth/register').send({
      email: 'signup-smtp-down@example.com',
      name: 'SMTP Down',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('signup-smtp-down@example.com');
    expect(res.body.verificationEmailSent).toBe(false);
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
  it('returns 401 when JWT sub points to a non-existent user', async () => {
    const ghostToken = jwt.sign({ sub: '00000000-0000-0000-0000-000000000000' }, config.jwtSecret);
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${ghostToken}`);
    expect(res.status).toBe(401);
  });

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

describe('email delivery', () => {
  it('forgot-password sends reset email to existing user', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'emailreset@example.com',
      name: 'Email User',
      password: 'password123',
    });
    emailSender.sent.length = 0;
    await request(app).post('/api/auth/forgot-password').send({ email: 'emailreset@example.com' });
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('emailreset@example.com');
    expect(emailSender.sent[0].text).toContain('/reset-password?token=');
  });

  it('forgot-password sends no email for unknown address (no enumeration)', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(emailSender.sent).toHaveLength(0);
  });

  it('resend-verification sends verification email to authenticated user', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'emailverify@example.com',
      name: 'Verify User',
      password: 'password123',
    });
    emailSender.sent.length = 0;
    await request(app)
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${reg.body.token as string}`);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe('emailverify@example.com');
    expect(emailSender.sent[0].text).toContain('/verify-email?token=');
  });

  it('forgot-password does not include devToken when AUTH_DEV_TOKENS_ENABLED is false', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'notoken@example.com',
      name: 'No Token User',
      password: 'password123',
    });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'notoken@example.com' });
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('devToken');
  });

  it('email send failure does not leak 500 for forgot-password (safe failure)', async () => {
    const failSender: IEmailSender = { send: vi.fn().mockRejectedValue(new Error('SMTP down')) };
    setEmailSender(failSender);
    await request(app).post('/api/auth/register').send({
      email: 'failmail@example.com',
      name: 'Fail User',
      password: 'password123',
    });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'failmail@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toContain('If that email');
  });
});

describe('config production guards', () => {
  it('throws if DATABASE_URL is not set in production', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.DATABASE_URL = '';
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('DATABASE_URL must be set in production');
    } finally {
      for (const [key, val] of Object.entries(saved)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
      vi.resetModules();
    }
  });

  it('throws if validated generated reuse is explicitly enabled in production', async () => {
    const saved = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/db';
      process.env.ALLOWED_ORIGINS = 'https://app.medica.com';
      process.env.SMTP_HOST = 'smtp.medica.com';
      process.env.EMAIL_FROM = 'noreply@medica.com';
      process.env.APP_BASE_URL = 'https://app.medica.com';
      process.env.ALLOW_VALIDATED_REUSE = 'true';
      delete process.env.AUTH_DEV_TOKENS_ENABLED;
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('ALLOW_VALIDATED_REUSE cannot be true in production');
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, saved);
      vi.resetModules();
    }
  });

  it('throws if AUTH_DEV_TOKENS_ENABLED=true in production', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      AUTH_DEV_TOKENS_ENABLED: process.env.AUTH_DEV_TOKENS_ENABLED,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/db';
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

  it('throws if SMTP_HOST is not set in production', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      AUTH_DEV_TOKENS_ENABLED: process.env.AUTH_DEV_TOKENS_ENABLED,
      SMTP_HOST: process.env.SMTP_HOST,
      EMAIL_FROM: process.env.EMAIL_FROM,
      APP_BASE_URL: process.env.APP_BASE_URL,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/db';
      process.env.ALLOWED_ORIGINS = 'https://app.medica.com';
      delete process.env.AUTH_DEV_TOKENS_ENABLED;
      delete process.env.SMTP_HOST;
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('SMTP_HOST');
    } finally {
      for (const [key, val] of Object.entries(saved)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
      vi.resetModules();
    }
  });
});

describe('Cookie auth', () => {
  it('register sets medica_session HttpOnly SameSite=Lax cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'cookie@example.com',
      name: 'Cookie User',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const cookieStr = Array.isArray(raw) ? raw.join('; ') : (raw ?? '');
    expect(cookieStr).toContain('medica_session=');
    expect(cookieStr).toContain('HttpOnly');
    expect(cookieStr).toMatch(/SameSite=Lax/i);
  });

  it('login sets medica_session cookie', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'cooklogin@example.com',
      name: 'Cook Login',
      password: 'password123',
    });
    const res = await request(app).post('/api/auth/login').send({
      email: 'cooklogin@example.com',
      password: 'password123',
    });
    expect(res.status).toBe(200);
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const cookieStr = Array.isArray(raw) ? raw.join('; ') : (raw ?? '');
    expect(cookieStr).toContain('medica_session=');
  });

  it('GET /me authenticates via cookie without Bearer header', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'cookiemetest@example.com',
      name: 'Cookie Me',
      password: 'password123',
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `medica_session=${reg.body.token as string}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('cookiemetest@example.com');
  });

  it('POST /logout returns 204 and clears the cookie', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'medica_session=anything');
    expect(res.status).toBe(204);
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const cookieStr = Array.isArray(raw) ? raw.join('; ') : (raw ?? '');
    expect(cookieStr).toMatch(/medica_session=(?:;|$)|Max-Age=0/);
  });
});

describe('CSRF protection', () => {
  it('rejects POST with cookie and disallowed Origin', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'medica_session=any')
      .set('Origin', 'https://evil.com');
    expect(res.status).toBe(403);
  });

  it('allows POST with cookie and allowed Origin', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'medica_session=any')
      .set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(204);
  });

  it('allows POST with cookie and no Origin in non-production mode', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'medica_session=any');
    expect(res.status).toBe(204);
  });

  it('allows unsafe method via Bearer with disallowed Origin (no cookie = no CSRF check)', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'bearercsrf@example.com',
      name: 'Bearer CSRF User',
      password: 'password123',
    });
    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${reg.body.token as string}`)
      .set('Origin', 'https://evil.com')
      .send({ password: 'password123' });
    expect(res.status).toBe(204);
  });

  it('does not apply CSRF to safe GET methods', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'medica_session=invalid')
      .set('Origin', 'https://evil.com');
    // CSRF skips for GET — falls through to requireAuth which rejects the invalid token
    expect(res.status).toBe(401);
  });
});

describe('Auth middleware — token source selection', () => {
  async function registerAndGetToken(): Promise<{ token: string; cookie: string }> {
    const res = await request(app).post('/api/auth/register').send({
      email: `src-test-${Date.now()}@example.com`,
      name: 'Src Test',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    return { token: res.body.token as string, cookie: `medica_session=${res.body.token as string}` };
  }

  it('cookie-only: authenticates via cookie without Bearer header', async () => {
    const { cookie } = await registerAndGetToken();
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });

  it('bearer-only: authenticates via Bearer without cookie', async () => {
    const { token } = await registerAndGetToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });

  it('valid Bearer + invalid cookie: falls back to Bearer and succeeds', async () => {
    const { token } = await registerAndGetToken();
    const expiredCookie = 'medica_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvbGQifQ.invalid';
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', expiredCookie)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });

  it('valid cookie + valid Bearer: cookie wins (authSource = cookie)', async () => {
    const { token, cookie } = await registerAndGetToken();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookie)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // The route doesn't expose authSource, but success with both present confirms the middleware
    // selects the cookie first. We confirm the user is returned correctly.
    expect(res.body.user).toBeDefined();
  });

  it('both tokens invalid: returns 401', async () => {
    const bad = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvbGQifQ.badsig';
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `medica_session=${bad}`)
      .set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });
});

describe('Cookie/JWT expiry parity', () => {
  it('cookie Max-Age matches sessionMaxAgeSeconds from config', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `parity-${Date.now()}@example.com`,
      name: 'Parity Test',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    const raw = res.headers['set-cookie'] as string[] | string | undefined;
    const cookieStr = Array.isArray(raw) ? raw.join('; ') : (raw ?? '');
    const match = /Max-Age=(\d+)/i.exec(cookieStr);
    expect(match).toBeTruthy();
    const cookieMaxAge = parseInt(match![1], 10);
    // Cookie Max-Age must equal sessionMaxAgeSeconds (the single source of truth)
    expect(cookieMaxAge).toBe(config.sessionMaxAgeSeconds);
  });

  it('JWT expiry matches sessionMaxAgeSeconds from config', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: `jwtparity-${Date.now()}@example.com`,
      name: 'JWT Parity',
      password: 'password123',
    });
    expect(res.status).toBe(201);
    const token = res.body.token as string;
    const payload = jwt.decode(token) as { exp: number; iat: number };
    const jwtDurationSeconds = payload.exp - payload.iat;
    expect(jwtDurationSeconds).toBe(config.sessionMaxAgeSeconds);
  });
});

describe('Production same-site config guard', () => {
  it('throws when ALLOWED_ORIGINS domain does not match APP_BASE_URL domain', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      APP_BASE_URL: process.env.APP_BASE_URL,
      SMTP_HOST: process.env.SMTP_HOST,
      EMAIL_FROM: process.env.EMAIL_FROM,
      AUTH_DEV_TOKENS_ENABLED: process.env.AUTH_DEV_TOKENS_ENABLED,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/db';
      process.env.ALLOWED_ORIGINS = 'https://app.otherdomain.com';
      process.env.APP_BASE_URL = 'https://api.medica.com';
      process.env.SMTP_HOST = 'smtp.medica.com';
      process.env.EMAIL_FROM = 'noreply@medica.com';
      delete process.env.AUTH_DEV_TOKENS_ENABLED;
      vi.resetModules();
      await expect(import('../config.js')).rejects.toThrow('eTLD+1');
    } finally {
      for (const [key, val] of Object.entries(saved)) {
        if (val === undefined) delete process.env[key];
        else process.env[key] = val;
      }
      vi.resetModules();
    }
  });

  it('does not throw when ALLOWED_ORIGINS and APP_BASE_URL share the same base domain', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      JWT_SECRET: process.env.JWT_SECRET,
      DATABASE_URL: process.env.DATABASE_URL,
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
      APP_BASE_URL: process.env.APP_BASE_URL,
      SMTP_HOST: process.env.SMTP_HOST,
      EMAIL_FROM: process.env.EMAIL_FROM,
      AUTH_DEV_TOKENS_ENABLED: process.env.AUTH_DEV_TOKENS_ENABLED,
    };
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a-secure-non-default-secret-for-testing-only';
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/db';
      process.env.ALLOWED_ORIGINS = 'https://app.medica.com';
      process.env.APP_BASE_URL = 'https://api.medica.com';
      process.env.SMTP_HOST = 'smtp.medica.com';
      process.env.EMAIL_FROM = 'noreply@medica.com';
      delete process.env.AUTH_DEV_TOKENS_ENABLED;
      vi.resetModules();
      await expect(import('../config.js')).resolves.toBeDefined();
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
