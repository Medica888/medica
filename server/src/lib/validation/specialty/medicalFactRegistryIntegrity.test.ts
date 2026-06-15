import { describe, expect, it } from 'vitest';
import { medicalFactRules } from './medicalFactRegistry.js';

const allowedReviewStatuses = new Set(['seed_review_required', 'expert_reviewed']);
const idPattern = /^[a-z0-9_]+$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

describe('medical fact registry integrity', () => {
  it('has unique stable ids', () => {
    const ids = medicalFactRules.map(rule => rule.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(idPattern);
    }
  });

  it('has required governance metadata on every rule', () => {
    for (const rule of medicalFactRules) {
      expect(rule.domain.trim()).not.toBe('');
      expect(rule.source.trim()).not.toBe('');
      expect(allowedReviewStatuses.has(rule.reviewStatus)).toBe(true);
      expect(rule.lastReviewed).toMatch(isoDatePattern);
      expect(Number.isNaN(Date.parse(rule.lastReviewed))).toBe(false);
    }
  });

  it('has usable matching and contradiction definitions on every rule', () => {
    for (const rule of medicalFactRules) {
      expect(rule.expected.trim()).not.toBe('');
      expect(rule.appliesTo.length).toBeGreaterThan(0);
      expect(rule.contradictions.length).toBeGreaterThan(0);

      for (const pattern of [...rule.appliesTo, ...rule.contradictions, ...(rule.requiredSupport || [])]) {
        expect(pattern).toBeInstanceOf(RegExp);
        expect(pattern.source.trim()).not.toBe('');
      }
    }
  });

  it('does not duplicate expected fact statements', () => {
    const expectedStatements = medicalFactRules.map(rule => rule.expected.trim().toLowerCase());
    const uniqueExpectedStatements = new Set(expectedStatements);

    expect(uniqueExpectedStatements.size).toBe(expectedStatements.length);
  });

  it('covers the major USMLE medical domains with a broad rule set', () => {
    const domains = new Set(medicalFactRules.map(rule => rule.domain));
    const expectedDomains = [
      'Cardiology',
      'Pulmonary',
      'Renal',
      'Endocrine',
      'Gastrointestinal',
      'Neurology',
      'Microbiology',
      'Immunology',
      'Hematology',
      'Reproductive',
      'Rheumatology',
      'Dermatology',
      'Psychiatry',
      'Pharmacology',
      'Biochemistry',
      'Genetics',
    ];

    expect(medicalFactRules.length).toBeGreaterThanOrEqual(100);
    for (const domain of expectedDomains) {
      expect(domains.has(domain)).toBe(true);
    }
  });
});
