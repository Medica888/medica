export type MedicalFactRule = {
  id: string;
  domain: string;
  expected: string;
  appliesTo: RegExp[];
  contradictions: RegExp[];
  requiredSupport?: RegExp[];
  source: string;
  reviewStatus: 'seed_review_required' | 'expert_reviewed';
  lastReviewed: string;
};

const DEFAULT_SOURCE = 'Medica internal USMLE high-yield seed rule';
const DEFAULT_REVIEW_STATUS = 'seed_review_required';
const DEFAULT_LAST_REVIEWED = '2026-06-15';

export function defineRule(
  rule: Omit<MedicalFactRule, 'source' | 'reviewStatus' | 'lastReviewed'> &
    Partial<Pick<MedicalFactRule, 'source' | 'reviewStatus' | 'lastReviewed'>>,
): MedicalFactRule {
  return {
    ...rule,
    source: rule.source ?? DEFAULT_SOURCE,
    reviewStatus: rule.reviewStatus ?? DEFAULT_REVIEW_STATUS,
    lastReviewed: rule.lastReviewed ?? DEFAULT_LAST_REVIEWED,
  };
}
