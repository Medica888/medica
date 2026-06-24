import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setAuthenticated,
  isAuthenticated,
  setCurrentUserId,
  getCurrentUserId,
  setAuthRestoring,
  setAuthSession,
  getAuthStateSnapshot,
  subscribeAuthState,
  auth,
  exams,
  flashcards,
  generate,
  health,
} from './apiClient.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockClear();
  setAuthenticated(false);
  setCurrentUserId('');
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

describe('setAuthenticated / isAuthenticated', () => {
  it('stores and retrieves authentication state', () => {
    setAuthenticated(true);
    expect(isAuthenticated()).toBe(true);
  });

  it('can be cleared', () => {
    setAuthenticated(true);
    setAuthenticated(false);
    expect(isAuthenticated()).toBe(false);
  });

  it('publishes atomic restore, account, and logout snapshots', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAuthState(listener);

    setAuthRestoring();
    expect(getAuthStateSnapshot()).toBe('restoring:');

    setAuthSession('authenticated', 'user-1');
    expect(getAuthStateSnapshot()).toBe('authenticated:user-1');

    setAuthSession('anonymous');
    expect(getAuthStateSnapshot()).toBe('anonymous:');
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
  });
});

describe('setCurrentUserId / getCurrentUserId', () => {
  it('stores and retrieves user id', () => {
    setCurrentUserId('user-abc');
    expect(getCurrentUserId()).toBe('user-abc');
  });

  it('can be cleared', () => {
    setCurrentUserId('user-abc');
    setCurrentUserId('');
    expect(getCurrentUserId()).toBe('');
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
    setAuthSession('authenticated', 'existing-user');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    });
    await expect(auth.login('a@b.com', 'wrong')).rejects.toThrow('Invalid credentials');
    expect(getAuthStateSnapshot()).toBe('authenticated:existing-user');
  });
});

describe('protected request session expiry', () => {
  it('clears authenticated state when a protected endpoint returns 401', async () => {
    setAuthSession('authenticated', 'user-1');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Session expired' }),
    });

    await expect(exams.list()).rejects.toMatchObject({ status: 401 });
    expect(getAuthStateSnapshot()).toBe('anonymous:');
  });

  it('preserves stable backend error codes for user-facing handling', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Too many requests', code: 'RATE_LIMITED' }),
    });

    await expect(exams.list()).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });
});

describe('auth.deleteAccount — account 401 is not session expiry', () => {
  it('does not clear session when /api/auth/account returns 401 (wrong password)', async () => {
    setAuthSession('authenticated', 'user-1');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid password' }),
    });

    await expect(auth.deleteAccount('wrong-password')).rejects.toThrow('Invalid password');
    // Session must remain — wrong deletion password ≠ session expiry
    expect(getAuthStateSnapshot()).toBe('authenticated:user-1');
  });
});

describe('auth.me', () => {
  it('sends credentials: include on every request', async () => {
    mockResponse({ user: { id: '1' } });
    await auth.me();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.credentials).toBe('include');
  });

  it('does not set Authorization header', async () => {
    mockResponse({ user: { id: '1' } });
    await auth.me();
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['Authorization']).toBeUndefined();
  });
});

describe('auth.logout', () => {
  it('POSTs to /api/auth/logout', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => null });
    await auth.logout();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('exams.create', () => {
  it('POSTs session to /api/exams', async () => {
    mockResponse({ session: { id: 'sess1' } }, 201);
    const result = await exams.create({ mode: 'practice' });
    expect(result.session.id).toBe('sess1');
  });
});

describe('flashcards.createMany', () => {
  it('wraps cards in flashcards key', async () => {
    mockResponse({ flashcards: [] }, 201);
    await flashcards.createMany([{ front: 'Q', back: 'A' }]);
    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    const [, opts] = lastCall;
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty('flashcards');
  });
});

describe('generate.skillStream', () => {
  it('uses the central backend URL, credentials, and abort signal', async () => {
    const signal = new AbortController().signal;
    const body = { getReader: vi.fn() };
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, body });

    const response = await generate.skillStream(
      { skillId: 'medical-writer', guide: 'Explain preload' },
      { signal },
    );

    expect(response.body).toBe(body);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/generate'),
      expect.objectContaining({ credentials: 'include', signal }),
    );
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
    mockResponse({ message: 'Verification email sent' });
    await auth.resendVerification();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/resend-verification'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
