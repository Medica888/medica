import type { IClinicianReviewsRepository } from '../repositories/interfaces.js';
import type {
  ClinicianReview,
  ClinicianReviewMetrics,
  ClinicianReviewPriority,
  ClinicianReviewStatus,
} from '../types/index.js';

// SLA deadlines by priority
const SLA_HOURS: Record<ClinicianReviewPriority, number> = {
  critical: 24,
  high:     72,
  medium:   7  * 24,  // 168 h
  low:      14 * 24,  // 336 h
};

const PRIORITY_ORDER: Record<ClinicianReviewPriority, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

function shouldEscalate(
  current:  ClinicianReviewPriority,
  proposed: ClinicianReviewPriority,
): boolean {
  return PRIORITY_ORDER[proposed] < PRIORITY_ORDER[current];
}

/**
 * Deterministic 10% sampling — stable hash of questionId % 10 === 0.
 * Does NOT use Math.random() so the result never changes across calls.
 */
export function isDeterministicSample(questionId: string): boolean {
  let hash = 0;
  for (let i = 0; i < questionId.length; i++) {
    hash = ((hash * 31) + questionId.charCodeAt(i)) >>> 0;
  }
  return hash % 10 === 0;
}

/**
 * Decides whether a question needs clinician review and at what priority
 * when it transitions to 'approved' or 'restored'.
 *
 * wrong_answer / duplicate reports are handled through a separate trigger
 * in the question-reports route because they arrive independently.
 */
export function computeSamplingDecision(
  questionId:  string,
  difficulty:  string,
  reportCount: number,
  bankStatus:  string,
): { required: boolean; priority: ClinicianReviewPriority; reason: string } | null {
  if (difficulty === 'UWorld Challenge') {
    return { required: true, priority: 'high', reason: 'UWorld Challenge difficulty — 100% clinician review required' };
  }
  if (difficulty === 'NBME Difficult') {
    return { required: true, priority: 'high', reason: 'NBME Difficult difficulty — 100% clinician review required' };
  }
  if (bankStatus === 'restored') {
    return { required: true, priority: 'high', reason: 'Restored from quarantine — clinician adjudication required' };
  }
  if (reportCount > 0) {
    return {
      required: true,
      priority: 'medium',
      reason: `Approved with ${reportCount} prior report(s) — quality review required`,
    };
  }
  if (isDeterministicSample(questionId)) {
    return { required: true, priority: 'low', reason: 'Deterministic 10% quality sample' };
  }
  return null;
}

export function computeDueAt(priority: ClinicianReviewPriority, from = new Date()): Date {
  return new Date(from.getTime() + SLA_HOURS[priority] * 3600 * 1000);
}

export class ClinicianReviewService {
  constructor(private repo: IClinicianReviewsRepository) {}

  /**
   * Creates a review record or escalates an existing active one if
   * the proposed priority is higher than the current priority.
   * Lower-priority proposals are silently dropped (no downgrade).
   */
  async createOrEscalate(
    questionId: string,
    priority:   ClinicianReviewPriority,
    reason:     string,
  ): Promise<void> {
    const existing = await this.repo.findLatestActiveByQuestionId(questionId);
    if (!existing) {
      await this.repo.create({
        question_id:     questionId,
        review_priority: priority,
        review_reason:   reason,
        review_due_at:   computeDueAt(priority),
      });
    } else if (shouldEscalate(existing.review_priority, priority)) {
      await this.repo.update(existing.id, {
        review_priority: priority,
        review_reason:   reason,
        review_due_at:   computeDueAt(priority),
      });
    }
    // Same or lower priority → no change; prevents unnecessary record churn
  }

  async getQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
    limit?:    number;
    offset?:   number;
  }): Promise<{ reviews: ClinicianReview[]; total: number }> {
    const [reviews, total] = await Promise.all([
      this.repo.findQueue(params),
      this.repo.countQueue({ status: params.status, priority: params.priority, overdue: params.overdue }),
    ]);
    return { reviews, total };
  }

  async getMetrics(): Promise<ClinicianReviewMetrics> {
    return this.repo.getMetrics();
  }

  async updateReview(
    id:   string,
    data: {
      review_status?:       ClinicianReviewStatus;
      assigned_reviewer_id?: string | null;
      reviewer_notes?:       string | null;
    },
  ): Promise<ClinicianReview | null> {
    const now = new Date();
    const COMPLETED = new Set<ClinicianReviewStatus>(['approved', 'changes_requested', 'rejected']);
    const update: Parameters<typeof this.repo.update>[1] = { ...data };
    if (data.review_status && COMPLETED.has(data.review_status)) {
      update.reviewed_at = now;
    }
    if (data.assigned_reviewer_id != null && data.review_status === 'in_review') {
      update.assigned_at = now;
    }
    return this.repo.update(id, update);
  }
}
