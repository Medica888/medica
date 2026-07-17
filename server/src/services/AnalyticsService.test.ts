import { describe, it, expect, beforeEach } from 'vitest';
import { AnalyticsService } from './AnalyticsService.js';
import { InMemoryExamSessionsRepository } from '../repositories/memory/ExamSessionsRepository.js';
import { InMemoryAnalyticsRepository } from '../repositories/memory/AnalyticsRepository.js';
import type { ExamSession, SessionIntegrityStatus, SubjectStats } from '../types/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

let seq = 0;

function makeSession(
  userId: string,
  integrityStatus: SessionIntegrityStatus,
  overrides: Partial<Omit<ExamSession, 'id' | 'user_id' | 'integrity_status'>> = {},
): Omit<ExamSession, 'id'> {
  seq += 1;
  const subjectBreakdown: Record<string, SubjectStats> = { Pathology: { total: 4, correct: 3, percentage: 75 } };
  return {
    user_id: userId,
    mode: 'practice',
    questions: [],
    answers: {},
    score: 3,
    percentage: 75,
    medica_score: 80,
    readiness_label: 'Ready',
    subject_breakdown: subjectBreakdown,
    system_breakdown: {},
    missed_questions: [],
    completed_at: new Date(Date.now() + seq * 1000),
    duration_seconds: 300,
    difficulty: 'Balanced',
    integrity_status: integrityStatus,
    ...overrides,
  };
}

describe('AnalyticsService — metric-specific trust eligibility (Phase 1.1)', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let analyticsRepo: InMemoryAnalyticsRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    analyticsRepo = new InMemoryAnalyticsRepository();
    service = new AnalyticsService(analyticsRepo, sessionsRepo);
  });

  // ── Personal performance analytics ───────────────────────────────────────

  it('a server_issued session contributes to Medica Score and readiness', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 90, readiness_label: 'Strong' }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(false);
    const overview = result.overview as { avgMedicaScore: number; latestMedicaScore: number; latestReadiness: string };
    expect(overview.avgMedicaScore).toBe(90);
    expect(overview.latestMedicaScore).toBe(90);
    expect(overview.latestReadiness).toBe('Strong');
  });

  it('a client_selected_verified session contributes to personal performance analytics (subject breakdown) but not Medica Score or readiness', async () => {
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 70, readiness_label: 'Ready' }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(false);
    expect((result.subjectBreakdown as unknown[]).length).toBeGreaterThan(0);
    const overview = result.overview as { avgMedicaScore: number | null; latestMedicaScore: number | null; latestReadiness: string | null };
    expect(overview.avgMedicaScore).toBeNull();
    expect(overview.latestMedicaScore).toBeNull();
    expect(overview.latestReadiness).toBeNull();
  });

  it('unverified_local is excluded from personal performance analytics entirely', async () => {
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { medica_score: 99, readiness_label: 'Strong' }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(true);
  });

  it('legacy_unverified is excluded from new trusted calculations', async () => {
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified', { medica_score: 99 }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(true);
  });

  it('personal session history still includes all four classifications — filtering never deletes or hides sessions', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued'));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified'));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local'));
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified'));

    const history = await sessionsRepo.findByUserId('user-1', { page: 1, limit: 10 });
    expect(history.data).toHaveLength(4);
    expect(history.total).toBe(4);
  });

  // ── Medica Score / readiness must ignore client_selected_verified ───────

  it('mixing server_issued and client_selected_verified sessions produces the SAME Medica Score as server_issued alone', async () => {
    await sessionsRepo.create(makeSession('user-a', 'server_issued', { medica_score: 60 }));

    await sessionsRepo.create(makeSession('user-b', 'server_issued', { medica_score: 60 }));
    // user-b additionally has a verified client-selected session with a wildly different
    // score — this must not move the standardized average at all.
    await sessionsRepo.create(makeSession('user-b', 'client_selected_verified', { medica_score: 5 }));

    const serverOnly = await service.getAnalytics('user-a');
    const mixed = await service.getAnalytics('user-b');

    expect((mixed.overview as { avgMedicaScore: number }).avgMedicaScore)
      .toBe((serverOnly.overview as { avgMedicaScore: number }).avgMedicaScore);
  });

  it('mixing trusted and untrusted (unverified_local/legacy) sessions produces the SAME Medica Score as trusted-only', async () => {
    await sessionsRepo.create(makeSession('user-a', 'server_issued', { medica_score: 60 }));

    await sessionsRepo.create(makeSession('user-b', 'server_issued', { medica_score: 60 }));
    await sessionsRepo.create(makeSession('user-b', 'unverified_local', { medica_score: 1 }));
    await sessionsRepo.create(makeSession('user-b', 'legacy_unverified', { medica_score: 100 }));

    const trustedOnly = await service.getAnalytics('user-a');
    const mixed = await service.getAnalytics('user-b');

    expect((mixed.overview as { avgMedicaScore: number }).avgMedicaScore)
      .toBe((trustedOnly.overview as { avgMedicaScore: number }).avgMedicaScore);
  });

  it('analytics eligibility is governed by the stored integrity_status alone, never by mode', async () => {
    await sessionsRepo.create(makeSession('user-mode-a', 'unverified_local', { mode: 'exam', medica_score: 95 }));
    await sessionsRepo.create(makeSession('user-mode-b', 'unverified_local', { mode: 'practice', medica_score: 95 }));

    const examResult = await service.getAnalytics('user-mode-a');
    const practiceResult = await service.getAnalytics('user-mode-b');

    expect(examResult.empty).toBe(true);
    expect(practiceResult.empty).toBe(true);
  });

  // ── No-evidence null semantics ────────────────────────────────────────────

  it('no Medica-Score-eligible sessions returns medicaScore fields as null, not 0 — even though personal performance analytics is populated', async () => {
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 0 }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(false);
    const overview = result.overview as { avgMedicaScore: number | null; latestMedicaScore: number | null };
    expect(overview.avgMedicaScore).toBeNull();
    expect(overview.latestMedicaScore).toBeNull();
  });

  it('a true calculated zero Medica Score (from an eligible server_issued session) remains numeric 0, not null', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 0 }));
    const result = await service.getAnalytics('user-1');
    const overview = result.overview as { avgMedicaScore: number | null; latestMedicaScore: number | null };
    expect(overview.avgMedicaScore).toBe(0);
    expect(overview.latestMedicaScore).toBe(0);
  });

  // ── Counts ────────────────────────────────────────────────────────────────

  it('counts distinguish all sessions from each metric-specific eligible subset', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued'));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified'));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified'));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local'));
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified'));

    const result = await service.getAnalytics('user-1');
    const overview = result.overview as Record<string, number>;
    expect(overview.allSessionCount).toBe(5);
    expect(overview.personalPerformanceSessionCount).toBe(3); // server_issued + 2x client_selected_verified
    expect(overview.medicaScoreEligibleSessionCount).toBe(1); // server_issued only
    expect(overview.readinessEligibleSessionCount).toBe(1);
    expect(overview.unverifiedSessionCount).toBe(1);
    expect(overview.legacySessionCount).toBe(1);
  });

  it('the empty-personal-performance response still reports full counts, distinguishing "no evidence" from "no activity"', async () => {
    await sessionsRepo.create(makeSession('user-1', 'unverified_local'));
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified'));

    const result = await service.getAnalytics('user-1') as Record<string, unknown>;
    expect(result.empty).toBe(true);
    expect(result.allSessionCount).toBe(2);
    expect(result.personalPerformanceSessionCount).toBe(0);
    expect(result.unverifiedSessionCount).toBe(1);
    expect(result.legacySessionCount).toBe(1);
  });

  // ── Benchmark (cohort comparison tier) ────────────────────────────────────

  it('getBenchmark excludes untrusted 40-question exam sessions', async () => {
    const fortyAnswers = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, 'A']));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { mode: 'exam', answers: fortyAnswers, percentage: 99 }));

    const benchmark = await service.getBenchmark('user-1') as { sessionCount: number };
    expect(benchmark.sessionCount).toBe(0);
  });

  it('getBenchmark excludes a client_selected_verified 40-question exam session — verified is not the same as standardized', async () => {
    const fortyAnswers = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, 'A']));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { mode: 'exam', answers: fortyAnswers, percentage: 99 }));

    const benchmark = await service.getBenchmark('user-1') as { sessionCount: number };
    expect(benchmark.sessionCount).toBe(0);
  });

  it('getBenchmark includes a server_issued 40-question exam session', async () => {
    const fortyAnswers = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, 'A']));
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { mode: 'exam', answers: fortyAnswers, percentage: 88 }));

    const benchmark = await service.getBenchmark('user-1') as { sessionCount: number };
    expect(benchmark.sessionCount).toBe(1);
  });

  // ── Progress gains (Medica Score trend tier) ──────────────────────────────

  it('getProgressGains uses the Medica-Score eligibility tier — client_selected_verified sessions do not participate', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 60 }));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 5 }));
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 75 }));

    const gains = await service.getProgressGains('user-1') as Array<{ current_score: number; previous_score: number }>;
    expect(gains).toHaveLength(1);
    expect(gains[0]!.previous_score).toBe(60);
    expect(gains[0]!.current_score).toBe(75);
  });

  it('getProgressGains excludes unverified_local sessions from the trend', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 60 }));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { medica_score: 5 }));
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 75 }));

    const gains = await service.getProgressGains('user-1') as Array<{ current_score: number; previous_score: number }>;
    expect(gains).toHaveLength(1);
    expect(gains[0]!.previous_score).toBe(60);
    expect(gains[0]!.current_score).toBe(75);
  });

  // ── Snapshot persistence ──────────────────────────────────────────────────

  it('saveSnapshot writes average_score from the Medica-Score tier while subject/system mastery draw from the broader personal-performance tier', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 80 }));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 20, subject_breakdown: { Renal: { total: 2, correct: 1, percentage: 50 } } }));

    await service.saveSnapshot('user-1');

    const snapshot = await analyticsRepo.findLatestByUserId('user-1');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.average_score).toBe(80); // server_issued only
    expect(snapshot!.total_sessions).toBe(2); // personal-performance tier (both sessions)
    expect(Object.keys(snapshot!.subject_mastery)).toEqual(expect.arrayContaining(['Pathology', 'Renal']));
  });

  it('saveSnapshot is a no-op (never fabricates a stored score) when the user has personal-performance evidence but zero Medica-Score-eligible sessions', async () => {
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 80 }));

    await service.saveSnapshot('user-1');

    const snapshot = await analyticsRepo.findLatestByUserId('user-1');
    expect(snapshot).toBeNull();
  });

  it('saveSnapshot is a no-op when the user has only untrusted sessions', async () => {
    await sessionsRepo.create(makeSession('user-1', 'unverified_local'));
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified'));

    await service.saveSnapshot('user-1');

    const snapshot = await analyticsRepo.findLatestByUserId('user-1');
    expect(snapshot).toBeNull();
  });
});
