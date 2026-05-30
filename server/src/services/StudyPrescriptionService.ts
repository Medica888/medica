import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type { StudyPrescription, PrescriptionConcept, UserConceptMastery } from '../types/index.js';
import { MIN_FOR_ADAPTIVE, sortByWeakness } from './adaptiveMasteryUtils.js';

// ── Tier boundaries (4-way; ≥ ONTRACK excluded from prescription) ─────────────
const TIER_PRIORITY_MAX   = 0.65;
const TIER_FOCUS_MAX      = 0.75;
const TIER_REINFORCED_MAX = 0.85; // concepts ≥ this are on-track and not prescribed

// Per-tier caps — limits the lists returned (and drives the estimate math)
const MAX_PRIORITY   = 8;
const MAX_FOCUS      = 6;
const MAX_REINFORCED = 5;

// Coefficients (tunable defaults — documented in API response)
const MIN_PER_PRIORITY   = 5;  // estimated minutes per priority concept
const MIN_PER_FOCUS      = 3;
const MIN_PER_REINFORCED = 2;
const Q_PER_PRIORITY     = 5;  // recommended practice questions per priority concept
const Q_PER_FOCUS        = 3;
const FC_PER_PRIORITY    = 3;  // recommended flashcards per priority concept
const FC_PER_FOCUS       = 2;
const FC_PER_REINFORCED  = 1;

const RANDOM_PRESCRIPTION: StudyPrescription = {
  strategy:              'random',
  enabled:               false,
  priority:              [],
  focus:                 [],
  reinforced:            [],
  estimatedStudyTime:    0,
  recommendedQuestions:  10,
  recommendedFlashcards: 10,
};

function makeRecommendation(
  row:  UserConceptMastery,
  tier: 'priority' | 'focus' | 'reinforced',
): string {
  if (tier === 'priority') {
    if (row.recent_incorrect_count >= 3) return 'Repeated errors — immediate targeted review needed';
    if (row.confidence_score < 0.4)      return 'Build foundational understanding — review core mechanisms';
    if (row.mastery_score === 0)          return 'Never answered correctly — start from basics';
    return 'Below passing threshold — prioritize in next session';
  }
  if (tier === 'focus') {
    if (row.recent_incorrect_count >= 2) return 'Close to passing — address recurring errors';
    return 'Developing — reinforce with targeted practice questions';
  }
  return 'Solid understanding — maintain with spaced review';
}

function toConcept(row: UserConceptMastery, name: string, tier: 'priority' | 'focus' | 'reinforced'): PrescriptionConcept {
  return {
    name,
    masteryScore:    Math.round(row.mastery_score    * 10000) / 10000,
    confidence:      Math.round(row.confidence_score * 10000) / 10000,
    attempts:        row.attempts,
    recentIncorrect: row.recent_incorrect_count,
    recommendation:  makeRecommendation(row, tier),
  };
}

export class StudyPrescriptionService {
  constructor(
    private mastery:  IUserConceptMasteryRepository,
    private concepts: IConceptsRepository,
  ) {}

  async getPrescription(userId: string): Promise<StudyPrescription> {
    const rows = await this.mastery.findByUserId(userId);

    if (rows.length < MIN_FOR_ADAPTIVE) {
      return {
        ...RANDOM_PRESCRIPTION,
        reason: `Only ${rows.length} concept(s) tracked — ${MIN_FOR_ADAPTIVE} needed for prescription.`,
      };
    }

    // Sort weakest-first; ties broken by highest recent_incorrect_count
    const sorted   = sortByWeakness(rows);
    // Resolve all names in parallel — no N+1
    const resolved = await Promise.all(sorted.map((r) => this.concepts.findById(r.concept_id)));

    const priority:   PrescriptionConcept[] = [];
    const focus:      PrescriptionConcept[] = [];
    const reinforced: PrescriptionConcept[] = [];

    for (let i = 0; i < sorted.length; i++) {
      const row   = sorted[i]!;
      const name  = resolved[i]?.name;
      if (!name) continue;

      const s = row.mastery_score;
      // Each branch is exclusive to its score range — caps only limit list size,
      // not which tier a concept belongs to (no overflow into lower-priority tiers).
      if (s < TIER_PRIORITY_MAX) {
        if (priority.length < MAX_PRIORITY) priority.push(toConcept(row, name, 'priority'));
      } else if (s < TIER_FOCUS_MAX) {
        if (focus.length < MAX_FOCUS) focus.push(toConcept(row, name, 'focus'));
      } else if (s < TIER_REINFORCED_MAX) {
        if (reinforced.length < MAX_REINFORCED) reinforced.push(toConcept(row, name, 'reinforced'));
      }
      // s >= TIER_REINFORCED_MAX → on-track, excluded
    }

    const estimatedStudyTime    = priority.length * MIN_PER_PRIORITY +
                                  focus.length    * MIN_PER_FOCUS    +
                                  reinforced.length * MIN_PER_REINFORCED;
    const recommendedQuestions  = Math.min(
      priority.length * Q_PER_PRIORITY + focus.length * Q_PER_FOCUS, 40,
    );
    const recommendedFlashcards = Math.min(
      priority.length * FC_PER_PRIORITY + focus.length * FC_PER_FOCUS + reinforced.length * FC_PER_REINFORCED, 30,
    );

    return {
      strategy:  'adaptive',
      enabled:   true,
      priority,
      focus,
      reinforced,
      estimatedStudyTime,
      recommendedQuestions,
      recommendedFlashcards,
    };
  }
}
