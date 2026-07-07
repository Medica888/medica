import { randomUUID } from 'crypto';
import type { QuestionReport, FingerprintCountRow } from '../../types/index.js';
import type { IQuestionReportsRepository } from '../interfaces.js';
import { isQuarantined } from '../../lib/quarantinePolicy.js';

export class InMemoryQuestionReportsRepository implements IQuestionReportsRepository {
  private store = new Map<string, QuestionReport>();

  async create(report: Omit<QuestionReport, 'id' | 'created_at'>): Promise<{ report: QuestionReport; inserted: boolean }> {
    // Check-then-insert with no `await` in between — mirrors the PG version's
    // single-round-trip atomicity so concurrent replays can't both insert.
    if (report.client_report_id) {
      const existing = [...this.store.values()].find(r =>
        r.user_id === report.user_id && r.client_report_id === report.client_report_id,
      );
      if (existing) return { report: existing, inserted: false };
    }
    const id = randomUUID();
    const record: QuestionReport = { id, ...report, created_at: new Date() };
    this.store.set(id, record);
    return { report: record, inserted: true };
  }

  async getCountsByFingerprint(limit: number): Promise<{
    globalTotal:          number;
    globalWrongAnswer:    number;
    globalBadExpl:        number;
    globalOffTopic:       number;
    globalAmbiguous:      number;
    globalDuplicate:      number;
    globalTechnicalIssue: number;
    fingerprints:         FingerprintCountRow[];
  }> {
    const reports = [...this.store.values()];

    let globalWrongAnswer = 0, globalBadExpl = 0, globalOffTopic = 0, globalAmbiguous = 0;
    let globalDuplicate = 0, globalTechnicalIssue = 0;
    const fmap = new Map<string, QuestionReport[]>();

    for (const r of reports) {
      if (r.reason === 'wrong_answer')                    globalWrongAnswer++;
      if (r.reason === 'bad_explanation')                 globalBadExpl++;
      if (r.reason === 'off_topic')                       globalOffTopic++;
      if (r.reason === 'ambiguous_or_insufficient_clues') globalAmbiguous++;
      if (r.reason === 'duplicate')                       globalDuplicate++;
      if (r.reason === 'technical_issue')                 globalTechnicalIssue++;
      if (!fmap.has(r.fingerprint)) fmap.set(r.fingerprint, []);
      fmap.get(r.fingerprint)!.push(r);
    }

    const rows: FingerprintCountRow[] = [];
    for (const [fp, reps] of fmap.entries()) {
      const uniqueUsers = new Set(
        reps.filter(r => r.user_id !== null).map(r => r.user_id),
      ).size;
      const uniqueWrongAnswerUsers = new Set(
        reps.filter(r => r.user_id !== null && r.reason === 'wrong_answer').map(r => r.user_id),
      ).size;
      const uniqueOffTopicUsers = new Set(
        reps.filter(r => r.user_id !== null && r.reason === 'off_topic').map(r => r.user_id),
      ).size;
      const uniqueDuplicateUsers = new Set(
        reps.filter(r => r.user_id !== null && r.reason === 'duplicate').map(r => r.user_id),
      ).size;
      rows.push({
        fingerprint:                    fp,
        total:                          reps.length,
        wrong_answer:                   reps.filter(r => r.reason === 'wrong_answer').length,
        bad_explanation:                reps.filter(r => r.reason === 'bad_explanation').length,
        off_topic:                      reps.filter(r => r.reason === 'off_topic').length,
        ambiguous_or_insufficient_clues: reps.filter(r => r.reason === 'ambiguous_or_insufficient_clues').length,
        duplicate:                      reps.filter(r => r.reason === 'duplicate').length,
        technical_issue:                reps.filter(r => r.reason === 'technical_issue').length,
        unique_users:                   uniqueUsers,
        unique_wrong_answer_users:      uniqueWrongAnswerUsers,
        unique_off_topic_users:         uniqueOffTopicUsers,
        unique_duplicate_users:         uniqueDuplicateUsers,
      });
    }

    rows.sort((a, b) => b.total - a.total || a.fingerprint.localeCompare(b.fingerprint));

    return {
      globalTotal:          reports.length,
      globalWrongAnswer,
      globalBadExpl,
      globalOffTopic,
      globalAmbiguous,
      globalDuplicate,
      globalTechnicalIssue,
      fingerprints:         rows.slice(0, limit),
    };
  }

  async getCountsForFingerprint(fingerprint: string): Promise<FingerprintCountRow> {
    const reports = [...this.store.values()].filter(r => r.fingerprint === fingerprint);

    if (reports.length === 0) {
      return {
        fingerprint,
        total:                          0,
        wrong_answer:                   0,
        bad_explanation:                0,
        off_topic:                      0,
        ambiguous_or_insufficient_clues: 0,
        duplicate:                      0,
        technical_issue:                0,
        unique_users:                   0,
        unique_wrong_answer_users:      0,
        unique_off_topic_users:         0,
        unique_duplicate_users:         0,
      };
    }

    const uniqueUsers = new Set(
      reports.filter(r => r.user_id !== null).map(r => r.user_id),
    ).size;
    const uniqueWrongAnswerUsers = new Set(
      reports.filter(r => r.user_id !== null && r.reason === 'wrong_answer').map(r => r.user_id),
    ).size;
    const uniqueOffTopicUsers = new Set(
      reports.filter(r => r.user_id !== null && r.reason === 'off_topic').map(r => r.user_id),
    ).size;
    const uniqueDuplicateUsers = new Set(
      reports.filter(r => r.user_id !== null && r.reason === 'duplicate').map(r => r.user_id),
    ).size;

    return {
      fingerprint,
      total:                          reports.length,
      wrong_answer:                   reports.filter(r => r.reason === 'wrong_answer').length,
      bad_explanation:                reports.filter(r => r.reason === 'bad_explanation').length,
      off_topic:                      reports.filter(r => r.reason === 'off_topic').length,
      ambiguous_or_insufficient_clues: reports.filter(r => r.reason === 'ambiguous_or_insufficient_clues').length,
      duplicate:                      reports.filter(r => r.reason === 'duplicate').length,
      technical_issue:                reports.filter(r => r.reason === 'technical_issue').length,
      unique_users:                   uniqueUsers,
      unique_wrong_answer_users:      uniqueWrongAnswerUsers,
      unique_off_topic_users:         uniqueOffTopicUsers,
      unique_duplicate_users:         uniqueDuplicateUsers,
    };
  }

  async getQuarantinedFingerprints(): Promise<Set<string>> {
    const fmap = new Map<string, {
      users: Set<string>;
      wrongAnswerUsers: Set<string>;
      offTopicUsers: Set<string>;
      duplicateUsers: Set<string>;
    }>();

    for (const r of this.store.values()) {
      if (!r.user_id) continue;
      if (!fmap.has(r.fingerprint)) {
        fmap.set(r.fingerprint, {
          users: new Set(),
          wrongAnswerUsers: new Set(),
          offTopicUsers: new Set(),
          duplicateUsers: new Set(),
        });
      }
      const c = fmap.get(r.fingerprint)!;
      c.users.add(r.user_id);
      if (r.reason === 'wrong_answer') c.wrongAnswerUsers.add(r.user_id);
      if (r.reason === 'off_topic')    c.offTopicUsers.add(r.user_id);
      if (r.reason === 'duplicate')    c.duplicateUsers.add(r.user_id);
    }

    const quarantined = new Set<string>();
    for (const [fp, c] of fmap.entries()) {
      const decision = isQuarantined({
        uniqueUsers:             c.users.size,
        uniqueWrongAnswerUsers:  c.wrongAnswerUsers.size,
        uniqueOffTopicUsers:     c.offTopicUsers.size,
        uniqueDuplicateUsers:    c.duplicateUsers.size,
      });
      if (decision) quarantined.add(fp);
    }
    return quarantined;
  }

  // ── Test helpers ──────────────────────────────────────────────────────────────

  _all(): QuestionReport[] {
    return [...this.store.values()];
  }

  _clear(): void {
    this.store.clear();
  }
}
