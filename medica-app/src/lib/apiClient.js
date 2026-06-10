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

// ── Mastery ───────────────────────────────────────────────────────────────
export const mastery = {
  overview: () =>
    request('GET', '/api/mastery/overview'),
  weakest: (limit = 10, minAttempts = 1) =>
    request('GET', `/api/mastery/weakest?limit=${limit}&min_attempts=${minAttempts}`),
  strongest: (limit = 10, minAttempts = 1) =>
    request('GET', `/api/mastery/strongest?limit=${limit}&min_attempts=${minAttempts}`),
  concept: (id) =>
    request('GET', `/api/mastery/concept/${id}`),
  adaptivePreview: () =>
    request('GET', '/api/mastery/adaptive-preview'),
  adaptiveFlashcardsPreview: () =>
    request('GET', '/api/mastery/adaptive-flashcards-preview'),
  prescription: () =>
    request('GET', '/api/mastery/prescription'),
  dailyPlan: () =>
    request('GET', '/api/mastery/daily-plan'),
  progress: () =>
    request('GET', '/api/mastery/progress'),
  timeline: () =>
    request('GET', '/api/mastery/timeline'),
  readiness: () =>
    request('GET', '/api/mastery/readiness'),
  topicReadiness: (id) =>
    request('GET', `/api/mastery/readiness/topic/${id}`),
  subjects: () =>
    request('GET', '/api/mastery/subjects'),
  subjectConcepts: (subject) =>
    request('GET', `/api/mastery/subjects/${encodeURIComponent(subject)}/concepts`),

  reviewConcept: (conceptId, result) =>
    request('POST', `/api/mastery/concept/${conceptId}/review`, { result }),

  conceptReviews: (id) =>
    request('GET', `/api/mastery/concept/${id}/reviews`),

  dueReviews: () =>
    request('GET', '/api/mastery/reviews/due'),

  reviewStats: () =>
    request('GET', '/api/mastery/review-stats'),
};

// ── Generate ──────────────────────────────────────────────────────────────
export const generate = {
  flashcards: (count = 10, config = {}) =>
    request('POST', '/api/generate-flashcards', { config: { count, ...config } }),
};

// ── Governance (admin) ────────────────────────────────────────────────────
export const governance = {
  list: ({ status, limit = 50, page = 1, sort } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    params.set('page', String(page));
    if (sort) params.set('sort', sort);
    return request('GET', `/api/generated-question-bank/review?${params}`);
  },
  get: (id) =>
    request('GET', `/api/generated-question-bank/review/${encodeURIComponent(id)}`),
  history: (id) =>
    request('GET', `/api/generated-question-bank/review/${encodeURIComponent(id)}/history`),
  metrics: () =>
    request('GET', '/api/generated-question-bank/metrics'),
  updateStatus: (id, status) =>
    request('PATCH', `/api/generated-question-bank/${encodeURIComponent(id)}/status`, { status }),
};

// ── Token persistence helpers ─────────────────────────────────────────────
const TOKEN_KEY = 'medica_jwt';

export function persistToken(token) {
  _token = token;
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
}

export function clearToken() {
  _token = null;
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function restoreToken() {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) { _token = saved; return saved; }
  } catch { /* ignore */ }
  return null;
}
