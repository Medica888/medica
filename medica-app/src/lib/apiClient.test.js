import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAuthToken, getAuthToken, auth, exams, flashcards, health } from './apiClient.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockClear();
  setAuthToken(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockResponse(body, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('setAuthToken / getAuthToken', () => {
  it('stores and retrieves token', () => {
    setAuthToken('abc123');
    expect(getAuthToken()).toBe('abc123');
  });

  it('can be cleared', () => {
    setAuthToken('abc');
    setAuthToken(null);
    expect(getAuthToken()).toBeNull();
  });
});

describe('auth.register', () => {
  it('POSTs to /api/auth/register', async () => {
    mockResponse({ user: { id: '1', email: 'a@b.com' }, token: 'tok' }, 201);
    const result = await auth.register('a@b.com', 'Alice', 'pass1234');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/register'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.token).toBe('tok');
  });
});

describe('auth.login', () => {
  it('POSTs to /api/auth/login', async () => {
    mockResponse({ user: { id: '1' }, token: 'tok' });
    await auth.login('a@b.com', 'pass');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    await expect(auth.login('a@b.com', 'wrong')).rejects.toThrow('Invalid credentials');
  });
});

describe('auth.me', () => {
  it('sends Authorization header when token is set', async () => {
    setAuthToken('mytoken');
    mockResponse({ user: { id: '1' } });
    await auth.me();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBe('Bearer mytoken');
  });
});

describe('exams.create', () => {
  it('POSTs session to /api/exams', async () => {
    setAuthToken('tok');
    mockResponse({ session: { id: 'sess1' } }, 201);
    const result = await exams.create({ mode: 'practice' });
    expect(result.session.id).toBe('sess1');
  });
});

describe('flashcards.createMany', () => {
  it('wraps cards in flashcards key', async () => {
    setAuthToken('tok');
    mockResponse({ flashcards: [] }, 201);
    await flashcards.createMany([{ front: 'Q', back: 'A' }]);
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const [, opts] = lastCall;
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('flashcards');
  });
});

describe('health.check', () => {
  it('returns status ok', async () => {
    mockResponse({ status: 'ok', timestamp: '2024-01-01T00:00:00.000Z' });
    const result = await health.check();
    expect(result.status).toBe('ok');
  });
});

describe('auth.forgotPassword', () => {
  it('POSTs to /api/auth/forgot-password', async () => {
    mockResponse({ message: 'If that email is registered, you will receive a reset link' });
    await auth.forgotPassword('a@b.com');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/forgot-password'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('auth.resetPassword', () => {
  it('POSTs to /api/auth/reset-password', async () => {
    mockResponse({ message: 'Password updated successfully' });
    await auth.resetPassword('rawtoken', 'newpassword');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/reset-password'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('auth.verifyEmail', () => {
  it('POSTs to /api/auth/verify-email', async () => {
    mockResponse({ message: 'Email verified successfully' });
    await auth.verifyEmail('rawtoken');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/verify-email'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('auth.resendVerification', () => {
  it('POSTs to /api/auth/resend-verification', async () => {
    setAuthToken('tok');
    mockResponse({ message: 'Verification email sent' });
    await auth.resendVerification();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/resend-verification'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
