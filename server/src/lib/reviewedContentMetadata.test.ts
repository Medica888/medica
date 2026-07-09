import { describe, expect, it } from 'vitest';
import {
  getCommercialReadinessReasons,
  isCommerciallyContentReady,
  mergeReviewedContentMetadataIntoBody,
  normalizeReviewedContentMetadata,
} from './reviewedContentMetadata.js';

describe('reviewed content metadata', () => {
  it('defaults approved authored content to validator_passed, not expert-reviewed', () => {
    const metadata = normalizeReviewedContentMetadata(undefined, {
      bankStatus: 'approved',
      source: 'authored',
      body: { sourceRefs: ['First Aid 2026'] },
    });

    expect(metadata.reviewStatus).toBe('validator_passed');
    expect(metadata.provenance.authorType).toBe('human');
    expect(metadata.sourceRefs).toEqual(['First Aid 2026']);
  });

  it('requires source references before content can be commercially ready', () => {
    expect(isCommerciallyContentReady({
      bankStatus: 'approved',
      difficulty: 'Balanced',
      reviewMetadata: {
        reviewStatus: 'source_checked',
        medicalAccuracyStatus: 'pass',
      },
    })).toBe(false);
  });

  it('requires medical accuracy pass before content can be commercially ready', () => {
    expect(isCommerciallyContentReady({
      bankStatus: 'approved',
      difficulty: 'Balanced',
      reviewMetadata: {
        reviewStatus: 'source_checked',
        sourceRefs: ['USMLE Content Outline'],
        medicalAccuracyStatus: 'minor_issue',
      },
    })).toBe(false);
  });

  it('allows source-checked normal-difficulty content with clean rubric status', () => {
    expect(isCommerciallyContentReady({
      bankStatus: 'approved',
      difficulty: 'Balanced',
      reviewMetadata: {
        reviewStatus: 'source_checked',
        sourceRefs: ['USMLE Content Outline'],
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'minor_issue',
      },
    })).toBe(true);
  });

  it('requires expert review for hard exam-style difficulties', () => {
    const base = {
      bankStatus: 'approved',
      difficulty: 'NBME Difficult',
      reviewMetadata: {
        sourceRefs: ['USMLE Content Outline'],
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'pass',
      },
    };

    expect(isCommerciallyContentReady({
      ...base,
      reviewMetadata: { ...base.reviewMetadata, reviewStatus: 'source_checked' },
    })).toBe(false);
    expect(isCommerciallyContentReady({
      ...base,
      reviewMetadata: { ...base.reviewMetadata, reviewStatus: 'expert_reviewed' },
    })).toBe(true);
  });

  it('explains why content is not commercially ready', () => {
    expect(getCommercialReadinessReasons({
      bankStatus: 'approved',
      difficulty: 'NBME Difficult',
      reviewMetadata: {
        reviewStatus: 'source_checked',
        sourceRefs: [],
        medicalAccuracyStatus: 'minor_issue',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'fail',
      },
    })).toEqual([
      'missing_source_refs',
      'medical_accuracy_not_pass',
      'difficulty_calibration_blocked',
      'hard_mode_needs_expert_review',
    ]);
  });

  it('returns no readiness reasons for commercially ready content', () => {
    expect(getCommercialReadinessReasons({
      bankStatus: 'approved',
      difficulty: 'Balanced',
      reviewMetadata: {
        reviewStatus: 'source_checked',
        sourceRefs: ['USMLE Content Outline'],
        medicalAccuracyStatus: 'pass',
        itemWritingStatus: 'pass',
        difficultyCalibrationStatus: 'pass',
      },
    })).toEqual([]);
  });

  it('merges normalized metadata into the body without dropping question content', () => {
    const metadata = normalizeReviewedContentMetadata({
      reviewStatus: 'expert_reviewed',
      sourceRefs: ['Pathoma'],
      medicalAccuracyStatus: 'pass',
    }, { bankStatus: 'approved', source: 'authored' });

    expect(mergeReviewedContentMetadataIntoBody({ stem: 'A clinical stem' }, metadata)).toMatchObject({
      stem: 'A clinical stem',
      sourceRefs: ['Pathoma'],
      reviewStatus: 'expert_reviewed',
      reviewMetadata: {
        reviewStatus: 'expert_reviewed',
        medicalAccuracyStatus: 'pass',
      },
    });
  });
});
