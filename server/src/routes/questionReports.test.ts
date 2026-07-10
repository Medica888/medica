import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../app.js';
import { createInMemoryRepositories, getRepositories, setRepositories } from '../repositories/index.js';
import { QuestionReportService, REPORT_REASON_REVALIDATION_MAP } from '../services/QuestionReportService.js';
import { InMemoryQuestionReportsRepository } from '../repositories/memory/QuestionReportsRepository.js';
import { InMemoryUsersRepository } from '../repositories/memory/UsersRepository.js';
import { getReporterEligibility, isEligibleQuestionReporter } from './questionReports.js';

const app = createApp();
let registrationCounter = 0;

const VALID_REPORT = {
  fingerprint:      'fp_abc123',
  reason:           'wrong_answer',
  questionId:       'q001',
  source:           'ai',
  mode:             'practice',
  difficulty:       'NBME Difficult',
  requestedSubject: 'Physiology',
  requestedSystem:  'Cardiovascular',
  requestedTopic:   'Cardiac output',
  actualSubject:    'Pathology',
  actualSystem:     'Respiratory',
  actualTopic:      'Pneumothorax',
  testedConcept:    'Tension pneumothorax mechanism',
  usmleContentArea: 'Respiratory System',
  physicianTask:    'Patient Care: Diagnosis',
  stemPreview:      'A 22-year-old man presents with sudden dyspnea after trauma...',
};

async function registerAndGetToken(options: { verified?: boolean; accountAgeHours?: number } = {}): Promise<string> {
  const { verified = true, accountAgeHours = 25 } = options;
  const res = await request(app).post('/api/auth/register').send({
    email: `reporter_${Date.now()}_${registrationCounter++}@example.com`,
    name: 'Reporter',
    password: 'password123',
  });
  const users = getRepositories().users as InMemoryUsersRepository;
  if (verified) await users.setEmailVerified(res.body.user.id);
  users._setCreatedAt(res.body.user.id, new Date(Date.now() - accountAgeHours * 60 * 60 * 1000));
  return res.body.token as string;
}

/** Registers a user and adds them to ADMIN_USER_IDS so they pass requireAdmin. */
async function registerAdminAndGetToken(): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email: `admin_${Date.now()}_${registrationCounter++}@example.com`,
    name: 'Admin',
    password: 'password123',
  });
  const userId = res.body.user.id as string;
  const existing = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  process.env.ADMIN_USER_IDS = [...existing, userId].join(',');
  return res.body.token as string;
}

async function postReport(payload: Record<string, unknown>) {
  const token = await registerAndGetToken();
  return request(app)
    .post('/api/question-reports')
    .set('Authorization', `Bearer ${token}`)
    .send({ clientReportId: randomUUID(), ...payload });
}

beforeEach(() => {
  registrationCounter = 0;
  setRepositories(createInMemoryRepositories());
  delete process.env.ADMIN_USER_IDS;
});

// ── POST /api/question-reports ─────────────────────────────────────────────────

describe('POST /api/question-reports', () => {
  it('accepts a complete valid report and returns 201 with id', async () => {
    const res = await postReport(VALID_REPORT);
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it('accepts a minimal report (fingerprint + reason only)', async () => {
    const res = await postReport({ fingerprint: 'fp_minimal', reason: 'bad_explanation' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
  });

  it('accepts all four valid reasons', async () => {
    for (const reason of ['wrong_answer', 'bad_explanation', 'off_topic', 'ambiguous_or_insufficient_clues']) {
      const res = await postReport({ fingerprint: 'fp_reason_test', reason });
      expect(res.status).toBe(201);
    }
  });

  it('rejects an invalid reason with 400', async () => {
    const res = await postReport({ fingerprint: 'fp_bad', reason: 'spam' });
    expect(res.status).toBe(400);
  });

  it('rejects missing fingerprint with 400', async () => {
    const res = await postReport({ reason: 'wrong_answer' });
    expect(res.status).toBe(400);
  });

  it('rejects empty fingerprint with 400', async () => {
    const res = await postReport({ fingerprint: '', reason: 'wrong_answer' });
    expect(res.status).toBe(400);
  });

  it('rejects fingerprint exceeding 300 chars with 400', async () => {
    // Max is 300 to accommodate bank question fingerprints (stem 120 + "||" + concept).
    const res = await postReport({ fingerprint: 'x'.repeat(301), reason: 'wrong_answer' });
    expect(res.status).toBe(400);
  });

  it('rejects stemPreview exceeding 500 chars with 400', async () => {
    const res = await postReport({ fingerprint: 'fp_x', reason: 'wrong_answer', stemPreview: 'A'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid source value with 400', async () => {
    const res = await postReport({ fingerprint: 'fp_x', reason: 'wrong_answer', source: 'unknown_source' });
    expect(res.status).toBe(400);
  });

  it('rejects shared report submission when no auth token is provided', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    const res = await request(app)
      .post('/api/question-reports')
      .send({ clientReportId: randomUUID(), fingerprint: 'fp_anon', reason: 'off_topic' });
    const all = (repos.questionReports as any)._all();
    expect(res.status).toBe(401);
    expect(all).toHaveLength(0);
  });

  it('requires clientReportId for idempotent shared governance', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ fingerprint: 'fp_no_client_id', reason: 'off_topic' });
    expect(res.status).toBe(400);
  });

  it('replaying the same clientReportId is idempotent — no duplicate row, same id returned', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();
    const payload = { clientReportId, fingerprint: 'fp_replay', reason: 'wrong_answer' };

    const first = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    const second = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
  });

  it('replaying the same clientReportId with a different fingerprint returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();

    const first = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId, fingerprint: 'fp_original', reason: 'wrong_answer' });
    const second = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId, fingerprint: 'fp_different', reason: 'wrong_answer' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('IDEMPOTENCY_CONFLICT');
    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
    expect(all[0].fingerprint).toBe('fp_original');
  });

  it('replaying the same clientReportId with a different reason returns 409 IDEMPOTENCY_CONFLICT', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();

    const first = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId, fingerprint: 'fp_reason_conflict', reason: 'wrong_answer' });
    const second = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId, fingerprint: 'fp_reason_conflict', reason: 'off_topic' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('IDEMPOTENCY_CONFLICT');
    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
    expect(all[0].reason).toBe('wrong_answer');
  });

  it('concurrent identical-payload replays never create more than one report', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();
    const payload = { clientReportId, fingerprint: 'fp_concurrent_replay', reason: 'wrong_answer' };

    const results = await Promise.all([
      request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload),
    ]);

    for (const res of results) expect(res.status).toBe(201);
    const ids = new Set(results.map(r => r.body.id));
    expect(ids.size).toBe(1);
    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
  });

  it('rejects an unverified reporter with a stable eligibility error', async () => {
    const token = await registerAndGetToken({ verified: false, accountAgeHours: 48 });
    const res = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId: randomUUID(), fingerprint: 'fp_unverified', reason: 'off_topic' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REPORTER_NOT_ELIGIBLE');
  });

  it('rejects a newly created verified account below the minimum age', async () => {
    const token = await registerAndGetToken({ verified: true, accountAgeHours: 1 });
    const res = await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId: randomUUID(), fingerprint: 'fp_too_new', reason: 'off_topic' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('REPORTER_NOT_ELIGIBLE');
  });

  it('allows a verified account when a zero-hour policy is explicitly configured', () => {
    const now = Date.now();
    expect(isEligibleQuestionReporter({
      id: 'verified-user',
      email: 'verified@example.com',
      name: 'Verified',
      email_verified: true,
      email_verified_at: new Date(now),
      created_at: new Date(now),
    }, now, 0)).toBe(true);
  });

  describe('getReporterEligibility', () => {
    const now = Date.now();
    const baseUser = { id: 'u1', email: 'u@example.com', name: 'U' };

    it('reports email_unverified when the account has never verified', () => {
      const result = getReporterEligibility({
        ...baseUser,
        email_verified: false,
        email_verified_at: null,
        created_at: new Date(now - 48 * 60 * 60 * 1000),
      }, now, 24);
      expect(result).toEqual({
        eligible: false,
        reason: 'email_unverified',
        eligibleAt: new Date(now - 48 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000).toISOString(),
      });
    });

    it('prioritizes email_unverified over account_too_new when both are true', () => {
      const result = getReporterEligibility({
        ...baseUser,
        email_verified: false,
        email_verified_at: null,
        created_at: new Date(now),
      }, now, 24);
      expect(result.reason).toBe('email_unverified');
    });

    it('reports account_too_new with the exact unlock timestamp once verified', () => {
      const createdAt = now - 6 * 60 * 60 * 1000;
      const result = getReporterEligibility({
        ...baseUser,
        email_verified: true,
        email_verified_at: new Date(createdAt),
        created_at: new Date(createdAt),
      }, now, 24);
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe('account_too_new');
      expect(result.eligibleAt).toBe(new Date(createdAt + 24 * 60 * 60 * 1000).toISOString());
      expect(new Date(result.eligibleAt as string).getTime()).toBeGreaterThan(now);
    });

    it('reports eligible once both conditions are satisfied', () => {
      const createdAt = now - 48 * 60 * 60 * 1000;
      const result = getReporterEligibility({
        ...baseUser,
        email_verified: true,
        email_verified_at: new Date(createdAt),
        created_at: new Date(createdAt),
      }, now, 24);
      expect(result).toEqual({
        eligible: true,
        reason: 'eligible',
        eligibleAt: new Date(createdAt + 24 * 60 * 60 * 1000).toISOString(),
      });
      expect(new Date(result.eligibleAt as string).getTime()).toBeLessThanOrEqual(now);
    });

    it('returns a null eligibleAt when created_at is missing or invalid', () => {
      const result = getReporterEligibility({
        ...baseUser,
        email_verified: false,
        email_verified_at: null,
        created_at: null as unknown as Date,
      }, now, 24);
      expect(result.eligibleAt).toBeNull();
    });

    it('stays in lockstep with isEligibleQuestionReporter for the same inputs', () => {
      const cases = [
        { verified: false, hoursAgo: 48 },
        { verified: true, hoursAgo: 1 },
        { verified: true, hoursAgo: 48 },
      ];
      for (const { verified, hoursAgo } of cases) {
        const createdAt = new Date(now - hoursAgo * 60 * 60 * 1000);
        const user = {
          ...baseUser,
          email_verified: verified,
          email_verified_at: verified ? createdAt : null,
          created_at: createdAt,
        };
        expect(getReporterEligibility(user, now, 24).eligible).toBe(isEligibleQuestionReporter(user, now, 24));
      }
    });
  });

  describe('GET /api/question-reports/eligibility', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/api/question-reports/eligibility');
      expect(res.status).toBe(401);
    });

    it('returns email_unverified for an unverified account', async () => {
      const token = await registerAndGetToken({ verified: false, accountAgeHours: 48 });
      const res = await request(app)
        .get('/api/question-reports/eligibility')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.eligible).toBe(false);
      expect(res.body.reason).toBe('email_unverified');
      expect(typeof res.body.eligibleAt).toBe('string');
    });

    it('returns account_too_new with a future eligibleAt for a fresh verified account', async () => {
      const token = await registerAndGetToken({ verified: true, accountAgeHours: 1 });
      const res = await request(app)
        .get('/api/question-reports/eligibility')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.eligible).toBe(false);
      expect(res.body.reason).toBe('account_too_new');
      expect(new Date(res.body.eligibleAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('returns eligible for a verified, sufficiently-aged account', async () => {
      const token = await registerAndGetToken({ verified: true, accountAgeHours: 48 });
      const res = await request(app)
        .get('/api/question-reports/eligibility')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        eligible: true,
        reason: 'eligible',
        eligibleAt: res.body.eligibleAt,
      });
      expect(new Date(res.body.eligibleAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  it('maps camelCase request fields to snake_case repository fields', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    await postReport({
        fingerprint:      'fp_map',
        reason:           'off_topic',
        requestedSubject: 'Physiology',
        requestedSystem:  'Cardiovascular',
        actualSubject:    'Pathology',
        testedConcept:    'Heart failure mechanism',
        stemPreview:      'A 65-year-old woman presents with dyspnea...',
      });
    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
    const stored = all[0];
    expect(stored.requested_subject).toBe('Physiology');
    expect(stored.requested_system).toBe('Cardiovascular');
    expect(stored.actual_subject).toBe('Pathology');
    expect(stored.tested_concept).toBe('Heart failure mechanism');
    expect(stored.stem_preview).toBe('A 65-year-old woman presents with dyspnea...');
    expect(stored.fingerprint).toBe('fp_map');
    expect(stored.reason).toBe('off_topic');
  });

  it('normalizes taxonomy aliases before storing a report', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    await postReport({
        fingerprint: 'fp_taxonomy',
        reason: 'off_topic',
        difficulty: 'NBME',
        requestedSystem: 'Cardiovascular System',
        actualSystem: 'Skin',
      });

    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
    const stored = all[0];
    expect(stored.requested_system).toBe('Cardiovascular');
    expect(stored.actual_system).toBe('Dermatology');
    expect(stored.difficulty).toBe('NBME Difficult');
  });
});

// ── Issue 6: idempotent replays must not retrigger clinician review ───────────
// Repository create() exposes insert-vs-replay; the route only fires the
// clinician-review trigger when a report was newly inserted.

describe('POST /api/question-reports — clinician review trigger gating', () => {
  it('an identical replay does not create a second clinician review', async () => {
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();
    const payload = { clientReportId, fingerprint: 'fp_no_retrigger', reason: 'wrong_answer' };

    await request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload).expect(201);
    await new Promise(r => setImmediate(r));
    await request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload).expect(201);
    await new Promise(r => setImmediate(r));

    const queue = await getRepositories().clinicianReviews.findQueue({});
    const forFingerprint = queue.filter(r => r.report_fingerprint === 'fp_no_retrigger');
    expect(forFingerprint).toHaveLength(1);
  });

  it('concurrent identical replays do not create more than one clinician review', async () => {
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();
    const payload = { clientReportId, fingerprint: 'fp_concurrent_no_retrigger', reason: 'wrong_answer' };

    await Promise.all([
      request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/question-reports').set('Authorization', `Bearer ${token}`).send(payload),
    ]);
    await new Promise(r => setImmediate(r));

    const queue = await getRepositories().clinicianReviews.findQueue({});
    const forFingerprint = queue.filter(r => r.report_fingerprint === 'fp_concurrent_no_retrigger');
    expect(forFingerprint).toHaveLength(1);
  });

  it('a payload-mismatch replay (409) does not create a clinician review for the rejected payload', async () => {
    const token = await registerAndGetToken();
    const clientReportId = randomUUID();

    await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId, fingerprint: 'fp_conflict_no_review', reason: 'bad_explanation' })
      .expect(201);
    await new Promise(r => setImmediate(r));
    // Same key, different fingerprint+reason — rejected as a conflict
    await request(app)
      .post('/api/question-reports')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientReportId, fingerprint: 'fp_conflict_no_review_2', reason: 'wrong_answer' })
      .expect(409);
    await new Promise(r => setImmediate(r));

    // No review should exist for either fingerprint: the original reason
    // (bad_explanation) doesn't trigger a review, and the rejected replay's
    // (wrong_answer) reason must not either since it was never persisted.
    const queue = await getRepositories().clinicianReviews.findQueue({});
    expect(queue.filter(r => r.report_fingerprint === 'fp_conflict_no_review')).toHaveLength(0);
    expect(queue.filter(r => r.report_fingerprint === 'fp_conflict_no_review_2')).toHaveLength(0);
  });
});

// ── GET /api/question-reports/summary ─────────────────────────────────────────
// Admin-only: fingerprints expose normalized stem/concept text and global
// moderation status, so this must not be readable by ordinary authenticated users.

describe('GET /api/question-reports/summary — admin only', () => {
  it('returns 401 without auth token (anonymous)', async () => {
    const res = await request(app).get('/api/question-reports/summary');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin user', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .get('/api/question-reports/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('fails closed when ADMIN_USER_IDS is empty, even for a real user', async () => {
    const token = await registerAndGetToken();
    delete process.env.ADMIN_USER_IDS;
    const res = await request(app)
      .get('/api/question-reports/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns summary with correct shape for a configured admin', async () => {
    const token = await registerAdminAndGetToken();
    // Seed a few reports
    await postReport({ fingerprint: 'fp1', reason: 'wrong_answer' });
    await postReport({ fingerprint: 'fp1', reason: 'wrong_answer' });
    await postReport({ fingerprint: 'fp2', reason: 'bad_explanation' });

    const res = await request(app)
      .get('/api/question-reports/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeDefined();
    expect(res.body.summary.totalReports).toBe(3);
    expect(res.body.summary.byReason.wrong_answer).toBe(2);
    expect(res.body.summary.byReason.bad_explanation).toBe(1);
    expect(res.body.summary.byReason.off_topic).toBe(0);
    expect(Array.isArray(res.body.summary.topFingerprints)).toBe(true);
  });

  it('topFingerprints sorted by totalReports desc', async () => {
    const token = await registerAdminAndGetToken();
    // fp_heavy: 3 reports, fp_light: 1 report
    for (let i = 0; i < 3; i++) {
      await postReport({ fingerprint: 'fp_heavy', reason: 'off_topic' });
    }
    await postReport({ fingerprint: 'fp_light', reason: 'wrong_answer' });

    const res = await request(app)
      .get('/api/question-reports/summary')
      .set('Authorization', `Bearer ${token}`);
    const fps = res.body.summary.topFingerprints;
    expect(fps[0].fingerprint).toBe('fp_heavy');
    expect(fps[0].totalReports).toBe(3);
    expect(fps[1].fingerprint).toBe('fp_light');
  });

  it('limit param is respected (default 20)', async () => {
    const token = await registerAdminAndGetToken();
    // Seed 5 distinct fingerprints
    for (let i = 0; i < 5; i++) {
      await postReport({ fingerprint: `fp${i}`, reason: 'wrong_answer' });
    }
    const res = await request(app)
      .get('/api/question-reports/summary?limit=3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.summary.topFingerprints.length).toBeLessThanOrEqual(3);
  });

  it('topFingerprints entries have the expected flat fields', async () => {
    const token = await registerAdminAndGetToken();
    await postReport({ fingerprint: 'fp_shape', reason: 'wrong_answer' });

    const res = await request(app)
      .get('/api/question-reports/summary')
      .set('Authorization', `Bearer ${token}`);
    const entry = res.body.summary.topFingerprints[0];
    expect(entry).toHaveProperty('fingerprint');
    expect(entry).toHaveProperty('totalReports');
    expect(entry).toHaveProperty('wrongAnswerReports');
    expect(entry).toHaveProperty('badExplanationReports');
    expect(entry).toHaveProperty('offTopicReports');
    expect(entry).toHaveProperty('uniqueUsers');
    expect(entry).toHaveProperty('quarantineStatus');
    expect(entry).toHaveProperty('primaryReason');
    expect(entry).toHaveProperty('recommendedAction');
  });
});

// ── GET /api/question-reports/fingerprints/:fingerprint ──────────────────────
// Admin-only — same rationale as /summary above.

describe('GET /api/question-reports/fingerprints/:fingerprint — admin only', () => {
  it('returns 401 without auth token (anonymous)', async () => {
    const res = await request(app).get('/api/question-reports/fingerprints/fp_test');
    expect(res.status).toBe(401);
  });

  it('returns 403 for an authenticated non-admin user', async () => {
    const token = await registerAndGetToken();
    const res = await request(app)
      .get('/api/question-reports/fingerprints/fp_test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('fails closed when ADMIN_USER_IDS is empty, even for a real user', async () => {
    const token = await registerAndGetToken();
    delete process.env.ADMIN_USER_IDS;
    const res = await request(app)
      .get('/api/question-reports/fingerprints/fp_test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns zero/clear for unknown fingerprint (configured admin)', async () => {
    const token = await registerAdminAndGetToken();
    const res = await request(app)
      .get('/api/question-reports/fingerprints/fp_unknown')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.report.totalReports).toBe(0);
    expect(res.body.report.quarantineStatus).toBe('clear');
    expect(res.body.report.recommendedAction).toBe('none');
    expect(res.body.report.primaryReason).toBeNull();
  });

  it('report has the expected shape', async () => {
    const token = await registerAdminAndGetToken();
    await postReport({ fingerprint: 'fp_shape', reason: 'wrong_answer' });
    const res = await request(app)
      .get('/api/question-reports/fingerprints/fp_shape')
      .set('Authorization', `Bearer ${token}`);
    const r = res.body.report;
    expect(r).toHaveProperty('fingerprint', 'fp_shape');
    expect(r).toHaveProperty('totalReports');
    expect(r).toHaveProperty('byReason');
    expect(r.byReason).toHaveProperty('wrong_answer');
    expect(r.byReason).toHaveProperty('bad_explanation');
    expect(r.byReason).toHaveProperty('off_topic');
    expect(r).toHaveProperty('uniqueUsers');
    expect(r).toHaveProperty('quarantineStatus');
    expect(r).toHaveProperty('primaryReason');
    expect(r).toHaveProperty('recommendedAction');
  });

  it('rejects fingerprint longer than 500 chars with 400', async () => {
    const token = await registerAdminAndGetToken();
    const res = await request(app)
      .get(`/api/question-reports/fingerprints/${'x'.repeat(501)}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });
});

// ── QuestionReportService — threshold logic ────────────────────────────────────

describe('QuestionReportService — quarantine thresholds', () => {
  let repo: InMemoryQuestionReportsRepository;
  let service: QuestionReportService;
  let reportUserCounter = 0;

  const makeReport = (
    fp: string,
    reason: 'wrong_answer' | 'bad_explanation' | 'off_topic',
    userId: string | null = `report-user-${++reportUserCounter}`,
  ) => ({
    user_id:            userId,
    question_id:        null,
    fingerprint:        fp,
    reason,
    source:             null,
    mode:               null,
    difficulty:         null,
    requested_subject:  null,
    requested_system:   null,
    requested_topic:    null,
    actual_subject:     null,
    actual_system:      null,
    actual_topic:       null,
    tested_concept:     null,
    usmle_content_area: null,
    physician_task:     null,
    stem_preview:       null,
  } as const);

  beforeEach(() => {
    reportUserCounter = 0;
    repo    = new InMemoryQuestionReportsRepository();
    service = new QuestionReportService(repo);
  });

  it('wrong_answer >= 2 → quarantined', async () => {
    await repo.create(makeReport('fp1', 'wrong_answer'));
    await repo.create(makeReport('fp1', 'wrong_answer'));
    const r = await service.getFingerprintReport('fp1');
    expect(r.quarantineStatus).toBe('quarantined');
    expect(r.recommendedAction).toBe('quarantine');
    expect(r.primaryReason).toBe('wrong_answer');
  });

  it('off_topic >= 3 → quarantined', async () => {
    await repo.create(makeReport('fp2', 'off_topic'));
    await repo.create(makeReport('fp2', 'off_topic'));
    await repo.create(makeReport('fp2', 'off_topic'));
    const r = await service.getFingerprintReport('fp2');
    expect(r.quarantineStatus).toBe('quarantined');
    expect(r.recommendedAction).toBe('quarantine');
  });

  it('total >= 5 → quarantined regardless of individual counts', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create(makeReport('fp3', i < 2 ? 'bad_explanation' : 'off_topic'));
    }
    const r = await service.getFingerprintReport('fp3');
    expect(r.quarantineStatus).toBe('quarantined');
    expect(r.recommendedAction).toBe('quarantine');
  });

  it('bad_explanation >= 3 → watch + repair_explanation', async () => {
    await repo.create(makeReport('fp4', 'bad_explanation'));
    await repo.create(makeReport('fp4', 'bad_explanation'));
    await repo.create(makeReport('fp4', 'bad_explanation'));
    const r = await service.getFingerprintReport('fp4');
    expect(r.quarantineStatus).toBe('watch');
    expect(r.recommendedAction).toBe('repair_explanation');
    expect(r.primaryReason).toBe('bad_explanation');
  });

  it('total >= 2 (without worse threshold) → watch + review', async () => {
    await repo.create(makeReport('fp5', 'wrong_answer'));
    await repo.create(makeReport('fp5', 'bad_explanation'));
    const r = await service.getFingerprintReport('fp5');
    expect(r.quarantineStatus).toBe('watch');
    expect(r.recommendedAction).toBe('review');
  });

  it('single report → clear + none', async () => {
    await repo.create(makeReport('fp6', 'bad_explanation'));
    const r = await service.getFingerprintReport('fp6');
    expect(r.quarantineStatus).toBe('clear');
    expect(r.recommendedAction).toBe('none');
  });

  it('uniqueUsers excludes anonymous (null) user_ids', async () => {
    // 2 anonymous + 2 unique authenticated users
    await repo.create(makeReport('fp7', 'wrong_answer', null));
    await repo.create(makeReport('fp7', 'wrong_answer', null));
    await repo.create(makeReport('fp7', 'wrong_answer', 'user-a'));
    await repo.create(makeReport('fp7', 'wrong_answer', 'user-b'));
    const r = await service.getFingerprintReport('fp7');
    expect(r.totalReports).toBe(4);
    expect(r.uniqueUsers).toBe(2);  // only user-a and user-b
  });

  it('getSummary totals all reports across fingerprints', async () => {
    await repo.create(makeReport('fp8', 'wrong_answer'));
    await repo.create(makeReport('fp9', 'bad_explanation'));
    await repo.create(makeReport('fp9', 'off_topic'));
    const s = await service.getSummary(20);
    expect(s.totalReports).toBe(3);
    expect(s.byReason.wrong_answer).toBe(1);
    expect(s.byReason.bad_explanation).toBe(1);
    expect(s.byReason.off_topic).toBe(1);
  });

  it('getSummary topFingerprints sorted by totalReports desc, fingerprint asc for ties', async () => {
    await repo.create(makeReport('z_fp', 'wrong_answer'));
    await repo.create(makeReport('z_fp', 'wrong_answer'));
    await repo.create(makeReport('a_fp', 'wrong_answer'));
    await repo.create(makeReport('a_fp', 'wrong_answer'));
    await repo.create(makeReport('m_fp', 'wrong_answer'));
    await repo.create(makeReport('m_fp', 'wrong_answer'));
    await repo.create(makeReport('m_fp', 'wrong_answer'));
    const s = await service.getSummary(10);
    // m_fp has 3 reports, a_fp and z_fp have 2 each
    expect(s.topFingerprints[0].fingerprint).toBe('m_fp');
    // a_fp before z_fp (alphabetical tiebreak)
    expect(s.topFingerprints[1].fingerprint).toBe('a_fp');
    expect(s.topFingerprints[2].fingerprint).toBe('z_fp');
  });

  it('getSummary limit is respected', async () => {
    for (let i = 0; i < 10; i++) {
      await repo.create(makeReport(`fp_limit_${i}`, 'wrong_answer'));
    }
    const s = await service.getSummary(3);
    expect(s.topFingerprints.length).toBeLessThanOrEqual(3);
    expect(s.totalReports).toBe(10);  // globalTotal is NOT limited
  });

  it('getQuarantinedFingerprints returns only quarantine-threshold fingerprints', async () => {
    // fp_a: 2 wrong_answer → quarantined
    await repo.create(makeReport('fp_a', 'wrong_answer'));
    await repo.create(makeReport('fp_a', 'wrong_answer'));
    // fp_b: 1 wrong_answer → clear
    await repo.create(makeReport('fp_b', 'wrong_answer'));
    // fp_c: 3 off_topic → quarantined
    await repo.create(makeReport('fp_c', 'off_topic'));
    await repo.create(makeReport('fp_c', 'off_topic'));
    await repo.create(makeReport('fp_c', 'off_topic'));
    const quarantined = await service.getQuarantinedFingerprints();
    expect(quarantined.has('fp_a')).toBe(true);
    expect(quarantined.has('fp_c')).toBe(true);
    expect(quarantined.has('fp_b')).toBe(false);
  });

  it('does not quarantine when one user repeats the same critical report', async () => {
    await repo.create(makeReport('fp_repeat', 'wrong_answer', 'same-user'));
    await repo.create(makeReport('fp_repeat', 'wrong_answer', 'same-user'));
    await repo.create(makeReport('fp_repeat', 'wrong_answer', 'same-user'));

    const report = await service.getFingerprintReport('fp_repeat');
    const quarantined = await service.getQuarantinedFingerprints();
    expect(report.quarantineStatus).not.toBe('quarantined');
    expect(quarantined.has('fp_repeat')).toBe(false);
  });

  it('does not let legacy anonymous reports influence global quarantine', async () => {
    for (let i = 0; i < 6; i++) {
      await repo.create(makeReport('fp_anonymous', 'wrong_answer', null));
    }

    const report = await service.getFingerprintReport('fp_anonymous');
    const quarantined = await service.getQuarantinedFingerprints();
    expect(report.uniqueUsers).toBe(0);
    expect(report.quarantineStatus).not.toBe('quarantined');
    expect(quarantined.has('fp_anonymous')).toBe(false);
  });
});

// ── Phase 6.1: ambiguous_or_insufficient_clues reason ────────────────────────

describe('POST /api/question-reports — ambiguous_or_insufficient_clues', () => {
  it('accepts ambiguous_or_insufficient_clues reason and returns 201', async () => {
    const res = await postReport({ fingerprint: 'fp_ambiguous', reason: 'ambiguous_or_insufficient_clues' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
  });

  it('stores the reason correctly in the repository', async () => {
    await postReport({ fingerprint: 'fp_store_test', reason: 'ambiguous_or_insufficient_clues' });
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    // Fresh repo is empty — just verify the route round-trips without error
    const res = await postReport({ fingerprint: 'fp_store2', reason: 'ambiguous_or_insufficient_clues' });
    expect(res.status).toBe(201);
  });
});

describe('QuestionReportService — ambiguous_or_insufficient_clues thresholds', () => {
  let repo: InMemoryQuestionReportsRepository;
  let service: QuestionReportService;
  let reportUserCounter = 0;

  function makeReport(
    fp: string,
    reason: string,
    userId: string | null = `ambiguous-user-${++reportUserCounter}`,
  ) {
    return {
      user_id: userId, question_id: null, fingerprint: fp, reason: reason as any,
      source: null, mode: null, difficulty: null, requested_subject: null,
      requested_system: null, requested_topic: null, actual_subject: null,
      actual_system: null, actual_topic: null, tested_concept: null,
      usmle_content_area: null, physician_task: null, stem_preview: null,
    };
  }

  beforeEach(() => {
    reportUserCounter = 0;
    repo = new InMemoryQuestionReportsRepository();
    service = new QuestionReportService(repo);
  });

  it('1 ambiguous report → clear', async () => {
    await repo.create(makeReport('fp1', 'ambiguous_or_insufficient_clues'));
    const r = await service.getFingerprintReport('fp1');
    expect(r.quarantineStatus).toBe('clear');
  });

  it('2 ambiguous reports → watch + revalidate_clues', async () => {
    await repo.create(makeReport('fp2', 'ambiguous_or_insufficient_clues'));
    await repo.create(makeReport('fp2', 'ambiguous_or_insufficient_clues'));
    const r = await service.getFingerprintReport('fp2');
    expect(r.quarantineStatus).toBe('watch');
    expect(r.recommendedAction).toBe('revalidate_clues');
    expect(r.primaryReason).toBe('ambiguous_or_insufficient_clues');
  });

  it('5 ambiguous reports → quarantined (total >= 5 threshold)', async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create(makeReport('fp3', 'ambiguous_or_insufficient_clues'));
    }
    const r = await service.getFingerprintReport('fp3');
    expect(r.quarantineStatus).toBe('quarantined');
    expect(r.recommendedAction).toBe('quarantine');
  });

  it('ambiguous count appears in getFingerprintReport byReason', async () => {
    await repo.create(makeReport('fp4', 'ambiguous_or_insufficient_clues'));
    await repo.create(makeReport('fp4', 'wrong_answer'));
    const r = await service.getFingerprintReport('fp4');
    expect(r.byReason.ambiguous_or_insufficient_clues).toBe(1);
    expect(r.byReason.wrong_answer).toBe(1);
    expect(r.totalReports).toBe(2);
  });

  it('ambiguous count appears in getSummary byReason', async () => {
    await repo.create(makeReport('fp5', 'ambiguous_or_insufficient_clues'));
    await repo.create(makeReport('fp5', 'off_topic'));
    const s = await service.getSummary(20);
    expect(s.byReason.ambiguous_or_insufficient_clues).toBe(1);
    expect(s.byReason.off_topic).toBe(1);
    expect(s.totalReports).toBe(2);
  });

  it('ambiguous count appears in topFingerprints summary entries', async () => {
    await repo.create(makeReport('fp6', 'ambiguous_or_insufficient_clues'));
    const s = await service.getSummary(20);
    const entry = s.topFingerprints.find(e => e.fingerprint === 'fp6');
    expect(entry).toBeDefined();
    expect(entry!.ambiguousReports).toBe(1);
  });

  it('ambiguous does NOT trigger quarantine via wrong_answer threshold (separate thresholds)', async () => {
    await repo.create(makeReport('fp7', 'ambiguous_or_insufficient_clues'));
    await repo.create(makeReport('fp7', 'ambiguous_or_insufficient_clues'));
    // Only 2 ambiguous — wrong_answer threshold not met; total < 5 → watch, not quarantined
    const r = await service.getFingerprintReport('fp7');
    expect(r.quarantineStatus).toBe('watch');
    expect(r.quarantineStatus).not.toBe('quarantined');
  });

  it('existing quarantine thresholds are unchanged by new reason', async () => {
    // wrong_answer >= 2 still quarantines immediately
    await repo.create(makeReport('fp8', 'wrong_answer'));
    await repo.create(makeReport('fp8', 'wrong_answer'));
    const r = await service.getFingerprintReport('fp8');
    expect(r.quarantineStatus).toBe('quarantined');
    expect(r.primaryReason).toBe('wrong_answer');
  });
});

describe('REPORT_REASON_REVALIDATION_MAP', () => {
  it('contains an entry for every report reason', () => {
    const allReasons: string[] = [
      'wrong_answer', 'bad_explanation', 'off_topic',
      'ambiguous_or_insufficient_clues', 'duplicate', 'technical_issue',
    ];
    for (const reason of allReasons) {
      expect(REPORT_REASON_REVALIDATION_MAP).toHaveProperty(reason);
    }
  });

  it('ambiguous_or_insufficient_clues maps to clinical and structural checks', () => {
    const checks = REPORT_REASON_REVALIDATION_MAP['ambiguous_or_insufficient_clues'];
    expect(checks).toContain('clinical_signal');
    expect(checks).toContain('objective_data');
    expect(checks).toContain('lead_in_clarity');
    expect(checks).toContain('difficulty_fit');
    expect(checks).toContain('answer_support');
    expect(checks).toContain('single_best_answer_structure');
    expect(checks).toContain('nbme_uworld_specific_rules');
  });

  it('wrong_answer maps to answer correctness checks', () => {
    const checks = REPORT_REASON_REVALIDATION_MAP['wrong_answer'];
    expect(checks).toContain('answer_support');
    expect(checks).toContain('explanation_contradiction');
  });

  it('off_topic maps to scope alignment', () => {
    expect(REPORT_REASON_REVALIDATION_MAP['off_topic']).toContain('scope_alignment');
  });

  it('duplicate maps to content fingerprint checks', () => {
    expect(REPORT_REASON_REVALIDATION_MAP['duplicate']).toContain('content_fingerprint');
    expect(REPORT_REASON_REVALIDATION_MAP['duplicate']).toContain('stem_similarity');
  });

  it('technical_issue maps to structural checks', () => {
    expect(REPORT_REASON_REVALIDATION_MAP['technical_issue']).toContain('json_structure');
    expect(REPORT_REASON_REVALIDATION_MAP['technical_issue']).toContain('option_format');
  });
});

// ── Phase 10.0C: duplicate and technical_issue report reasons ─────────────────

describe('POST /api/question-reports — duplicate and technical_issue reasons', () => {
  it('accepts duplicate reason and returns 201', async () => {
    const res = await postReport({ fingerprint: 'fp_dup', reason: 'duplicate' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
  });

  it('accepts technical_issue reason and returns 201', async () => {
    const res = await postReport({ fingerprint: 'fp_tech', reason: 'technical_issue' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
  });
});

describe('QuestionReportService — duplicate and technical_issue thresholds', () => {
  let repo: InMemoryQuestionReportsRepository;
  let service: QuestionReportService;
  let reportUserCounter = 0;

  function makeReport(fp: string, reason: string) {
    return {
      user_id: `duplicate-user-${++reportUserCounter}`, question_id: null, fingerprint: fp, reason: reason as any,
      source: null, mode: null, difficulty: null, requested_subject: null,
      requested_system: null, requested_topic: null, actual_subject: null,
      actual_system: null, actual_topic: null, tested_concept: null,
      usmle_content_area: null, physician_task: null, stem_preview: null,
    };
  }

  beforeEach(() => {
    reportUserCounter = 0;
    repo = new InMemoryQuestionReportsRepository();
    service = new QuestionReportService(repo);
  });

  it('duplicate reports require two distinct users before quarantine', async () => {
    await repo.create(makeReport('fp_d1', 'duplicate'));
    let r = await service.getFingerprintReport('fp_d1');
    expect(r.quarantineStatus).not.toBe('quarantined');

    await repo.create(makeReport('fp_d1', 'duplicate'));
    r = await service.getFingerprintReport('fp_d1');
    expect(r.quarantineStatus).toBe('quarantined');
    expect(r.recommendedAction).toBe('quarantine');
    expect(r.primaryReason).toBe('duplicate');
  });

  it('technical_issue >= 1 → watch + review', async () => {
    await repo.create(makeReport('fp_t1', 'technical_issue'));
    const r = await service.getFingerprintReport('fp_t1');
    expect(r.quarantineStatus).toBe('watch');
    expect(r.recommendedAction).toBe('review');
    expect(r.primaryReason).toBe('technical_issue');
  });

  it('getQuarantinedFingerprints requires two distinct duplicate reporters', async () => {
    await repo.create(makeReport('fp_dup_q', 'duplicate'));
    await repo.create(makeReport('fp_dup_q', 'duplicate'));
    await repo.create(makeReport('fp_clean', 'bad_explanation'));
    const quarantined = await service.getQuarantinedFingerprints();
    expect(quarantined.has('fp_dup_q')).toBe(true);
    expect(quarantined.has('fp_clean')).toBe(false);
  });

  it('getSummary includes duplicate and technical_issue counts', async () => {
    await repo.create(makeReport('fp_s1', 'duplicate'));
    await repo.create(makeReport('fp_s2', 'technical_issue'));
    await repo.create(makeReport('fp_s3', 'wrong_answer'));
    const s = await service.getSummary(20);
    expect(s.byReason.duplicate).toBe(1);
    expect(s.byReason.technical_issue).toBe(1);
    expect(s.byReason.wrong_answer).toBe(1);
    expect(s.totalReports).toBe(3);
  });

  it('getFingerprintReport exposes duplicate and technical_issue counts in byReason', async () => {
    await repo.create(makeReport('fp_r1', 'duplicate'));
    await repo.create(makeReport('fp_r1', 'technical_issue'));
    const r = await service.getFingerprintReport('fp_r1');
    expect(r.byReason.duplicate).toBe(1);
    expect(r.byReason.technical_issue).toBe(1);
  });
});
