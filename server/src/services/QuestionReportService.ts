import type { IQuestionReportsRepository } from '../repositories/interfaces.js';
import type {
  FingerprintCountRow,
  QuestionFingerprintReport,
  QuestionReportSummary,
  QuestionReportSummaryEntry,
  QuestionQuarantineStatus,
  QuestionReportReason,
  QuestionRecommendedAction,
} from '../types/index.js';

// ── Threshold constants ───────────────────────────────────────────────────────

const QUARANTINE_WRONG_ANSWER_MIN  = 2;  // wrong_answer >= 2 → quarantined
const QUARANTINE_OFF_TOPIC_MIN     = 3;  // off_topic >= 3    → quarantined
const QUARANTINE_TOTAL_MIN         = 5;  // total >= 5        → quarantined
const WATCH_BAD_EXPLANATION_MIN    = 3;  // bad_explanation >= 3 → watch + repair_explanation
const WATCH_TOTAL_MIN              = 2;  // total >= 2        → watch + review

// ── Pure threshold logic (no DB, no req/res) ─────────────────────────────────

function computePrimaryReason(
  wa: number,
  be: number,
  ot: number,
): QuestionReportReason | null {
  if (wa === 0 && be === 0 && ot === 0) return null;
  if (wa >= be && wa >= ot) return 'wrong_answer';
  if (ot >= be) return 'off_topic';
  return 'bad_explanation';
}

function applyThresholds(fp: FingerprintCountRow): {
  status:   QuestionQuarantineStatus;
  primary:  QuestionReportReason | null;
  action:   QuestionRecommendedAction;
} {
  const { wrong_answer: wa, bad_explanation: be, off_topic: ot, total } = fp;

  if (wa >= QUARANTINE_WRONG_ANSWER_MIN || ot >= QUARANTINE_OFF_TOPIC_MIN || total >= QUARANTINE_TOTAL_MIN) {
    return {
      status:  'quarantined',
      primary: computePrimaryReason(wa, be, ot),
      action:  'quarantine',
    };
  }
  if (be >= WATCH_BAD_EXPLANATION_MIN) {
    return { status: 'watch', primary: 'bad_explanation', action: 'repair_explanation' };
  }
  if (total >= WATCH_TOTAL_MIN) {
    return { status: 'watch', primary: computePrimaryReason(wa, be, ot), action: 'review' };
  }
  return { status: 'clear', primary: null, action: 'none' };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class QuestionReportService {
  constructor(private repo: IQuestionReportsRepository) {}

  /** Aggregate analytics summary across all reports. */
  async getSummary(limit: number): Promise<QuestionReportSummary> {
    const raw = await this.repo.getCountsByFingerprint(limit);

    const topFingerprints: QuestionReportSummaryEntry[] = raw.fingerprints.map(fp => {
      const { status, primary, action } = applyThresholds(fp);
      return {
        fingerprint:           fp.fingerprint,
        totalReports:          fp.total,
        wrongAnswerReports:    fp.wrong_answer,
        badExplanationReports: fp.bad_explanation,
        offTopicReports:       fp.off_topic,
        uniqueUsers:           fp.unique_users,
        quarantineStatus:      status,
        primaryReason:         primary,
        recommendedAction:     action,
      };
    });

    return {
      totalReports: raw.globalTotal,
      byReason: {
        wrong_answer:    raw.globalWrongAnswer,
        bad_explanation: raw.globalBadExpl,
        off_topic:       raw.globalOffTopic,
      },
      topFingerprints,
    };
  }

  /** Full analytics report for a single question fingerprint. */
  async getFingerprintReport(fingerprint: string): Promise<QuestionFingerprintReport> {
    const raw = await this.repo.getCountsForFingerprint(fingerprint);
    const { status, primary, action } = applyThresholds(raw);

    return {
      fingerprint:       raw.fingerprint,
      totalReports:      raw.total,
      byReason: {
        wrong_answer:    raw.wrong_answer,
        bad_explanation: raw.bad_explanation,
        off_topic:       raw.off_topic,
      },
      uniqueUsers:       raw.unique_users,
      quarantineStatus:  status,
      primaryReason:     primary,
      recommendedAction: action,
    };
  }

  /** Returns the set of fingerprints that are currently quarantined. */
  async getQuarantinedFingerprints(): Promise<Set<string>> {
    return this.repo.getQuarantinedFingerprints();
  }
}
