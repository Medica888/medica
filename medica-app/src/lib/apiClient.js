const BASE_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

let _authStatus = 'restoring';
let _currentUserId = '';
let _authSnapshot = 'restoring:';
const _authListeners = new Set();

function emitAuthState() {
  const nextSnapshot = `${_authStatus}:${_currentUserId}`;
  if (nextSnapshot === _authSnapshot) return;
  _authSnapshot = nextSnapshot;
  for (const listener of _authListeners) listener();
}

export function setAuthSession(status, userId = '') {
  _authStatus = ['restoring', 'authenticated', 'anonymous'].includes(status)
    ? status
    : 'anonymous';
  _currentUserId = _authStatus === 'authenticated' ? String(userId || '') : '';
  emitAuthState();
}

export function setAuthRestoring() { setAuthSession('restoring'); }
export function setAuthenticated(val) {
  setAuthSession(val ? 'authenticated' : 'anonymous', val ? _currentUserId : '');
}
export function isAuthenticated() { return _authStatus === 'authenticated'; }
// True when the VITE_USE_BACKEND feature flag is on, regardless of auth state.
// Read live on every call (not cached at module load) so callers stay correct
// under test-time env stubbing and don't need their own frozen copy of this check.
export function isBackendEnabled() {
  return import.meta.env.VITE_USE_BACKEND === 'true';
}
// Single source of truth for "should this call attempt the backend": the feature
// flag is on AND the session is authenticated. Used by dataProvider (session/
// flashcard sync) and the QBank catalog — anonymous/local-only users keep using
// the local-only paths.
export function isBackendSyncEnabled() {
  return isBackendEnabled() && isAuthenticated();
}
export function getAuthStatus() { return _authStatus; }
export function setCurrentUserId(id) {
  _currentUserId = id == null ? '' : String(id);
  emitAuthState();
}
export function getCurrentUserId() { return _currentUserId; }
export function getAuthStateSnapshot() { return _authSnapshot; }
export function subscribeAuthState(listener) {
  _authListeners.add(listener);
  return () => _authListeners.delete(listener);
}

const AUTH_FAILURE_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/account',  // wrong-password 401 during account deletion ≠ session expiry
]);

async function request(method, path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json' };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options.signal,
  });

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !AUTH_FAILURE_EXEMPT_PATHS.has(path)) {
      setAuthSession('anonymous');
    }
    throw Object.assign(new Error(data.error ?? 'Request failed'), {
      status: res.status,
      code: data.code,
      data,
    });
  }
  return data;
}

async function streamRequest(path, body, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    signal: options.signal,
  });

  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON upstream failure */ }
    if (res.status === 401 && !AUTH_FAILURE_EXEMPT_PATHS.has(path)) {
      setAuthSession('anonymous');
    }
    throw Object.assign(new Error(data.error ?? 'Request failed'), {
      status: res.status,
      code: data.code,
      data,
    });
  }
  if (!res.body) {
    throw Object.assign(new Error('Streaming response was empty'), { code: 'EMPTY_STREAM' });
  }
  return res;
}

// Auth
export const auth = {
  register: (email, name, password) =>
    request('POST', '/api/auth/register', { email, name, password }),

  login: (email, password) =>
    request('POST', '/api/auth/login', { email, password }),

  me: () => request('GET', '/api/auth/me'),

  logout: () => request('POST', '/api/auth/logout'),

  forgotPassword: (email) =>
    request('POST', '/api/auth/forgot-password', { email }),

  resetPassword: (token, password) =>
    request('POST', '/api/auth/reset-password', { token, password }),

  verifyEmail: (token) =>
    request('POST', '/api/auth/verify-email', { token }),

  resendVerification: () =>
    request('POST', '/api/auth/resend-verification'),

  deleteAccount: (password) =>
    request('DELETE', '/api/auth/account', { password }),
};

// Exams
export const exams = {
  create: (session) => request('POST', '/api/exams', session),

  reserve: (payload, options) => request('POST', '/api/exams/reservations', payload, options),

  list: (page = 1, limit = 20) =>
    request('GET', `/api/exams?page=${page}&limit=${limit}`),

  get: (id) => request('GET', `/api/exams/${id}`),

  delete: (id) => request('DELETE', `/api/exams/${id}`),
};

// Analytics
export const analytics = {
  get: () => request('GET', '/api/analytics'),

  progress: () => request('GET', '/api/analytics/progress'),
};

// Flashcards
export const flashcards = {
  list: () => request('GET', '/api/flashcards'),

  createMany: (cards) => request('POST', '/api/flashcards', { flashcards: cards }),

  updateStatus: (id, status) => request('PATCH', `/api/flashcards/${id}/status`, { status }),

  markReviewed: (id, ease) => request('POST', `/api/flashcards/${id}/review`, ease ? { ease } : undefined),

  clearAll: () => request('DELETE', '/api/flashcards'),
};

// Health
export const health = {
  check: () => request('GET', '/api/health'),
};

// Mastery
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

// Generate
export const generate = {
  skillStream: (payload, options = {}) =>
    streamRequest('/api/generate', payload, options),
  flashcards: (count = 10, config = {}) =>
    request('POST', '/api/generate-flashcards', { config: { count, ...config } }),
  questions: ({ config, exclude } = {}, options = {}) =>
    request('POST', '/api/generate-questions', {
      config,
      ...(exclude ? { exclude } : {}),
    }, options),
};

// Question Reports
export const questionReports = {
  create: (payload) => request('POST', '/api/question-reports', payload),
  getEligibility: () => request('GET', '/api/question-reports/eligibility'),
};

// Governance (admin)
export const governance = {
  list: ({ status, reviewStatus, commercialReady, limit = 50, page = 1, sort } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (reviewStatus) params.set('reviewStatus', reviewStatus);
    if (commercialReady !== undefined) params.set('commercialReady', String(commercialReady));
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
  updateReviewMetadata: (id, metadata) =>
    request('PATCH', `/api/generated-question-bank/${encodeURIComponent(id)}/review-metadata`, metadata),
};

// QBank (backend-driven catalog)
export const qbank = {
  catalog: ({ page = 1, limit = 100, subject, system, difficulty, search } = {}) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (subject) params.set('subject', subject);
    if (system) params.set('system', system);
    if (difficulty) params.set('difficulty', difficulty);
    if (search) params.set('search', search);
    return request('GET', `/api/qbank/catalog?${params}`);
  },
  createSession: (ids) => request('POST', '/api/qbank/sessions', { ids }),
};

// Taxonomy Candidates (admin)
export const taxonomyCandidates = {
  list: ({ status, limit = 100, page = 1 } = {}) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    params.set('page', String(page));
    return request('GET', `/api/taxonomy-candidates?${params}`);
  },
  updateStatus: (id, status, { mappedTo, note } = {}) =>
    request('PATCH', `/api/taxonomy-candidates/${encodeURIComponent(id)}/status`, {
      status,
      ...(mappedTo !== undefined ? { mappedTo } : {}),
      ...(note !== undefined ? { note } : {}),
    }),
};
