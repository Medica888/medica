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
const QUARANTINE_DUPLICATE_MIN     = 1;  // duplicate >= 1    → quarantined (any duplicate report quarantines immediately)
const QUARANTINE_TOTAL_MIN         = 5;  // total >= 5        → quarantined
const WATCH_BAD_EXPLANATION_MIN    = 3;  // bad_explanation >= 3 → watch + repair_explanation
const WATCH_AMBIGUOUS_MIN          = 2;  // ambiguous >= 2    → watch + revalidate_clues
const WATCH_TECHNICAL_ISSUE_MIN    = 1;  // technical_issue >= 1 → watch + review
const WATCH_TOTAL_MIN              = 2;  // total >= 2        → watch + review

// ── Revalidation matrix ───────────────────────────────────────────────────────
// Maps each report reason to the validator checks most relevant for re-running.
// Used by the admin revalidation pipeline to determine which rules to apply.

export const REPORT_REASON_REVALIDATION_MAP: Record<QuestionReportReason, string[]> = {
  wrong_answer:                   ['answer_support', 'explanation_contradiction'],
  bad_explanation:                ['explanation_quality', 'answer_support'],
  off_topic:                      ['scope_alignment'],
  ambiguous_or_insufficient_clues: [
    'clinical_signal',
    'objective_data',
    'lead_in_clarity',
    'difficulty_fit',
    'answer_support',
    'single_best_answer_structure',
    'nbme_uworld_specific_rules',
  ],
  duplicate:                      ['content_fingerprint', 'stem_similarity'],
  technical_issue:                ['json_structure', 'option_format', 'correct_key_validity'],
};

// ── Pure threshold logic (no DB, no req/res) ─────────────────────────────────

function computePrimaryReason(
  wa: number,
  be: number,
  ot: number,
  ac: number,
  du: number,
  ti: number,
): QuestionReportReason | null {
  if (wa === 0 && be === 0 && ot === 0 && ac === 0 && du === 0 && ti === 0) return null;
  if (du > 0) return 'duplicate';
  const max = Math.max(wa, be, ot, ac, ti);
  if (wa === max) return 'wrong_answer';
  if (ot === max) return 'off_topic';
  if (ac === max) return 'ambiguous_or_insufficient_clues';
  if (ti === max) return 'technical_issue';
  return 'bad_explanation';
}

function applyThresholds(fp: FingerprintCountRow): {
  status:   QuestionQuarantineStatus;
  primary:  QuestionReportReason | null;
  action:   QuestionRecommendedAction;
} {
  const {
    wrong_answer: wa,
    bad_explanation: be,
    off_topic: ot,
    ambiguous_or_insufficient_clues: ac,
    duplicate: du,
    technical_issue: ti,
    total,
  } = fp;

  const primary = computePrimaryReason(wa, be, ot, ac, du, ti);

  if (wa >= QUARANTINE_WRONG_ANSWER_MIN || ot >= QUARANTINE_OFF_TOPIC_MIN ||
      du >= QUARANTINE_DUPLICATE_MIN    || total >= QUARANTINE_TOTAL_MIN) {
    return { status: 'quarantined', primary, action: 'quarantine' };
  }
  if (be >= WATCH_BAD_EXPLANATION_MIN) {
    return { status: 'watch', primary: 'bad_explanation', action: 'repair_explanation' };
  }
  if (ac >= WATCH_AMBIGUOUS_MIN) {
    return { status: 'watch', primary: 'ambiguous_or_insufficient_clues', action: 'revalidate_clues' };
  }
  if (ti >= WATCH_TECHNICAL_ISSUE_MIN) {
    return { status: 'watch', primary: 'technical_issue', action: 'review' };
  }
  if (total >= WATCH_TOTAL_MIN) {
    return { status: 'watch', primary, action: 'review' };
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
        fingerprint:                    fp.fingerprint,
        totalReports:                   fp.total,
        wrongAnswerReports:             fp.wrong_answer,
        badExplanationReports:          fp.bad_explanation,
        offTopicReports:                fp.off_topic,
        ambiguousReports:               fp.ambiguous_or_insufficient_clues,
        duplicateReports:               fp.duplicate,
        technicalIssueReports:          fp.technical_issue,
        uniqueUsers:                    fp.unique_users,
        quarantineStatus:               status,
        primaryReason:                  primary,
        recommendedAction:              action,
      };
    });

    return {
      totalReports: raw.globalTotal,
      byReason: {
        wrong_answer:                   raw.globalWrongAnswer,
        bad_explanation:                raw.globalBadExpl,
        off_topic:                      raw.globalOffTopic,
        ambiguous_or_insufficient_clues: raw.globalAmbiguous,
        duplicate:                      raw.globalDuplicate,
        technical_issue:                raw.globalTechnicalIssue,
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
        wrong_answer:                   raw.wrong_answer,
        bad_explanation:                raw.bad_explanation,
        off_topic:                      raw.off_topic,
        ambiguous_or_insufficient_clues: raw.ambiguous_or_insufficient_clues,
        duplicate:                      raw.duplicate,
        technical_issue:                raw.technical_issue,
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
