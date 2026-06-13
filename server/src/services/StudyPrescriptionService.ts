import type { IUserConceptMasteryRepository, IConceptsRepository } from '../repositories/interfaces.js';
import type {
  StudyPrescription, PrescriptionConcept, UserConceptMastery,
  ReadinessScore, ReadinessStatus, DailyStudyPlan, DailyPlanConceptReview,
  Concept, MasteryTier,
} from '../types/index.js';
import {
  MIN_FOR_ADAPTIVE, sortByWeakness, adaptiveDisabledReason,
} from './adaptiveMasteryUtils.js';

const P1_MAX = 0.50;
const P2_MAX = 0.70;
const P3_MAX = 0.80;

// Readiness-aware list caps.
// Struggling users get more P1 concepts; prepared users shift toward P2/P3.
const CAPS_BY_STATUS: Record<ReadinessStatus, { p1: number; p2: number; p3: number }> = {
  'Needs Intensive Review': { p1: 10, p2: 5, p3: 2 },
  'Developing':             { p1: 8,  p2: 6, p3: 5 },
  'Approaching Readiness':  { p1: 6,  p2: 8, p3: 6 },
  'Exam Ready':             { p1: 4,  p2: 8, p3: 8 },
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
const DAILY_REVIEW_CAP   = 5;
const MIN_PER_QUESTION   = 2;
const MIN_PER_FLASHCARD  = 1;
const MIN_PER_REVIEW     = 3;

const RANDOM_PRESCRIPTION: StudyPrescription = {
  strategy:              'random',
  enabled:               false,
  p1:                    [],
  p2:                    [],
  p3:                    [],
  priority:              [],
  focus:                 [],
  reinforced:            [],
  estimatedStudyTime:    0,
  recommendedQuestions:  10,
  recommendedFlashcards: 10,
};

// ── Deterministic USMLE taxonomy inference from concept metadata ──────────────
// Ordered pairs (substring-to-match, canonical-area). System is checked first
// (more specific), subject second.  No AI calls, no extra queries.

const SYSTEM_TO_CONTENT_AREA: [string, string][] = [
  ['cardiovascular', 'Cardiovascular System'],
  ['respiratory',    'Respiratory System'],
  ['pulmonary',      'Respiratory System'],
  ['gastrointestinal', 'Gastrointestinal System'],
  ['renal',          'Renal & Urinary System'],
  ['urinary',        'Renal & Urinary System'],
  ['nervous',        'Nervous System & Special Senses'],
  ['neurolog',       'Nervous System & Special Senses'],
  ['musculoskeletal','Musculoskeletal System'],
  ['skin',           'Skin & Subcutaneous Tissue'],
  ['endocrine',      'Endocrine System'],
  ['hematol',        'Blood & Lymphoreticular System'],
  ['immune',         'Immune System'],
  ['reproductive',   'Female and Transgender Reproductive System & Breast'],
  ['pregnancy',      'Pregnancy, Childbirth, & the Puerperium'],
  ['behavioral',     'Behavioral Health'],
  ['psychiatric',    'Behavioral Health'],
];

const SUBJECT_TO_CONTENT_AREA: [string, string][] = [
  ['cardiol',         'Cardiovascular System'],
  ['pulmonol',        'Respiratory System'],
  ['gastroenterol',   'Gastrointestinal System'],
  ['nephrol',         'Renal & Urinary System'],
  ['neurol',          'Nervous System & Special Senses'],
  ['endocrinol',      'Endocrine System'],
  ['hematol',         'Blood & Lymphoreticular System'],
  ['immunol',         'Immune System'],
  ['dermatol',        'Skin & Subcutaneous Tissue'],
  ['psychiatr',       'Behavioral Health'],
  ['microbiol',       'Multisystem Processes & Disorders'],
  ['biochem',         'Multisystem Processes & Disorders'],
  ['genetic',         'Multisystem Processes & Disorders'],
  ['oncol',           'Multisystem Processes & Disorders'],
  ['biostatist',      'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  ['epidemiol',       'Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
];

function conceptContentArea(concept: Concept): string {
  const sys = (concept.system  || '').toLowerCase();
  const sub = (concept.subject || '').toLowerCase();
  for (const [key, area] of SYSTEM_TO_CONTENT_AREA) { if (sys.includes(key)) return area; }
  for (const [key, area] of SUBJECT_TO_CONTENT_AREA) { if (sub.includes(key)) return area; }
  return '';
}

function conceptPhysicianTask(concept: Concept): string {
  const sub  = (concept.subject || '').toLowerCase();
  const name = (concept.name    || '').toLowerCase();
  if (sub.includes('pharmacol') || name.includes('pharmacol') || name.includes('medication') || name.includes('adverse') || name.includes('drug '))
    return 'Patient Care: Pharmacotherapy';
  if (name.includes('diagnos') || name.includes('identif'))
    return 'Patient Care: Diagnosis';
  if (name.includes(' lab') || name.includes('imaging') || name.includes('interpret') || name.includes('ecg') || name.includes('ekg'))
    return 'Patient Care: Laboratory and Diagnostic Studies';
  if (name.includes('complicat') || name.includes('prognos') || name.includes('outcome'))
    return 'Patient Care: Prognosis and Outcome';
  if (name.includes('prevent') || name.includes('screen') || name.includes('vaccine'))
    return 'Patient Care: Health Maintenance and Disease Prevention';
  return 'Medical Knowledge: Applying Foundational Science Concepts';
}

// recent_incorrect_count is a lifetime cumulative total (attempts − correct), not a
// windowed recent count. Thresholds here are calibrated for cumulative totals.
function makeRecommendation(
  row:  UserConceptMastery,
  tier: 'p1' | 'p2' | 'p3',
): string {
  if (tier === 'p1') {
    if (row.recent_incorrect_count >= 5) return 'Persistent weak area — review core mechanisms';
    if (row.recent_incorrect_count >= 3) return 'Recurring errors — address weak points before they solidify';
    if (row.confidence_score < 0.4)      return 'Build foundational understanding — review core mechanisms';
    if (row.mastery_score === 0)          return 'Never answered correctly — start from basics';
    return 'P1 concept - rebuild before the next mixed session';
  }
  if (tier === 'p2') {
    if (row.recent_incorrect_count >= 4) return 'Recurring errors — address weak points with targeted practice';
    return 'Developing — reinforce with targeted practice questions';
  }
  return 'Solid understanding — maintain with spaced review';
}

function toConcept(row: UserConceptMastery, name: string, tier: 'p1' | 'p2' | 'p3', subject?: string): PrescriptionConcept {
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

type ReviewTier = MasteryTier;

interface PrescriptionBuild {
  rx: StudyPrescription;
  candidates: {
    row: UserConceptMastery;
    concept: Concept;
    tier: ReviewTier;
  }[];
}

function tierFor(score: number): ReviewTier {
  if (score < P1_MAX) return 'p1';
  if (score < P2_MAX) return 'p2';
  if (score < P3_MAX) return 'p3';
  return 'ontrack';
}

// recent_incorrect_count is cumulative lifetime total — threshold of 3 avoids
// flagging every concept that has ever been answered wrong even once.
function dailyReason(row: UserConceptMastery): string {
  if (row.next_review_at && row.next_review_at.getTime() <= Date.now()) return 'Due for spaced review';
  if (row.mastery_score < P1_MAX && row.recent_incorrect_count >= 3 && row.confidence_score < 0.5) {
    return 'Low mastery, low confidence, and accumulated wrong answers';
  }
  if (row.mastery_score < P1_MAX && row.recent_incorrect_count >= 3) {
    return 'Low mastery with accumulated wrong answers';
  }
  if (row.mastery_score < P1_MAX) return 'Low mastery needs targeted review';
  if (row.confidence_score < 0.5) return 'Developing concept with low confidence';
  if (row.recent_incorrect_count >= 3) return 'Wrong answers recorded — reinforce with practice';
  if (row.recent_incorrect_count > 0)  return 'Recent wrong answers — reinforce to prevent regression';
  return 'Developing concept needs spaced reinforcement';
}

function summarizeDailyPlan(reviews: DailyPlanConceptReview[]): string {
  if (!reviews.length) return 'No urgent concept reviews today. Maintain progress with light mixed practice.';
  const subjects = [...new Set(reviews.map((r) => r.subject).filter(Boolean))];
  const areas    = [...new Set(reviews.flatMap((r) => r.usmleContentArea ? [r.usmleContentArea] : []))];
  const tasks    = [...new Set(reviews.flatMap((r) => r.physicianTask    ? [r.physicianTask]    : []))];
  const primary  = subjects.slice(0, 2).join(' and ');
  const priorityCount = reviews.filter((r) => r.priority === 'p1' || r.priority === 'priority').length;
  // Use richer summary only when taxonomy is unambiguous (single area + single task)
  if (areas.length === 1 && tasks.length === 1 && priorityCount > 0) {
    const areaLabel = areas[0]!.replace(/ System$/i, '').replace(/ & Special Senses$/i, '');
    const taskLabel = tasks[0]!.replace(/^Patient Care:\s*/i, '').replace(/^Medical Knowledge:\s*/i, '');
    return `Focus today on ${areaLabel.toLowerCase()} ${taskLabel.toLowerCase()} - P1 items need attention.`;
  }
  if (primary && priorityCount > 0) return `Focus today on weak ${primary} concepts.`;
  if (primary) return `Reinforce developing ${primary} concepts today.`;
  return 'Focus today on your weakest tracked concepts.';
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
    return (await this.buildPrescription(userId, readinessScore, rows)).rx;
  }

  async getDailyPlan(
    userId:          string,
    readinessScore:  ReadinessScore,
    rows?:           UserConceptMastery[],
  ): Promise<DailyStudyPlan> {
    const { rx, candidates } = await this.buildPrescription(userId, readinessScore, rows);
    const now = Date.now();
    const ranked = [...candidates].sort((a, b) => {
      const aDue = a.row.next_review_at && a.row.next_review_at.getTime() <= now ? 0 : 1;
      const bDue = b.row.next_review_at && b.row.next_review_at.getTime() <= now ? 0 : 1;
      if (aDue !== bDue) return aDue - bDue;
      const tierDiff = tierRank(a.tier) - tierRank(b.tier);
      if (tierDiff !== 0) return tierDiff;
      if (a.row.mastery_score !== b.row.mastery_score) return a.row.mastery_score - b.row.mastery_score;
      if (a.row.confidence_score !== b.row.confidence_score) return a.row.confidence_score - b.row.confidence_score;
      return b.row.recent_incorrect_count - a.row.recent_incorrect_count;
    });

    const conceptReviews: DailyPlanConceptReview[] = ranked
      .slice(0, DAILY_REVIEW_CAP)
      .map(({ row, concept, tier }) => ({
        conceptId: concept.id,
        name:      concept.name,
        subject:   concept.subject,
        priority:  tier,
        reason:    dailyReason(row),
        nextReviewAt: row.next_review_at ? row.next_review_at.toISOString() : null,
        reviewIntervalDays: row.review_interval_days,
        usmleContentArea: conceptContentArea(concept) || undefined,
        physicianTask:    conceptPhysicianTask(concept) || undefined,
      }));

    const focusSubjects = [...new Set(conceptReviews.map((r) => r.subject).filter(Boolean))].slice(0, 3);
    const focusUsmleContentAreas = [...new Set(conceptReviews.flatMap((r) => r.usmleContentArea ? [r.usmleContentArea] : []))].slice(0, 3);
    const focusPhysicianTasks    = [...new Set(conceptReviews.flatMap((r) => r.physicianTask    ? [r.physicianTask]    : []))].slice(0, 3);

    const estimatedMinutes =
      rx.recommendedQuestions  * MIN_PER_QUESTION +
      rx.recommendedFlashcards * MIN_PER_FLASHCARD +
      conceptReviews.length    * MIN_PER_REVIEW;

    return {
      date:                  new Date().toISOString().slice(0, 10),
      readinessStatus:       readinessScore.status,
      estimatedMinutes,
      recommendedQuestions:  rx.recommendedQuestions,
      recommendedFlashcards: rx.recommendedFlashcards,
      conceptReviews,
      focusSubjects,
      focusUsmleContentAreas,
      focusPhysicianTasks,
      summary:               summarizeDailyPlan(conceptReviews),
    };
  }

  private async buildPrescription(
    userId:          string,
    readinessScore?: ReadinessScore,
    rows?:           UserConceptMastery[],
  ): Promise<PrescriptionBuild> {
    const masteryRows = rows ?? await this.mastery.findByUserId(userId);

    if (masteryRows.length < MIN_FOR_ADAPTIVE) {
      return {
        rx: {
          ...RANDOM_PRESCRIPTION,
          reason: adaptiveDisabledReason(masteryRows.length),
        },
        candidates: [],
      };
    }

    const caps       = readinessScore ? CAPS_BY_STATUS[readinessScore.status] : CAPS_BY_STATUS['Developing'];
    const sorted     = sortByWeakness(masteryRows);
    const fetched    = await this.concepts.findManyById(sorted.map((r) => r.concept_id));
    const conceptMap = new Map(fetched.map((c) => [c.id, c]));

    const p1: PrescriptionConcept[] = [];
    const p2: PrescriptionConcept[] = [];
    const p3: PrescriptionConcept[] = [];
    const candidates: PrescriptionBuild['candidates'] = [];

    for (const row of sorted) {
      const concept = conceptMap.get(row.concept_id);
      if (!concept) continue;
      const name = concept.name;

      const tier = tierFor(row.mastery_score);
      candidates.push({ row, concept, tier });

      if (tier === 'p1') {
        if (p1.length < caps.p1) p1.push(toConcept(row, name, 'p1', concept?.subject));
      } else if (tier === 'p2') {
        if (p2.length < caps.p2) p2.push(toConcept(row, name, 'p2', concept?.subject));
      } else if (tier === 'p3') {
        if (p3.length < caps.p3) p3.push(toConcept(row, name, 'p3', concept?.subject));
      }
    }

    const estimatedStudyTime    = p1.length * MIN_PER_PRIORITY +
                                  p2.length * MIN_PER_FOCUS +
                                  p3.length * MIN_PER_REINFORCED;
    const recommendedQuestions  = Math.min(
      p1.length * Q_PER_PRIORITY + p2.length * Q_PER_FOCUS, 40,
    );
    const recommendedFlashcards = Math.min(
      p1.length * FC_PER_PRIORITY + p2.length * FC_PER_FOCUS + p3.length * FC_PER_REINFORCED, 30,
    );

    return {
      rx: {
        strategy:  'adaptive',
        enabled:   true,
        p1,
        p2,
        p3,
        priority: p1,
        focus: p2,
        reinforced: p3,
        estimatedStudyTime,
        recommendedQuestions,
        recommendedFlashcards,
      },
      candidates,
    };
  }
}

function tierRank(tier: ReviewTier): number {
  if (tier === 'p1' || tier === 'priority') return 0;
  if (tier === 'p2' || tier === 'focus') return 1;
  if (tier === 'p3' || tier === 'reinforced') return 2;
  return 3;
}
