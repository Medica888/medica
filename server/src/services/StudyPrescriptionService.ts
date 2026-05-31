import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type {
  StudyPrescription, PrescriptionConcept, UserConceptMastery,
  ReadinessScore, ReadinessStatus,
} from '../types/index.js';
import {
  MIN_FOR_ADAPTIVE, sortByWeakness, adaptiveDisabledReason,
  TIER_WEAK as TIER_PRIORITY_MAX,
  TIER_MEDIUM as TIER_FOCUS_MAX,
  TIER_REINFORCED as TIER_REINFORCED_MAX,
} from './adaptiveMasteryUtils.js';

// Readiness-aware list caps.
// Struggling users get more priority concepts; prepared users shift toward focus/reinforced.
const CAPS_BY_STATUS: Record<ReadinessStatus, { priority: number; focus: number; reinforced: number }> = {
  'Needs Intensive Review': { priority: 10, focus: 5,  reinforced: 2  },
  'Developing':             { priority: 8,  focus: 6,  reinforced: 5  },  // legacy defaults
  'Approaching Readiness':  { priority: 6,  focus: 8,  reinforced: 6  },
  'Exam Ready':             { priority: 4,  focus: 8,  reinforced: 8  },
};

// Per-concept time/question/flashcard multipliers — fixed regardless of readiness
const MIN_PER_PRIORITY   = 5;
const MIN_PER_FOCUS      = 3;
const MIN_PER_REINFORCED = 2;
const Q_PER_PRIORITY     = 5;
const Q_PER_FOCUS        = 3;
const FC_PER_PRIORITY    = 3;
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

function toConcept(row: UserConceptMastery, name: string, tier: 'priority' | 'focus' | 'reinforced', subject?: string): PrescriptionConcept {
  return {
    name,
    subject,
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

  async getPrescription(
    userId:          string,
    readinessScore?: ReadinessScore,
    rows?:           UserConceptMastery[],
  ): Promise<StudyPrescription> {
    const masteryRows = rows ?? await this.mastery.findByUserId(userId);

    if (masteryRows.length < MIN_FOR_ADAPTIVE) {
      return {
        ...RANDOM_PRESCRIPTION,
        reason: adaptiveDisabledReason(masteryRows.length),
      };
    }

    const caps       = readinessScore ? CAPS_BY_STATUS[readinessScore.status] : CAPS_BY_STATUS['Developing'];
    const sorted     = sortByWeakness(masteryRows);
    const fetched    = await this.concepts.findManyById(sorted.map((r) => r.concept_id));
    const conceptMap = new Map(fetched.map((c) => [c.id, c]));

    const priority:   PrescriptionConcept[] = [];
    const focus:      PrescriptionConcept[] = [];
    const reinforced: PrescriptionConcept[] = [];

    for (const row of sorted) {
      const concept = conceptMap.get(row.concept_id);
      const name    = concept?.name;
      if (!name) continue;

      const s = row.mastery_score;
      if (s < TIER_PRIORITY_MAX) {
        if (priority.length < caps.priority) priority.push(toConcept(row, name, 'priority', concept?.subject));
      } else if (s < TIER_FOCUS_MAX) {
        if (focus.length < caps.focus) focus.push(toConcept(row, name, 'focus', concept?.subject));
      } else if (s < TIER_REINFORCED_MAX) {
        if (reinforced.length < caps.reinforced) reinforced.push(toConcept(row, name, 'reinforced', concept?.subject));
      }
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
