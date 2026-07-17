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

describe('AnalyticsService — trusted-analytics filtering (Phase 1)', () => {
  let sessionsRepo: InMemoryExamSessionsRepository;
  let analyticsRepo: InMemoryAnalyticsRepository;
  let service: AnalyticsService;

  beforeEach(() => {
    sessionsRepo = new InMemoryExamSessionsRepository();
    analyticsRepo = new InMemoryAnalyticsRepository();
    service = new AnalyticsService(analyticsRepo, sessionsRepo);
  });

  it('includes a server_issued session in trusted analytics', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued', { medica_score: 90 }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(false);
    expect((result.overview as { avgMedicaScore: number }).avgMedicaScore).toBe(90);
  });

  it('includes a client_selected_verified session in trusted analytics', async () => {
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 70 }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(false);
    expect((result.overview as { avgMedicaScore: number }).avgMedicaScore).toBe(70);
  });

  it('excludes an unverified_local session from Medica Score and readiness', async () => {
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { medica_score: 99, readiness_label: 'Strong' }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(true);
  });

  it('excludes a legacy_unverified session from new trusted calculations', async () => {
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified', { medica_score: 99 }));
    const result = await service.getAnalytics('user-1');
    expect(result.empty).toBe(true);
  });

  it('personal session history (ExamService-level) still includes all four classifications — AnalyticsService filtering never deletes or hides sessions', async () => {
    await sessionsRepo.create(makeSession('user-1', 'server_issued'));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified'));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local'));
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified'));

    const history = await sessionsRepo.findByUserId('user-1', { page: 1, limit: 10 });
    expect(history.data).toHaveLength(4);
    expect(history.total).toBe(4);
  });

  it('mixing trusted and untrusted sessions produces the SAME trusted metric as using only the trusted sessions', async () => {
    await sessionsRepo.create(makeSession('user-a', 'server_issued', { medica_score: 60 }));
    await sessionsRepo.create(makeSession('user-a', 'client_selected_verified', { medica_score: 80 }));

    await sessionsRepo.create(makeSession('user-b', 'server_issued', { medica_score: 60 }));
    await sessionsRepo.create(makeSession('user-b', 'client_selected_verified', { medica_score: 80 }));
    // user-b additionally has untrusted sessions with wildly different scores —
    // these must not move the trusted average at all.
    await sessionsRepo.create(makeSession('user-b', 'unverified_local', { medica_score: 1 }));
    await sessionsRepo.create(makeSession('user-b', 'legacy_unverified', { medica_score: 100 }));

    const trustedOnly = await service.getAnalytics('user-a');
    const mixed = await service.getAnalytics('user-b');

    expect((mixed.overview as { avgMedicaScore: number }).avgMedicaScore)
      .toBe((trustedOnly.overview as { avgMedicaScore: number }).avgMedicaScore);
  });

  it('analytics eligibility is governed by the stored integrity_status alone, never by mode — two sessions with the same integrity_status but different modes produce identical inclusion', async () => {
    await sessionsRepo.create(makeSession('user-mode-a', 'unverified_local', { mode: 'exam', medica_score: 95 }));
    await sessionsRepo.create(makeSession('user-mode-b', 'unverified_local', { mode: 'practice', medica_score: 95 }));

    const examResult = await service.getAnalytics('user-mode-a');
    const practiceResult = await service.getAnalytics('user-mode-b');

    // Both excluded identically regardless of mode — mode has no bearing on eligibility.
    expect(examResult.empty).toBe(true);
    expect(practiceResult.empty).toBe(true);
  });

  it('saveSnapshot excludes untrusted sessions from the persisted snapshot', async () => {
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 80 }));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { medica_score: 20 }));

    await service.saveSnapshot('user-1');

    const snapshot = await analyticsRepo.findLatestByUserId('user-1');
    expect(snapshot).not.toBeNull();
    expect(snapshot!.average_score).toBe(80);
    expect(snapshot!.total_sessions).toBe(1);
  });

  it('saveSnapshot is a no-op when the user has only untrusted sessions', async () => {
    await sessionsRepo.create(makeSession('user-1', 'unverified_local'));
    await sessionsRepo.create(makeSession('user-1', 'legacy_unverified'));

    await service.saveSnapshot('user-1');

    const snapshot = await analyticsRepo.findLatestByUserId('user-1');
    expect(snapshot).toBeNull();
  });

  it('getProgressGains excludes untrusted sessions from the trend', async () => {
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 60 }));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { medica_score: 5 }));
    await sessionsRepo.create(makeSession('user-1', 'client_selected_verified', { medica_score: 75 }));

    const gains = await service.getProgressGains('user-1') as Array<{ current_score: number; previous_score: number }>;
    // Only the two trusted sessions participate — a single gain entry comparing them.
    expect(gains).toHaveLength(1);
    expect(gains[0]!.previous_score).toBe(60);
    expect(gains[0]!.current_score).toBe(75);
  });

  it('getBenchmark excludes untrusted 40-question exam sessions', async () => {
    const fortyAnswers = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`q${i}`, 'A']));
    await sessionsRepo.create(makeSession('user-1', 'unverified_local', { mode: 'exam', answers: fortyAnswers, percentage: 99 }));

    const benchmark = await service.getBenchmark('user-1') as { sessionCount: number };
    expect(benchmark.sessionCount).toBe(0);
  });
});
