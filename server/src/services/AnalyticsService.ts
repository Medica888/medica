import type {
  ExamSession,
  StudyPriority,
  MistakeDiagnosis,
  AnalyticsSnapshot,
} from '../types/index.js';
import type { IAnalyticsRepository, IExamSessionsRepository } from '../repositories/interfaces.js';
import { filterSessionsByTrustCapability } from './sessionIntegrity.js';

// ── USMLE Step 1 discipline yield weights ──────────────────────────────────
const USMLE_STEP1_YIELD_MAP: Record<string, { weight: number; reason: string }> = {
  Pathology: { weight: 1.30, reason: 'Core Step 1 discipline with high integration across systems.' },
  Physiology: { weight: 1.25, reason: 'Essential for mechanism-based questions and clinical reasoning.' },
  Pharmacology: { weight: 1.25, reason: 'High-yield for mechanisms, adverse effects, contraindications, and autonomics.' },
  Microbiology: { weight: 1.20, reason: 'Frequently tested through organism recognition, virulence, and treatment.' },
  Immunology: { weight: 1.20, reason: 'High-yield for hypersensitivity, immune deficiencies, vaccines, and mechanisms.' },
  Biochemistry: { weight: 1.15, reason: 'Important for metabolism, genetics, vitamins, and molecular disease.' },
  Genetics: { weight: 1.15, reason: 'Commonly tested through inheritance, molecular mechanisms, and disease associations.' },
  'Behavioral Science': { weight: 1.05, reason: 'Important but usually lower priority than core mechanisms.' },
  Ethics: { weight: 1.00, reason: 'Important for exam performance.' },
  Anatomy: { weight: 0.95, reason: 'Useful but lower Step 1 yield than pathology/physiology/pharm/micro.' },
  Embryology: { weight: 0.90, reason: 'Narrower topic; prioritize strongly only if performance is poor.' },
  Histology: { weight: 0.85, reason: 'Lower standalone yield; prioritize when linked to pathology or systems.' },
};

const USMLE_SYSTEM_YIELD_MAP: Record<string, { weight: number; testedAs: string }> = {
  Cardiovascular: { weight: 1.25, testedAs: 'Mechanism, pathophysiology, pharmacology, and clinical management.' },
  'Renal / Urinary': { weight: 1.20, testedAs: 'Acid-base, electrolytes, GFR, tubular disorders, and pharmacology.' },
  Renal: { weight: 1.20, testedAs: 'Acid-base, electrolytes, and renal pharmacology.' },
  'Hematology / Oncology': { weight: 1.20, testedAs: 'Anemias, coagulation, leukemia, and oncology pharmacology.' },
  Hematology: { weight: 1.20, testedAs: 'Anemias, coagulation, and leukemia.' },
  Neurology: { weight: 1.15, testedAs: 'Localization, stroke syndromes, neurodegenerative disease, and pharmacology.' },
  Pulmonary: { weight: 1.15, testedAs: 'Obstructive vs restrictive, V/Q mismatch, and infections.' },
  Respiratory: { weight: 1.15, testedAs: 'Obstructive vs restrictive, V/Q mismatch, and infections.' },
  Endocrine: { weight: 1.15, testedAs: 'Hormone pathways, diabetes, thyroid, adrenal, and pituitary.' },
  'Infectious Disease': { weight: 1.10, testedAs: 'Organism recognition, virulence, antibiotic mechanisms, and resistance.' },
  Gastrointestinal: { weight: 1.10, testedAs: 'GI pathology, liver disease, and enzyme deficiencies.' },
  Reproductive: { weight: 1.05, testedAs: 'OB/GYN, hormonal pathways, and reproductive pharmacology.' },
  Musculoskeletal: { weight: 0.95, testedAs: 'Connective tissue disorders and joint pathology.' },
  Psychiatry: { weight: 0.90, testedAs: 'DSM criteria, pharmacology, and neurotransmitter pathways.' },
  Dermatology: { weight: 0.85, testedAs: 'Classic presentations, autoimmune skin conditions, and skin cancers.' },
};

function usmleScore(raw: number): number {
  return Math.min(100, Math.max(0, ((raw || 1.0) - 0.75) / 0.6 * 100));
}

function computePriorityScore(
  percentage: number,
  total: number,
  disciplineWeight?: number,
  systemWeight?: number,
): number {
  const weakness = Math.max(0, 100 - percentage);
  const discYield = usmleScore(disciplineWeight ?? 1.0);
  const sysYield = usmleScore(systemWeight ?? 1.0);
  const depth = Math.min(100, (total || 5) * 4);
  const diffPenalty = percentage < 50 ? 80 : percentage < 65 ? 55 : 28;

  return Math.min(100, Math.round(
    weakness * 0.30 +
    discYield * 0.20 +
    sysYield * 0.10 +
    depth * 0.12 +
    diffPenalty * 0.10 +
    50 * 0.08 +
    depth * 0.05 +
    50 * 0.03 +
    50 * 0.02,
  ));
}

interface BreakdownItem {
  name: string;
  correct: number;
  total: number;
  percentage: number;
}

function aggregateBreakdown(
  sessions: ExamSession[],
  key: 'subject_breakdown' | 'system_breakdown',
): BreakdownItem[] {
  const map: Record<string, { correct: number; total: number }> = {};
  for (const s of sessions) {
    const bd = s[key] as Record<string, { correct: number; total: number }>;
    for (const [name, stats] of Object.entries(bd)) {
      if (!map[name]) map[name] = { correct: 0, total: 0 };
      map[name].correct += stats.correct;
      map[name].total += stats.total;
    }
  }
  return Object.entries(map)
    .map(([name, d]) => ({
      name,
      correct: d.correct,
      total: d.total,
      percentage: d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function detectWeakAreas(sessions: ExamSession[]): string[] {
  const subjects = aggregateBreakdown(sessions, 'subject_breakdown');
  const systems = aggregateBreakdown(sessions, 'system_breakdown');
  const all = [
    ...subjects.filter((x) => x.total >= 3),
    ...systems.filter((x) => x.total >= 3),
  ];
  return all.filter((a) => a.percentage < 65).map((a) => a.name);
}

function buildStudyPriorities(sessions: ExamSession[]): StudyPriority[] {
  const subjects = aggregateBreakdown(sessions, 'subject_breakdown');
  const systems = aggregateBreakdown(sessions, 'system_breakdown');

  const weakAreas = [
    ...subjects.filter((x) => x.total >= 3 && x.percentage < 75).map((x) => ({ ...x, category: 'subject' as const })),
    ...systems.filter((x) => x.total >= 3 && x.percentage < 75).map((x) => ({ ...x, category: 'system' as const })),
  ];

  return weakAreas
    .map((w) => {
      const discEntry = w.category === 'subject' ? USMLE_STEP1_YIELD_MAP[w.name] : undefined;
      const sysEntry = w.category === 'system' ? USMLE_SYSTEM_YIELD_MAP[w.name] : undefined;
      const priorityScore = computePriorityScore(w.percentage, w.total, discEntry?.weight, sysEntry?.weight);
      const tier = w.percentage < 50 ? 'critical' : w.percentage < 65 ? 'moderate' : 'mild';
      const reason = tier === 'critical'
        ? `${w.percentage}% accuracy — immediate focus needed.`
        : tier === 'moderate'
          ? `${w.percentage}% accuracy — targeted practice will push this above 70%.`
          : `${w.percentage}% accuracy — one focused block should solidify this.`;

      return {
        subject: w.name,
        system: w.category === 'system' ? w.name : undefined,
        priority_score: priorityScore,
        recommended_hours: tier === 'critical' ? 4 : tier === 'moderate' ? 2 : 1,
        reason,
      } satisfies StudyPriority;
    })
    .sort((a, b) => b.priority_score - a.priority_score);
}

function buildMistakeDiagnoses(sessions: ExamSession[]): MistakeDiagnosis[] {
  const questionCounts: Record<string, { subject?: string; system?: string; count: number }> = {};
  let totalMissed = 0;
  let totalAttempted = 0;
  const subjectMisses: Record<string, number> = {};

  for (const s of sessions) {
    totalAttempted += Object.keys(s.answers).length;
    for (const q of s.missed_questions) {
      totalMissed++;
      if (q.subject) subjectMisses[q.subject] = (subjectMisses[q.subject] ?? 0) + 1;
      if (q.id) {
        if (!questionCounts[q.id]) questionCounts[q.id] = { subject: q.subject, system: q.system, count: 0 };
        questionCounts[q.id].count++;
      }
    }
  }

  const totalRepeated = Object.values(questionCounts).filter((i) => i.count >= 2).length;
  const retentionRatio = totalMissed > 0 ? totalRepeated / totalMissed : 0;

  const topClusterCount = Math.max(0, ...Object.values(subjectMisses));
  const concentrationType = totalMissed > 0 && topClusterCount / totalMissed >= 0.35 ? 'concentrated' : 'distributed';
  const overallAccuracy = totalAttempted > 0 ? Math.round(((totalAttempted - totalMissed) / totalAttempted) * 100) : 0;

  const diagnoses: MistakeDiagnosis[] = [];

  if (totalMissed < 5) return diagnoses;

  if (retentionRatio >= 0.25) {
    const affected = Object.entries(questionCounts)
      .filter(([, v]) => v.count >= 2)
      .map(([id]) => id);
    diagnoses.push({
      type: 'retention_failure',
      description: 'Repeated misses on the same questions indicate material is not sticking. Spaced review and active recall are needed.',
      affected_questions: affected,
    });
  } else if (concentrationType === 'concentrated') {
    const topSubject = Object.entries(subjectMisses).sort((a, b) => b[1] - a[1])[0];
    diagnoses.push({
      type: 'knowledge_gap',
      subject: topSubject?.[0],
      description: 'Errors cluster in one area — a targeted gap, not a broad weakness. Focused drilling will resolve this quickly.',
      affected_questions: [],
    });
  } else if (overallAccuracy >= 75 && totalMissed >= 5) {
    diagnoses.push({
      type: 'selective_blind_spot',
      description: 'Strong overall accuracy with specific unexpected weak areas. Short targeted review sessions are the highest-leverage fix.',
      affected_questions: [],
    });
  } else {
    diagnoses.push({
      type: 'knowledge_gap',
      description: 'Errors spread across multiple subjects suggest foundational gaps. Systematic subject-by-subject review will have the highest return.',
      affected_questions: [],
    });
  }

  return diagnoses;
}

/** integrity_status values that are never called "unverified" — see sessionIntegrity.ts. */
const COUNTABLE_STATUS = ['unverified_local', 'legacy_unverified'] as const;

function countByStatus(sessions: ExamSession[], status: (typeof COUNTABLE_STATUS)[number]): number {
  return sessions.filter((s) => s.integrity_status === status).length;
}

export class AnalyticsService {
  constructor(
    private analyticsRepo: IAnalyticsRepository,
    private sessionsRepo: IExamSessionsRepository,
  ) {}

  /**
   * Fetches a user's session window (most recent `limit`, per existing
   * pagination behavior — this cap predates Phase 1.1 and is unchanged here).
   * Every metric-specific eligible subset below is filtered from this exact
   * same array, so counts are always internally consistent — an eligible
   * count can never appear to exceed a count of "all" sessions because they
   * were fetched from different queries. The tradeoff is the pre-existing
   * one: a user with more than `limit` sessions only has their most recent
   * `limit` considered by any of these calculations, eligible or not.
   */
  private async getSessionWindow(userId: string, limit: number): Promise<ExamSession[]> {
    const result = await this.sessionsRepo.findByUserId(userId, { page: 1, limit });
    return result.data;
  }

  async getAnalytics(userId: string): Promise<Record<string, unknown>> {
    const all = await this.getSessionWindow(userId, 50);

    const personalPerformanceSessions = filterSessionsByTrustCapability(all, 'includedInPersonalPerformanceAnalytics');
    const medicaScoreSessions = filterSessionsByTrustCapability(all, 'includedInMedicaScore');
    const readinessSessions = filterSessionsByTrustCapability(all, 'includedInReadiness');

    const counts = {
      allSessionCount: all.length,
      personalPerformanceSessionCount: personalPerformanceSessions.length,
      medicaScoreEligibleSessionCount: medicaScoreSessions.length,
      readinessEligibleSessionCount: readinessSessions.length,
      unverifiedSessionCount: countByStatus(all, 'unverified_local'),
      legacySessionCount: countByStatus(all, 'legacy_unverified'),
    };

    if (personalPerformanceSessions.length === 0) {
      return { empty: true, ...counts };
    }

    const subjects = aggregateBreakdown(personalPerformanceSessions, 'subject_breakdown');
    const systems = aggregateBreakdown(personalPerformanceSessions, 'system_breakdown');
    const weakAreas = detectWeakAreas(personalPerformanceSessions);
    const studyPriorities = buildStudyPriorities(personalPerformanceSessions);
    const mistakeDiagnoses = buildMistakeDiagnoses(personalPerformanceSessions);

    const totalQuestions = personalPerformanceSessions.reduce((s, sess) => s + Object.keys(sess.answers).length, 0);
    const totalCorrect = personalPerformanceSessions.reduce((s, sess) => s + sess.score, 0);
    const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    // Medica Score / readiness: standardized evidence only (server_issued).
    // No eligible session means no evidence, not a score of zero.
    const scores = medicaScoreSessions.filter((s) => s.medica_score != null).map((s) => s.medica_score);
    const avgMedicaScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const latestMedicaScore = medicaScoreSessions.length > 0 ? (medicaScoreSessions[0]!.medica_score ?? null) : null;
    const latestReadiness = readinessSessions.length > 0 ? (readinessSessions[0]!.readiness_label ?? null) : null;

    return {
      empty: false,
      overview: {
        totalSessions: personalPerformanceSessions.length,
        ...counts,
        totalQuestions,
        totalCorrect,
        overallAccuracy,
        avgMedicaScore,
        latestMedicaScore,
        latestReadiness,
      },
      subjectBreakdown: subjects,
      systemBreakdown: systems,
      weakAreas,
      studyPrescription: studyPriorities,
      mistakeDiagnosis: mistakeDiagnoses,
    };
  }

  /**
   * Fire-and-forget daily snapshot (see routes/exams.ts). This table currently
   * has no live reader anywhere in the app (frontend renders its own
   * client-side analytics — see analyticsEngine.js) and `average_score` is a
   * NOT NULL NUMERIC column with no nullable variant, so rather than invent a
   * 0 for a user with no standardized evidence, the write is gated on having
   * at least one Medica-Score-eligible (server_issued) session — the same
   * "never fabricate a stored score" rule Part 5 requires for the live API,
   * applied at the persistence layer. subject/system mastery and weak-area
   * fields still draw from the broader personal-performance tier (verified
   * client-selected content is real evidence for those), so a user with
   * personal-performance evidence but zero standardized evidence still
   * doesn't get a snapshot row at all today — a documented limitation of a
   * feature nothing currently reads.
   */
  async saveSnapshot(userId: string): Promise<void> {
    const all = await this.getSessionWindow(userId, 50);
    const personalPerformanceSessions = filterSessionsByTrustCapability(all, 'includedInPersonalPerformanceAnalytics');
    const medicaScoreSessions = filterSessionsByTrustCapability(all, 'includedInMedicaScore');
    if (medicaScoreSessions.length === 0) return;

    const subjects = aggregateBreakdown(personalPerformanceSessions, 'subject_breakdown');
    const systems = aggregateBreakdown(personalPerformanceSessions, 'system_breakdown');
    const scores = medicaScoreSessions.filter((s) => s.medica_score != null).map((s) => s.medica_score);
    const avgMedicaScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    await this.analyticsRepo.upsert({
      user_id: userId,
      snapshot_date: new Date(),
      total_sessions: personalPerformanceSessions.length,
      average_score: avgMedicaScore,
      subject_mastery: Object.fromEntries(subjects.map((s) => [s.name, s.percentage])),
      system_mastery: Object.fromEntries(systems.map((s) => [s.name, s.percentage])),
      weak_areas: detectWeakAreas(personalPerformanceSessions),
      study_priorities: buildStudyPriorities(personalPerformanceSessions),
      mistake_diagnoses: buildMistakeDiagnoses(personalPerformanceSessions),
    });
  }

  /**
   * Cohort/benchmark comparison requires standardized evidence: a
   * client-selected set (even fully verified) is not a representative sample
   * to compare against a cohort, so it must not slip in merely because its
   * mode happens to be 'exam' with 40 answered questions.
   */
  async getBenchmark(userId: string): Promise<Record<string, unknown>> {
    const all = await this.getSessionWindow(userId, 100);
    const cohortEligible = filterSessionsByTrustCapability(all, 'includedInCohortComparison');
    const examSessions = cohortEligible.filter(
      (s) => s.mode === 'exam' && Object.keys(s.answers).length === 40,
    );

    if (examSessions.length === 0) {
      return {
        sessionCount: 0,
        latestScore: null,
        bestScore: null,
        sessions: [],
        cohortMedian: null,
        percentile: null,
        sampleSize: 0,
      };
    }

    const scores = examSessions.map((s) => s.percentage ?? 0);
    const latestScore = scores[0];
    const bestScore = Math.max(...scores);

    return {
      sessionCount: examSessions.length,
      latestScore,
      bestScore,
      sessions: examSessions.map((s) => ({
        id: s.id,
        completedAt: s.completed_at,
        score: s.percentage ?? 0,
        medicaScore: s.medica_score ?? null,
        readinessLabel: s.readiness_label ?? null,
      })),
      cohortMedian: null,
      percentile: null,
      sampleSize: 0,
    };
  }

  /**
   * Progress-over-time is a Medica Score trend — it must use the same
   * standardized-evidence tier as Medica Score itself (see getAnalytics),
   * not the broader personal-performance tier, or a burst of client-selected
   * practice could manufacture an artificial "improvement" in the score
   * trajectory.
   */
  async getProgressGains(userId: string): Promise<unknown[]> {
    const all = await this.getSessionWindow(userId, 50);
    const eligible = filterSessionsByTrustCapability(all, 'includedInMedicaScore');
    const sessions = [...eligible].reverse(); // chronological
    if (sessions.length < 2) return [];

    return sessions.slice(1).map((sess, i) => {
      const prev = sessions[i]!;
      return {
        session_id: sess.id,
        completed_at: sess.completed_at,
        previous_score: prev.medica_score,
        current_score: sess.medica_score,
        delta: sess.medica_score - prev.medica_score,
      };
    });
  }
}
