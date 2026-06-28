import { randomUUID } from 'crypto';
import type { IClinicianReviewsRepository } from '../interfaces.js';
import type {
  ClinicianReview,
  ClinicianReviewMetrics,
  ClinicianReviewPriority,
  ClinicianReviewStatus,
} from '../../types/index.js';

const PRIORITY_ORDER: Record<ClinicianReviewPriority, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
};

export class InMemoryClinicianReviewsRepository implements IClinicianReviewsRepository {
  private _reviews = new Map<string, ClinicianReview>();

  async create(data: {
    question_id:          string;
    review_priority:      ClinicianReviewPriority;
    review_reason:        string;
    review_due_at:        Date;
    review_status?:       ClinicianReviewStatus;
    assigned_reviewer_id?: string | null;
  }): Promise<ClinicianReview> {
    const now = new Date();
    const review: ClinicianReview = {
      id:                   randomUUID(),
      question_id:          data.question_id,
      review_priority:      data.review_priority,
      review_reason:        data.review_reason,
      review_due_at:        data.review_due_at,
      review_status:        data.review_status ?? 'pending',
      assigned_reviewer_id: data.assigned_reviewer_id ?? null,
      assigned_at:          null,
      reviewed_at:          null,
      reviewer_notes:       null,
      created_at:           now,
      updated_at:           now,
    };
    this._reviews.set(review.id, review);
    return review;
  }

  async findLatestActiveByQuestionId(questionId: string): Promise<ClinicianReview | null> {
    const active = [...this._reviews.values()]
      .filter(r => r.question_id === questionId &&
                   (r.review_status === 'pending' || r.review_status === 'in_review'))
      .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    return active[0] ?? null;
  }

  async findQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
    limit?:    number;
    offset?:   number;
  }): Promise<ClinicianReview[]> {
    const now = new Date();
    let results = [...this._reviews.values()];
    if (params.status)   results = results.filter(r => r.review_status   === params.status);
    if (params.priority) results = results.filter(r => r.review_priority === params.priority);
    if (params.overdue === true) {
      results = results.filter(r =>
        (r.review_status === 'pending' || r.review_status === 'in_review') &&
        r.review_due_at < now,
      );
    }
    results.sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.review_priority] - PRIORITY_ORDER[b.review_priority];
      if (pDiff !== 0) return pDiff;
      return a.review_due_at.getTime() - b.review_due_at.getTime();
    });
    const offset = params.offset ?? 0;
    const limit  = params.limit  ?? 50;
    return results.slice(offset, offset + limit);
  }

  async countQueue(params: {
    status?:   ClinicianReviewStatus;
    priority?: ClinicianReviewPriority;
    overdue?:  boolean;
  }): Promise<number> {
    const now = new Date();
    let results = [...this._reviews.values()];
    if (params.status)   results = results.filter(r => r.review_status   === params.status);
    if (params.priority) results = results.filter(r => r.review_priority === params.priority);
    if (params.overdue === true) {
      results = results.filter(r =>
        (r.review_status === 'pending' || r.review_status === 'in_review') &&
        r.review_due_at < now,
      );
    }
    return results.length;
  }

  async update(id: string, data: {
    review_status?:       ClinicianReviewStatus;
    review_priority?:     ClinicianReviewPriority;
    review_reason?:       string;
    review_due_at?:       Date;
    assigned_reviewer_id?: string | null;
    reviewed_at?:         Date | null;
    assigned_at?:         Date | null;
    reviewer_notes?:      string | null;
  }): Promise<ClinicianReview | null> {
    const existing = this._reviews.get(id);
    if (!existing) return null;
    const updated: ClinicianReview = { ...existing, updated_at: new Date() };
    if (data.review_status       !== undefined) updated.review_status       = data.review_status;
    if (data.review_priority     !== undefined) updated.review_priority     = data.review_priority;
    if (data.review_reason       !== undefined) updated.review_reason       = data.review_reason;
    if (data.review_due_at       !== undefined) updated.review_due_at       = data.review_due_at;
    if (data.assigned_reviewer_id !== undefined) updated.assigned_reviewer_id = data.assigned_reviewer_id;
    if (data.reviewed_at         !== undefined) updated.reviewed_at         = data.reviewed_at;
    if (data.assigned_at         !== undefined) updated.assigned_at         = data.assigned_at;
    if (data.reviewer_notes      !== undefined) updated.reviewer_notes      = data.reviewer_notes;
    this._reviews.set(id, updated);
    return updated;
  }

  async getMetrics(): Promise<ClinicianReviewMetrics> {
    const now = new Date();
    const all      = [...this._reviews.values()];
    const active   = all.filter(r => r.review_status === 'pending' || r.review_status === 'in_review');
    const overdue  = active.filter(r => r.review_due_at < now);
    const due24h   = active.filter(r => r.review_due_at >= now &&
                                        r.review_due_at <= new Date(now.getTime() + 24 * 3600 * 1000));
    const completed = all.filter(r =>
      r.review_status === 'approved' ||
      r.review_status === 'changes_requested' ||
      r.review_status === 'rejected',
    );

    const ageDays = active.map(r => (now.getTime() - r.created_at.getTime()) / 86400000);
    const avgAge  = ageDays.length > 0
      ? Math.round((ageDays.reduce((s, v) => s + v, 0) / ageDays.length) * 100) / 100
      : null;

    return {
      pending:          active.filter(r => r.review_status === 'pending').length,
      in_review:        active.filter(r => r.review_status === 'in_review').length,
      overdue:          overdue.length,
      due_in_24h:       due24h.length,
      average_age_days: avgAge,
      critical_overdue: overdue.filter(r => r.review_priority === 'critical').length,
      high_overdue:     overdue.filter(r => r.review_priority === 'high').length,
      completion_rate:  all.length > 0
        ? Math.round((completed.length / all.length) * 10000) / 100
        : null,
    };
  }
}
