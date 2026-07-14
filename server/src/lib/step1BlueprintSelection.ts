// Backend port of the Step 1 Standard Block content-area blueprint.
//
// Mirrors STEP1_STANDARD_BLOCK_BLUEPRINT / getStep1BlueprintGroup /
// selectStandardizedStep1Questions in medica-app/src/lib/mockQuestions.js.
// The frontend algorithm operates on the bundled local bank; this module
// applies the same group/count/dedup intent to the server-owned reviewed
// question pool so an authenticated Step 1 Standard Block never has to fall
// back to the frontend's answer-bearing local bank to stay blueprint-balanced.
// Keep the two group/count/area definitions in sync if the content-area mix
// changes — there is no shared runtime module across the Vite/CJS boundary.

export interface Step1BlueprintGroup {
  id: string;
  count: number;
  areas: string[];
}

export const STEP1_STANDARD_BLOCK_BLUEPRINT: readonly Step1BlueprintGroup[] = Object.freeze([
  { id: 'human-development', count: 1, areas: ['Human Development'] },
  { id: 'blood-immune', count: 2, areas: ['Blood & Lymphoreticular System', 'Immune System'] },
  { id: 'behavioral-neuro', count: 2, areas: ['Behavioral Health', 'Nervous System & Special Senses'] },
  { id: 'musculoskeletal-skin', count: 2, areas: ['Musculoskeletal System', 'Skin & Subcutaneous Tissue'] },
  { id: 'cardiovascular', count: 2, areas: ['Cardiovascular System'] },
  { id: 'respiratory-renal', count: 3, areas: ['Respiratory System', 'Renal & Urinary System'] },
  { id: 'gastrointestinal', count: 1, areas: ['Gastrointestinal System'] },
  {
    id: 'reproductive-endocrine',
    count: 3,
    areas: [
      'Pregnancy, Childbirth, & the Puerperium',
      'Female and Transgender Reproductive System & Breast',
      'Male and Transgender Reproductive System',
      'Endocrine System',
    ],
  },
  { id: 'multisystem', count: 2, areas: ['Multisystem Processes & Disorders'] },
  {
    id: 'biostatistics-epidemiology',
    count: 1,
    areas: ['Biostatistics, Epidemiology/Population Health, & Interpretation of the Medical Literature'],
  },
  { id: 'social-sciences', count: 1, areas: ['Social Sciences'] },
]);

export const STEP1_BLUEPRINT_TARGET_COUNT = STEP1_STANDARD_BLOCK_BLUEPRINT.reduce((sum, g) => sum + g.count, 0);

const AREA_TO_GROUP = new Map<string, string>(
  STEP1_STANDARD_BLOCK_BLUEPRINT.flatMap((group) => group.areas.map((area) => [area, group.id] as const)),
);

function getBlueprintGroupId(question: Record<string, unknown>): string | null {
  const area = question['usmleContentArea'];
  if (typeof area !== 'string' || !area) return null;
  return AREA_TO_GROUP.get(area) ?? null;
}

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled;
}

export class InsufficientBlueprintCoverageError extends Error {
  constructor(public readonly available: number, public readonly requested: number) {
    super(`Reviewed question pool cannot fill a blueprint-balanced Step 1 Standard Block (found ${available} of ${requested}).`);
    this.name = 'InsufficientBlueprintCoverageError';
  }
}

/**
 * Selects a blueprint-balanced Step 1 Standard Block from a pool of reviewed,
 * server-owned questions (authored QBank content plus reused/generated bank
 * content — never the frontend's bundled local bank). Fills each content-area
 * group up to its quota first, avoiding a repeated testedConcept/topic when an
 * alternative exists, then tops off any remainder from the full pool under the
 * same dedup constraint.
 *
 * Throws InsufficientBlueprintCoverageError if targetCount questions cannot be
 * assembled even after the remainder pass — callers must fail the request
 * clearly rather than serve a short or unbalanced block.
 */
export function selectStep1BlueprintBlock<T extends Record<string, unknown>>(
  pool: T[],
  targetCount: number = STEP1_BLUEPRINT_TARGET_COUNT,
): T[] {
  const target = Number(targetCount) || STEP1_BLUEPRINT_TARGET_COUNT;

  // Blueprint quotas only apply to the canonical 20-item Step 1 Standard Block
  // size — mirrors selectStandardizedStep1Questions's own early return.
  if (target !== STEP1_BLUEPRINT_TARGET_COUNT) {
    const shuffled = shuffle(pool);
    if (shuffled.length < target) {
      throw new InsufficientBlueprintCoverageError(shuffled.length, target);
    }
    return shuffled.slice(0, target);
  }

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const selectedConcepts = new Set<string>();
  const selectedTopics = new Set<string>();

  const canSelect = (question: T): boolean => {
    const id = String(question['id'] ?? '');
    const concept = normalizeKey(question['testedConcept']);
    const topic = normalizeKey(question['topic'] ?? question['usmleSubdomain']);
    return (!id || !selectedIds.has(id))
      && (!concept || !selectedConcepts.has(concept))
      && (!topic || !selectedTopics.has(topic));
  };
  const addQuestion = (question: T): void => {
    selected.push(question);
    const id = String(question['id'] ?? '');
    if (id) selectedIds.add(id);
    const concept = normalizeKey(question['testedConcept']);
    const topic = normalizeKey(question['topic'] ?? question['usmleSubdomain']);
    if (concept) selectedConcepts.add(concept);
    if (topic) selectedTopics.add(topic);
  };

  for (const group of STEP1_STANDARD_BLOCK_BLUEPRINT) {
    const candidates = shuffle(
      pool.filter((question) => getBlueprintGroupId(question) === group.id && canSelect(question)),
    );
    let groupSelected = 0;
    for (const question of candidates) {
      if (!canSelect(question)) continue;
      addQuestion(question);
      groupSelected += 1;
      if (groupSelected === group.count) break;
    }
  }

  if (selected.length < target) {
    const remaining = shuffle(pool.filter(canSelect));
    for (const question of remaining) {
      if (!canSelect(question)) continue;
      addQuestion(question);
      if (selected.length === target) break;
    }
  }

  if (selected.length < target) {
    throw new InsufficientBlueprintCoverageError(selected.length, target);
  }

  return shuffle(selected);
}
