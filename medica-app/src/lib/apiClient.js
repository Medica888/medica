const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

let _token = null;

export function setAuthToken(token) {
  _token = token;
}

export function getAuthToken() {
  return _token;
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'Request failed'), { status: res.status, data });
  return data;
}

// ── Auth ──────────────────────────────────────────────────────────────────
export const auth = {
  register: (email, name, password) =>
    request('POST', '/api/auth/register', { email, name, password }),

  login: (email, password) =>
    request('POST', '/api/auth/login', { email, password }),

  me: () => request('GET', '/api/auth/me'),
};

// ── Exams ─────────────────────────────────────────────────────────────────
export const exams = {
  create: (session) => request('POST', '/api/exams', session),

  list: (page = 1, limit = 20) =>
    request('GET', `/api/exams?page=${page}&limit=${limit}`),

  get: (id) => request('GET', `/api/exams/${id}`),

  delete: (id) => request('DELETE', `/api/exams/${id}`),
};

// ── Analytics ─────────────────────────────────────────────────────────────
export const analytics = {
  get: () => request('GET', '/api/analytics'),

  progress: () => request('GET', '/api/analytics/progress'),
};

// ── Flashcards ────────────────────────────────────────────────────────────
export const flashcards = {
  list: () => request('GET', '/api/flashcards'),

  createMany: (cards) => request('POST', '/api/flashcards', { flashcards: cards }),

  updateStatus: (id, status) => request('PATCH', `/api/flashcards/${id}/status`, { status }),

  markReviewed: (id) => request('POST', `/api/flashcards/${id}/review`),

  clearAll: () => request('DELETE', '/api/flashcards'),
};

// ── Health ────────────────────────────────────────────────────────────────
export const health = {
  check: () => request('GET', '/api/health'),
};
