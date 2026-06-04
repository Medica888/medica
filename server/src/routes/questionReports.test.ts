import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createInMemoryRepositories, setRepositories } from '../repositories/index.js';
import { QuestionReportService } from '../services/QuestionReportService.js';
import { InMemoryQuestionReportsRepository } from '../repositories/memory/QuestionReportsRepository.js';

const app = createApp();

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

async function registerAndGetToken(): Promise<string> {
  const res = await request(app).post('/api/auth/register').send({
    email: `reporter_${Date.now()}@example.com`,
    name: 'Reporter',
    password: 'password123',
  });
  return res.body.token as string;
}

beforeEach(() => {
  setRepositories(createInMemoryRepositories());
});

// ── POST /api/question-reports ─────────────────────────────────────────────────

describe('POST /api/question-reports', () => {
  it('accepts a complete valid report and returns 201 with id', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send(VALID_REPORT);
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id.length).toBeGreaterThan(0);
  });

  it('accepts a minimal report (fingerprint + reason only)', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: 'fp_minimal', reason: 'bad_explanation' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
  });

  it('accepts all three valid reasons', async () => {
    for (const reason of ['wrong_answer', 'bad_explanation', 'off_topic']) {
      const res = await request(app)
        .post('/api/question-reports')
        .send({ fingerprint: 'fp_reason_test', reason });
      expect(res.status).toBe(201);
    }
  });

  it('rejects an invalid reason with 400', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: 'fp_bad', reason: 'spam' });
    expect(res.status).toBe(400);
  });

  it('rejects missing fingerprint with 400', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ reason: 'wrong_answer' });
    expect(res.status).toBe(400);
  });

  it('rejects empty fingerprint with 400', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: '', reason: 'wrong_answer' });
    expect(res.status).toBe(400);
  });

  it('rejects fingerprint exceeding 200 chars with 400', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: 'x'.repeat(201), reason: 'wrong_answer' });
    expect(res.status).toBe(400);
  });

  it('rejects stemPreview exceeding 500 chars with 400', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: 'fp_x', reason: 'wrong_answer', stemPreview: 'A'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('rejects invalid source value with 400', async () => {
    const res = await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: 'fp_x', reason: 'wrong_answer', source: 'unknown_source' });
    expect(res.status).toBe(400);
  });

  it('stores report as anonymous when no auth token is provided', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    await request(app)
      .post('/api/question-reports')
      .send({ fingerprint: 'fp_anon', reason: 'off_topic' });
    const all = (repos.questionReports as any)._all();
    expect(all).toHaveLength(1);
    expect(all[0].user_id).toBeNull();
  });

  it('maps camelCase request fields to snake_case repository fields', async () => {
    const repos = createInMemoryRepositories();
    setRepositories(repos);
    await request(app)
      .post('/api/question-reports')
      .send({
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
});

// ── GET /api/question-reports/summary ─────────────────────────────────────────

describe('GET /api/question-reports/summary — requires auth', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/question-reports/summary');
    expect(res.status).toBe(401);
  });

  it('returns summary with correct shape when authenticated', async () => {
    const token = await registerAndGetToken();
    // Seed a few reports
    await request(app).post('/api/question-reports').send({ fingerprint: 'fp1', reason: 'wrong_answer' });
    await request(app).post('/api/question-reports').send({ fingerprint: 'fp1', reason: 'wrong_answer' });
    await request(app).post('/api/question-reports').send({ fingerprint: 'fp2', reason: 'bad_explanation' });

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
    const token = await registerAndGetToken();
    // fp_heavy: 3 reports, fp_light: 1 report
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/question-reports').send({ fingerprint: 'fp_heavy', reason: 'off_topic' });
    }
    await request(app).post('/api/question-reports').send({ fingerprint: 'fp_light', reason: 'wrong_answer' });

    const res = await request(app)
      .get('/api/question-reports/summary')
      .set('Authorization', `Bearer ${token}`);
    const fps = res.body.summary.topFingerprints;
    expect(fps[0].fingerprint).toBe('fp_heavy');
    expect(fps[0].totalReports).toBe(3);
    expect(fps[1].fingerprint).toBe('fp_light');
  });

  it('limit param is respected (default 20)', async () => {
    const token = await registerAndGetToken();
    // Seed 5 distinct fingerprints
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/question-reports').send({ fingerprint: `fp${i}`, reason: 'wrong_answer' });
    }
    const res = await request(app)
      .get('/api/question-reports/summary?limit=3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.summary.topFingerprints.length).toBeLessThanOrEqual(3);
  });

  it('topFingerprints entries have the expected flat fields', async () => {
    const token = await registerAndGetToken();
    await request(app).post('/api/question-reports').send({ fingerprint: 'fp_shape', reason: 'wrong_answer' });

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

describe('GET /api/question-reports/fingerprints/:fingerprint — requires auth', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app).get('/api/question-reports/fingerprints/fp_test');
    expect(res.status).toBe(401);
  });

  it('returns zero/clear for unknown fingerprint', async () => {
    const token = await registerAndGetToken();
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
    const token = await registerAndGetToken();
    await request(app).post('/api/question-reports').send({ fingerprint: 'fp_shape', reason: 'wrong_answer' });
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
    const token = await registerAndGetToken();
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

  const makeReport = (fp: string, reason: 'wrong_answer' | 'bad_explanation' | 'off_topic', userId?: string) => ({
    user_id:            userId ?? null,
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
    await repo.create(makeReport('fp7', 'wrong_answer'));           // null
    await repo.create(makeReport('fp7', 'wrong_answer'));           // null
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
});
