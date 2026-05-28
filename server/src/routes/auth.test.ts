import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';

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
  });

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
